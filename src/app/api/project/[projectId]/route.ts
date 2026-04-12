import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  x: z.number(),
  y: z.number(),
  time: z.number(),
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
  plan: z.record(z.string(), z.unknown()),
  weather: weatherSchema,
  lastSimulation: z.union([lastSimulationSchema, z.null()]).optional(),
});

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

  const { data: project, error: pErr } = await supabase
    .from("map_projects")
    .select("id, title, plan, weather, last_simulation, updated_at, user_id")
    .eq("id", projectId)
    .maybeSingle();

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

  const rawSim = project.last_simulation;
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
    updatePayload.last_simulation = body.lastSimulation;
  }

  const { data, error } = await supabase
    .from("map_projects")
    .update(updatePayload)
    .eq("id", projectId)
    .eq("user_id", userId)
    .select("id, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: data?.id,
    updatedAt: data?.updated_at,
  });
}
