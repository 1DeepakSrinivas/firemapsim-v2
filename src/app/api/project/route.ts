import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";
import { computeUrlSlugFromClerk } from "@/lib/url-slug";
import { getLocalUserById, upsertLocalUserFromClerk } from "@/lib/user-store";
import { defaultIgnitionPlan } from "@/types/ignitionPlan";

export const runtime = "nodejs";

function defaultWeather() {
  return {
    windSpeed: 10,
    windDirection: 225,
    temperature: 72,
    humidity: 38,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Create a new map project for the signed-in user. */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const profile = await getLocalUserById(userId);
    const urlSlug =
      profile?.urlSlug ?? computeUrlSlugFromClerk(clerkUser?.username ?? null, userId);

    const plan = defaultIgnitionPlan();
    const w = defaultWeather();
    plan.windSpeed = w.windSpeed;
    plan.windDegree = w.windDirection;

    const title = `Untitled project - ${randomSuffix()}`;

    const { data, error } = await supabase
      .from("map_projects")
      .insert({
        user_id: userId,
        title,
        plan,
        weather: w,
        agent_chat_intro_done: false,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id, urlSlug });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
