import { createTool } from "@mastra/core/tools";
import z from "zod";

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().positive().optional(),
});

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.string(),
    coordinates: z.unknown(),
  }),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const outputSchema = z.object({
  geojson: featureSchema,
  bbox: bboxSchema,
});

function bboxAround(lat: number, lng: number, radiusMeters: number) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const deltaLat = radiusMeters / metersPerDegreeLat;
  const deltaLng = radiusMeters / Math.max(metersPerDegreeLng, 1e-6);

  const minLng = lng - deltaLng;
  const minLat = lat - deltaLat;
  const maxLng = lng + deltaLng;
  const maxLat = lat + deltaLat;

  return [minLng, minLat, maxLng, maxLat] as const;
}

function polygonBbox(
  coordinates: number[][],
): [number, number, number, number] {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}

async function tryOvertureParcel(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<z.infer<typeof outputSchema> | null> {
  const [minLng, minLat, maxLng, maxLat] = bboxAround(lat, lng, radiusMeters);
  const url = new URL("https://overturemaps.org/download/");
  url.searchParams.set("type", "parcel");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);

  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const features = z
    .array(
      z.object({
        type: z.literal("Feature"),
        geometry: z.object({
          type: z.union([z.literal("Polygon"), z.literal("MultiPolygon")]),
          coordinates: z.unknown(),
        }),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .safeParse((json as { features?: unknown }).features);

  if (!features.success || features.data.length === 0) {
    return null;
  }

  const feature = features.data[0];

  if (feature.geometry.type === "Polygon") {
    const ring = z.array(z.tuple([z.number(), z.number()])).parse(
      (feature.geometry.coordinates as unknown[][][])[0],
    );
    return {
      geojson: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: feature.geometry.coordinates,
        },
        properties: feature.properties ?? {},
      },
      bbox: polygonBbox(ring),
    };
  }

  const multi = z
    .array(z.array(z.array(z.tuple([z.number(), z.number()]))))
    .parse(feature.geometry.coordinates);
  const firstRing = multi[0]?.[0];
  if (!firstRing || firstRing.length === 0) {
    return null;
  }

  return {
    geojson: {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: feature.geometry.coordinates,
      },
      properties: feature.properties ?? {},
    },
    bbox: polygonBbox(firstRing),
  };
}

async function overpassBoundary(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<z.infer<typeof outputSchema>> {
  const query = `[out:json][timeout:25];relation(around:${Math.round(
    radiusMeters,
  )},${lat},${lng})["type"="boundary"];out geom 1;`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Overpass boundary lookup failed (${response.status} ${response.statusText})`,
    );
  }

  const json = await response.json();
  const elements = z
    .array(
      z.object({
        type: z.string(),
        geometry: z
          .array(
            z.object({
              lat: z.number(),
              lon: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .parse((json as { elements?: unknown }).elements ?? []);

  const withGeometry = elements.find(
    (el) => el.type === "relation" && el.geometry && el.geometry.length >= 3,
  );

  if (!withGeometry?.geometry) {
    const [minLng, minLat, maxLng, maxLat] = bboxAround(lat, lng, radiusMeters);
    const fallbackCoords = [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ] as number[][];

    return {
      geojson: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [fallbackCoords],
        },
        properties: {
          source: "fallback-bbox",
        },
      },
      bbox: [minLng, minLat, maxLng, maxLat],
    };
  }

  const ring: number[][] = withGeometry.geometry.map((point) => [
    point.lon,
    point.lat,
  ]);

  if (
    ring.length > 0 &&
    (ring[0]?.[0] !== ring[ring.length - 1]?.[0] ||
      ring[0]?.[1] !== ring[ring.length - 1]?.[1])
  ) {
    ring.push([ring[0]![0], ring[0]![1]]);
  }

  return {
    geojson: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
      properties: {
        source: "overpass-boundary",
      },
    },
    bbox: polygonBbox(ring),
  };
}

export const fetchParcelBoundary = createTool({
  id: "geo-fetch-parcel-boundary",
  description:
    "Fetch parcel/area boundary GeoJSON using Overture GERS with Overpass fallback.",
  inputSchema,
  outputSchema,
  execute: async ({ lat, lng, radiusMeters = 250 }) => {
    const overtureResult = await tryOvertureParcel(lat, lng, radiusMeters);
    if (overtureResult) {
      return overtureResult;
    }

    return overpassBoundary(lat, lng, radiusMeters);
  },
});
