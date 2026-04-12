import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { computeUrlSlugFromClerk } from "@/lib/url-slug";
import { getLocalUserById, upsertLocalUserFromClerk } from "@/lib/user-store";

export const runtime = "nodejs";

export async function GET() {
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

  const row = await getLocalUserById(userId);
  const urlSlug =
    row?.urlSlug ?? computeUrlSlugFromClerk(clerkUser?.username ?? null, userId);

  return NextResponse.json({ urlSlug });
}
