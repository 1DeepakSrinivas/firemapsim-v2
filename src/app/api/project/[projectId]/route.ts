import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UIMessage } from "ai";
import { z } from "zod";

import {
  dedupeMessagesById,
  loadProjectChatMessages,
  replaceProjectChatMessages,
} from "@/lib/projectChatStore";
import { sanitizeLastSimulationForDb } from "@/lib/projectPersistence";
import { supabase } from "@/lib/supabase";
import { upsertLocalUserFromClerk } from "@/lib/user-store";
import type { LastSimulationSnapshot } from "@/types/lastSimulation";
import { defaultIgnitionPlan, type IgnitionPlan } from "@/types/ignitionPlan";

export const runtime = "nodejs";

const projectIdSchema = z.string().uuid();

const weatherSchema = z.object({
  windSpeed: z.number(),
  windDirection: z.number(),
  temperature: z.number(),
  humidity: z.number(),
});

const firePointSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  time: z.coerce.number(),
  state: z.enum(["burning", "burned", "unburned"]),
});

const lastSimulationSchema = z.object({
  overlay: z.array(firePointSchema),
  perimeterGeoJSON: z.unknown().nullable(),
  weatherSource: z.string().optional(),
  completedAt: z.string(),
});

const putBodySchema = z.object({
  title: z.string().min(1).max(240),
  /** Full IgnitionPlan JSON — use loose validation so nested GeoJSON/arrays always round-trip. */
  plan: z.any(),
  weather: weatherSchema,
  lastSimulation: z.union([lastSimulationSchema, z.null()]).optional(),
  /** Serialized AI SDK UI messages for the project agent chat. */
  agentChatMessages: z.array(z.unknown()).optional(),
  agentChatIntroDone: z.boolean().optional(),
});

type ProjectSelectCandidate = {
  select: string;
  hasLastSimulation: boolean;
  hasAgentChat: boolean;
};

type CompatError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type MapProjectCompatRow = {
  id: string;
  title: string;
  plan: unknown;
  weather: unknown;
  updated_at: string | null;
  user_id: string;
  last_simulation?: unknown;
  agent_chat_messages?: unknown;
  agent_chat_intro_done?: boolean;
};

type ProjectUpdateResultRow = {
  id: string;
  updated_at: string | null;
};

function toCompatError(error: unknown, fallbackMessage: string): CompatError {
  if (error && typeof error === "object" && "message" in error) {
    const e = error as {
      message: string;
      code?: string | null;
      details?: string | null;
      hint?: string | null;
    };
    return {
      message: e.message ?? fallbackMessage,
      code: e.code,
      details: e.details,
      hint: e.hint,
    };
  }
  return { message: fallbackMessage };
}

const PROJECT_SELECT_CANDIDATES: ProjectSelectCandidate[] = [
  {
    select:
      "id, title, plan, weather, last_simulation, updated_at, user_id, agent_chat_messages, agent_chat_intro_done",
    hasLastSimulation: true,
    hasAgentChat: true,
  },
  {
    select:
      "id, title, plan, weather, updated_at, user_id, agent_chat_messages, agent_chat_intro_done",
    hasLastSimulation: false,
    hasAgentChat: true,
  },
  {
    select: "id, title, plan, weather, updated_at, user_id",
    hasLastSimulation: false,
    hasAgentChat: false,
  },
];

async function fetchProjectCompat(projectId: string) {
  for (const candidate of PROJECT_SELECT_CANDIDATES) {
    const { data, error } = await supabase
      .from("map_projects")
      .select(candidate.select)
      .eq("id", projectId)
      .maybeSingle();

    if (!error) {
      return {
        data: (data as MapProjectCompatRow | null) ?? null,
        error: null,
        hasLastSimulation: candidate.hasLastSimulation,
        hasAgentChat: candidate.hasAgentChat,
      };
    }

    const isMissingColumn = error.code === "42703";
    if (!isMissingColumn) {
      return {
        data: null,
        error: toCompatError(error, "Failed to load project."),
        hasLastSimulation: false,
        hasAgentChat: false,
      };
    }
  }

  return {
    data: null,
    error: {
      message: "Failed to load project with compatible column set.",
    },
    hasLastSimulation: false,
    hasAgentChat: false,
  };
}

async function updateProjectCompat(
  projectId: string,
  userId: string,
  payload: Record<string, unknown>,
) {
  const updatePayload: Record<string, unknown> = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("map_projects")
      .update(updatePayload)
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("id, updated_at")
      .maybeSingle();

    if (!error) {
      return { data: (data as ProjectUpdateResultRow | null) ?? null, error: null };
    }

    if (error.code !== "42703") {
      return { data: null, error: toCompatError(error, "Failed to update project.") };
    }

    const message = error.message ?? "";
    let removedAny = false;

    if (message.includes("last_simulation") && "last_simulation" in updatePayload) {
      delete updatePayload.last_simulation;
      removedAny = true;
    }

    if (
      (message.includes("agent_chat_messages") ||
        message.includes("agent_chat_intro_done")) &&
      ("agent_chat_messages" in updatePayload ||
        "agent_chat_intro_done" in updatePayload)
    ) {
      delete updatePayload.agent_chat_messages;
      delete updatePayload.agent_chat_intro_done;
      removedAny = true;
    }

    if (!removedAny) {
      return { data: null, error: toCompatError(error, "Failed to update project.") };
    }
  }

  return {
    data: null,
    error: {
      message: "Project update failed after compatibility fallbacks.",
    },
  };
}

