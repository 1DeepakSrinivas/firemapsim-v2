import { createTool } from "@mastra/core/tools";
import z from "zod";

const inputSchema = z.object({
  address: z.string().min(1),
});

const outputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  displayName: z.string(),
});

const nominatimResultSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
});

export const geocodeAddress = createTool({
  id: "geo-geocode-address",
  description: "Geocode a human-readable address with Nominatim.",
  inputSchema,
  outputSchema,
  execute: async ({ address }) => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "FireSimApp/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Nominatim geocoding failed (${response.status} ${response.statusText})`,
      );
    }

    const data = await response.json();
    const parsedArray = z.array(nominatimResultSchema).safeParse(data);

    if (!parsedArray.success || parsedArray.data.length === 0) {
      throw new Error(`No geocoding result found for address: ${address}`);
    }

    const first = parsedArray.data[0];
    return {
      lat: first.lat,
      lng: first.lon,
      displayName: first.display_name,
    };
  },
});
