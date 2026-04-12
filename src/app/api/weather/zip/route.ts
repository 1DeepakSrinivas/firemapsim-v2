import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { geocodeUsZip } from "@/lib/weather/geocodeUsZip";
import { fetchCurrentWeatherForCoords } from "@/lib/weather/openMeteoCurrent";

const querySchema = z.object({
  zip: z.string().min(3).max(12),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const zip = request.nextUrl.searchParams.get("zip");
    const parsed = querySchema.safeParse({ zip: zip ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid zip parameter" }, { status: 400 });
    }

    const { lat, lng, label } = await geocodeUsZip(parsed.data.zip);
    const { weather, source } = await fetchCurrentWeatherForCoords(lat, lng);

    return NextResponse.json({
      weather,
      source,
      placeLabel: label,
      lat,
      lng,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
