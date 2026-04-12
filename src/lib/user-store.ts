import "server-only";

import { supabase } from "@/lib/supabase";
import { computeUrlSlugFromClerk } from "@/lib/url-slug";

type UpsertUserInput = {
  clerkUserId: string;
  email?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  username?: string | null;
};

export async function upsertLocalUserFromClerk(input: UpsertUserInput) {
  const now = new Date().toISOString();
  let urlSlug = computeUrlSlugFromClerk(input.username, input.clerkUserId);

  for (let attempt = 0; attempt < 8; attempt++) {
    // Omit image_url so PostgREST accepts older DBs missing that column; optional column can be added via migration.
    const { error } = await supabase.from("users").upsert(
      {
        id: input.clerkUserId,
        email: input.email ?? null,
        name: input.name ?? null,
        url_slug: urlSlug,
        updated_at: now,
      },
      { onConflict: "id" },
    );

    if (!error) return;

    if (error.code === "23505" && attempt < 7) {
      const suffix = Math.random().toString(36).slice(2, 6);
      urlSlug = `${computeUrlSlugFromClerk(input.username, input.clerkUserId)}-${suffix}`;
      continue;
    }

    throw error;
  }
}

export async function getLocalUserById(id: string) {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();

  if (error) {
    return null;
  }

  if (!data) return null;

  return {
    id: data.id as string,
    email: data.email as string | null,
    name: data.name as string | null,
    imageUrl: data.image_url as string | null,
    urlSlug: data.url_slug as string | null,
    createdAt: data.created_at ? new Date(data.created_at as string) : null,
    updatedAt: data.updated_at ? new Date(data.updated_at as string) : null,
  };
}
