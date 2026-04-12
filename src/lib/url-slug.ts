/**
 * Stable URL segment for a Clerk user. Prefer username; fallback to sanitized id.
 */
export function computeUrlSlugFromClerk(
  username: string | null | undefined,
  clerkUserId: string,
): string {
  const raw = username?.trim();
  if (raw) {
    const s = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (s.length >= 2) return s;
  }
  const short = clerkUserId.replace(/^user_/, "").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  return `user-${short || "anon"}`;
}
