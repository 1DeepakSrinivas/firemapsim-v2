const DEVS_FIRE_HOSTNAME = "firesim.cs.gsu.edu";
const DEVS_FIRE_CANONICAL_BASE_URL = "https://firesim.cs.gsu.edu/api";

export const DEFAULT_DEVS_FIRE_TIMEOUT_MS = 180_000;
export const DEFAULT_DEVS_FIRE_RETRIES = 2;

function normalizedPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function normalizeDevsFireBaseUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) {
    return DEVS_FIRE_CANONICAL_BASE_URL;
  }

  const withoutTrailingSlash = candidate.replace(/\/+$/, "");

  try {
    const parsed = new URL(withoutTrailingSlash);
    if (parsed.hostname === DEVS_FIRE_HOSTNAME) {
      const path = normalizedPathname(parsed.pathname);
      const isDeprecatedLegacyBase = parsed.port === "8084" && path === "/api";
      const isRootHost = path === "/";
      const isApiHost = path === "/api";

      if (isDeprecatedLegacyBase || isRootHost || isApiHost) {
        return DEVS_FIRE_CANONICAL_BASE_URL;
      }
    }
  } catch {
    return withoutTrailingSlash;
  }

  return withoutTrailingSlash;
}

export function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DEVS_FIRE_TIMEOUT_MS;
  }
  return Math.max(1_000, Math.floor(parsed));
}

export const DEVS_FIRE_BASE_URL = normalizeDevsFireBaseUrl(
  process.env.DEVS_FIRE_BASE_URL,
);
export const DEVS_FIRE_TIMEOUT_MS = parseTimeoutMs(
  process.env.DEVS_FIRE_REQUEST_TIMEOUT_MS,
);

export const DEVS_FIRE_WIND_FLOW_ENABLED =
  process.env.DEVS_FIRE_ENABLE_WINDFLOW === "1" ||
  process.env.DEVS_FIRE_ENABLE_WINDFLOW?.toLowerCase() === "true";

export const DEVS_FIRE_SESSION_COOKIE_NAME = "devs_fire_session";