function defaultWeather() {
  return {
    windSpeed: 10,
    windDirection: 225,
    temperature: 72,
    humidity: 38,
  };
}

function coercePlan(raw: unknown): IgnitionPlan {
  if (raw && typeof raw === "object") {
    return raw as IgnitionPlan;
  }
  return defaultIgnitionPlan();
}

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const projectId = parsed.data;

  const {
    data: project,
    error: pErr,
    hasLastSimulation,
    hasAgentChat,
  } = await fetchProjectCompat(projectId);

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (project.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: owner, error: oErr } = await supabase
    .from("users")
    .select("url_slug")
    .eq("id", project.user_id)
    .maybeSingle();

  if (oErr || !owner?.url_slug) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawSim = hasLastSimulation
    ? (project as { last_simulation?: unknown }).last_simulation
    : null;
  let lastSimulation: LastSimulationSnapshot | null = null;
  if (rawSim && typeof rawSim === "object") {
    const parsed = lastSimulationSchema.safeParse(rawSim);
    if (parsed.success) {
      lastSimulation = {
        overlay: parsed.data.overlay,
        perimeterGeoJSON: parsed.data.perimeterGeoJSON as LastSimulationSnapshot["perimeterGeoJSON"],
        weatherSource: parsed.data.weatherSource,
        completedAt: parsed.data.completedAt,
      };
    }
  }

  const rawChat = hasAgentChat
    ? (project as { agent_chat_messages?: unknown }).agent_chat_messages
    : [];
  const legacyAgentChatMessages = Array.isArray(rawChat)
    ? dedupeMessagesById(rawChat as UIMessage[])
    : [];
  let agentChatMessages = legacyAgentChatMessages;

  const tableChat = await loadProjectChatMessages(projectId);
  if (!tableChat.error) {
    if (tableChat.messages.length > 0 || legacyAgentChatMessages.length === 0) {
      agentChatMessages = tableChat.messages;
    }
  } else if (
    tableChat.error.code !== "42703" &&
    tableChat.error.code !== "PGRST204"
  ) {
    console.error("[GET /api/project] chat_messages load error:", tableChat.error);
  }

  const agentChatIntroDone = hasAgentChat
    ? Boolean((project as { agent_chat_intro_done?: boolean }).agent_chat_intro_done)
    : false;

  return NextResponse.json({
    exists: true,
    id: project.id,
    ownerSlug: owner.url_slug as string,
    title: project.title,
    plan: coercePlan(project.plan),
    weather:
      project.weather && typeof project.weather === "object"
        ? { ...defaultWeather(), ...(project.weather as object) }
        : defaultWeather(),
    lastSimulation,
    agentChatMessages,
    agentChatIntroDone,
    updatedAt: project.updated_at,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }
  const projectId = parsed.data;

  let body: z.infer<typeof putBodySchema>;
  try {
    const json = await request.json();
    body = putBodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const clerkUser = await currentUser();
  try {
    await upsertLocalUserFromClerk({
      clerkUserId: userId,
      username: clerkUser?.username ?? null,
      email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
      name:
        [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
        clerkUser?.username ||
        null,
      imageUrl: clerkUser?.imageUrl ?? null,
    });
  } catch (syncErr) {
    const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
    console.error("[PUT /api/project] upsertLocalUserFromClerk failed:", syncErr);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("map_projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (findErr || !existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = body.plan as IgnitionPlan;

  const updatePayload: Record<string, unknown> = {
    title: body.title,
    plan,
    weather: body.weather,
    updated_at: new Date().toISOString(),
  };
  if (body.lastSimulation !== undefined) {
    updatePayload.last_simulation =
      body.lastSimulation === null
        ? null
        : sanitizeLastSimulationForDb(
            body.lastSimulation as LastSimulationSnapshot,
          );
  }

  let fallbackLegacyChat: UIMessage[] | null = null;
  if (body.agentChatMessages !== undefined) {
    const dedupedMessages = dedupeMessagesById(body.agentChatMessages as UIMessage[]);
    const chatWrite = await replaceProjectChatMessages({
      projectId,
      actorClerkUserId: userId,
      messages: dedupedMessages,
    });
    if (chatWrite.error) {
      const missingChatColumns =
        chatWrite.error.code === "42703" || chatWrite.error.code === "PGRST204";
      if (missingChatColumns) {
        fallbackLegacyChat = dedupedMessages;
      } else {
        console.error("[PUT /api/project] chat_messages write error:", chatWrite.error);
        return NextResponse.json(
          {
            error: chatWrite.error.message,
            ...(process.env.NODE_ENV === "development"
              ? { code: chatWrite.error.code }
              : {}),
          },
          { status: 500 },
        );
      }
    }
  }

  if (fallbackLegacyChat) {
    updatePayload.agent_chat_messages = fallbackLegacyChat;
  }

  if (body.agentChatIntroDone !== undefined) {
    updatePayload.agent_chat_intro_done = body.agentChatIntroDone;
  }

  const { data, error } = await updateProjectCompat(projectId, userId, updatePayload);

  if (error) {
    console.error("[PUT /api/project] Supabase update error:", error);
    const dev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: error.message,
        ...(dev
          ? {
              code: error.code,
              details: error.details,
              hint: error.hint,
            }
          : {}),
      },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Project was not updated (not found or access denied)." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data?.id,
    updatedAt: data?.updated_at,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }
  const projectId = parsed.data;

  const { data: existing, error: findErr } = await supabase
    .from("map_projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (findErr || !existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: deleteErr } = await supabase
    .from("map_projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: projectId });
}
