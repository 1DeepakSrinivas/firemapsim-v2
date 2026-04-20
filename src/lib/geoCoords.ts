export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasNonZeroCenter(lat: number, lng: number): boolean {
  return isFiniteNumber(lat) && isFiniteNumber(lng) && !(lat === 0 && lng === 0);
}

export function isValidGeodeticCenter(lat: number, lng: number): boolean {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
