import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { geocodeUsZip, normalizeUsZip } from "@/lib/weather/geocodeUsZip";
import { fetchCurrentWeatherForCoords } from "@/lib/weather/openMeteoCurrent";

const querySchema = z.object({
  q: z.string().min(2).max(120).optional(),
  zip: z.string().min(3).max(12).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

const US_LAT_MIN = 17.0;
const US_LAT_MAX = 71.5;
const US_LNG_MIN = -180.0;
const US_LNG_MAX = -65.0;

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

async function reverseGeocodeAddress(lat: number, lng: number): Promise<{
  label: string;
  county?: string;
  state?: string;
}> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "FireMapSim-v2/1.0" },
    cache: "no-store",
  });

  if (!response.ok) {
    return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  }

  const data = (await response.json()) as {
    display_name?: string;
    address?: {
      county?: string;
      state?: string;
      city?: string;
      town?: string;
      village?: string;
    };
  };

  const addr = data.address;
  if (addr) {
    const parts = [addr.city || addr.town || addr.village || addr.county, addr.state].filter(Boolean);
    if (parts.length > 0) {
      return {
        label: parts.join(", "),
        county: addr.county,
        state: addr.state,
      };
    }
  }

  return {
    label: data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    county: addr?.county,
    state: addr?.state,
  };
}

async function geocodeUsAddress(query: string): Promise<{
  lat: number;
  lng: number;
  label: string;
}> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "FireMapSim-v2/1.0" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status})`);
  }

  const rows = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;
  const first = rows[0];
  if (!first?.lat || !first.lon) {
    throw new Error("No matching place found.");
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Address lookup returned invalid coordinates.");
  }

  assertWithinUsMapExtent(lat, lng);

  return {
    lat,
    lng,
    label: first.display_name ?? query,
  };
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      zip: request.nextUrl.searchParams.get("zip") ?? undefined,
      lat: request.nextUrl.searchParams.get("lat") ?? undefined,
      lng: request.nextUrl.searchParams.get("lng") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing or invalid weather lookup parameters" },
        { status: 400 },
      );
    }

    let lat: number;
    let lng: number;
    let label: string;
    let county: string | undefined;
    let state: string | undefined;

    if (
      typeof parsed.data.lat === "number" &&
      typeof parsed.data.lng === "number"
    ) {
      lat = parsed.data.lat;
      lng = parsed.data.lng;
      const reverse = await reverseGeocodeAddress(lat, lng);
      label = reverse.label;
      county = reverse.county;
      state = reverse.state;
    } else {
      const query = parsed.data.q ?? parsed.data.zip;
      if (!query) {
        return NextResponse.json(
          { error: "Provide q (city/address/zip) or lat+lng" },
          { status: 400 },
        );
      }

      const normalizedZip = normalizeUsZip(query);
      if (normalizedZip) {
        const zipResult = await geocodeUsZip(normalizedZip);
        lat = zipResult.lat;
        lng = zipResult.lng;
        label = zipResult.label;
      } else {
        const placeResult = await geocodeUsAddress(query);
        lat = placeResult.lat;
        lng = placeResult.lng;
        label = placeResult.label;
      }
    }

    const { weather, source } = await fetchCurrentWeatherForCoords(lat, lng);

    return NextResponse.json({
      weather,
      source,
      placeLabel: label,
      lat,
      lng,
      county,
      state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
