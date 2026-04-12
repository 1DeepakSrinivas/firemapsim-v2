import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const projectIdSchema = z.string().uuid();

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Atomically sets `agent_chat_intro_done` from false → true for this user/project.
 * Returns `{ claimed: true }` only if this request won the race (first opener).
 * Used so the starter prompt card is shown once per project.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }
  const projectId = parsed.data;

  const { data, error } = await supabase
    .from("map_projects")
    .update({
      agent_chat_intro_done: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("agent_chat_intro_done", false)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[POST chat-intro] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ claimed: Boolean(data) });
}
