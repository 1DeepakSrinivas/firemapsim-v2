/**
 * US ZIP → coordinates. Uses Zippopotam’s `/us/{zip}` API (United States only — no global geocoding).
 * Open-Meteo is used only for the forecast at those coordinates.
 */

export type ZipGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;

/** Same rough extent as the map’s US maxBounds (50 states + DC). */
const US_LAT_MIN = 17.0;
const US_LAT_MAX = 71.5;
const US_LNG_MIN = -180.0;
const US_LNG_MAX = -65.0;

export function normalizeUsZip(input: string): string | null {
  const t = input.trim();
  if (!US_ZIP_RE.test(t)) return null;
  return t.slice(0, 5);
}

function assertWithinUsMapExtent(lat: number, lng: number): void {
  if (
    lat < US_LAT_MIN ||
    lat > US_LAT_MAX ||
    lng < US_LNG_MIN ||
    lng > US_LNG_MAX
  ) {
    throw new Error("Resolved coordinates are outside the supported United States map area.");
  }
}

type ZippopotamResponse = {
  country?: string;
  places?: Array<{
    latitude?: string;
    longitude?: string;
    "place name"?: string;
    state?: string;
  }>;
};

/**
 * Resolve a 5-digit US ZIP (optionally ZIP+4) to lat/lng via Zippopotam (`/us/` only).
 */
export async function geocodeUsZip(zip: string): Promise<ZipGeocodeResult> {
  const z = normalizeUsZip(zip);
  if (!z) {
    throw new Error("Enter a valid US ZIP code (5 digits, optional +4).");
  }

  const res = await fetch(`https://api.zippopotam.us/us/${z}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) {
    throw new Error(`ZIP ${z} was not found in the United States.`);
  }
  if (!res.ok) {
    throw new Error(`ZIP lookup failed (${res.status}).`);
  }

  const json = (await res.json()) as ZippopotamResponse;
  if (json.country && json.country !== "United States") {
    throw new Error("Only US ZIP codes are supported.");
  }

  const place = json.places?.[0];
  if (!place?.latitude || !place.longitude) {
    throw new Error(`No coordinates returned for ZIP ${z}.`);
  }

  const lat = Number(place.latitude);
  const lng = Number(place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Invalid coordinates for ZIP ${z}.`);
  }

  assertWithinUsMapExtent(lat, lng);

  const label = [place["place name"], place.state].filter(Boolean).join(", ");

  return {
    lat,
    lng,
    label: label || `ZIP ${z}, US`,
  };
}
