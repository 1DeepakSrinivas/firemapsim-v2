export const DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS = 180_000;

export function parseTimeoutMs(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
