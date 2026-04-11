import { createTool } from "@mastra/core/tools";
import z from "zod";

const inputSchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  cellResolution: z.number().positive().optional(),
});

const outputSchema = z.object({
  fuelMap: z.string(),
  slopeMap: z.string(),
  aspectMap: z.string(),
});

const MAX_GRID_POINTS = 900;

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

function toMapString(grid: number[][]): string {
  return grid.map((row) => row.map((v) => Number(v.toFixed(2))).join(" ")).join("\n");
}

function reshapeFlat(values: number[], rows: number, cols: number): number[][] {
  const result: number[][] = [];
  for (let r = 0; r < rows; r += 1) {
    result.push(values.slice(r * cols, (r + 1) * cols));
  }
  return result;
}

function extractElevation(data: unknown): number | null {
  if (typeof data === "number" && Number.isFinite(data)) {
    return data;
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidates: unknown[] = [
    record.value,
    record.elevation,
    record.Elevation,
    (record.USGS_Elevation_Point_Query_Service as Record<string, unknown> | undefined)
      ?.Elevation_Query &&
      ((record.USGS_Elevation_Point_Query_Service as Record<string, unknown>)
        .Elevation_Query as Record<string, unknown>).Elevation,
  ];

  for (const candidate of candidates) {
    const parsed = z.coerce.number().safeParse(candidate);
    if (parsed.success && Number.isFinite(parsed.data)) {
      return parsed.data;
    }
  }

  return null;
}

async function fetchElevationPoint(lat: number, lng: number): Promise<number> {
  const url = new URL("https://epqs.nationalmap.gov/v1/json");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("units", "Meters");
  url.searchParams.set("wkid", "4326");

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `USGS EPQS request failed (${response.status} ${response.statusText})`,
    );
  }

  const data = await response.json();
  const elevation = extractElevation(data);
  if (elevation === null) {
    throw new Error("USGS EPQS response missing elevation value");
  }

  return elevation;
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  limit: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(inputs.length);
  let cursor = 0;

  async function worker() {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(inputs[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, worker),
  );

  return results;
}

function nlcdToFuelModel(nlcdClass: number): number {
  if (nlcdClass === 11 || nlcdClass === 12) return 98;
  if (nlcdClass >= 21 && nlcdClass <= 24) return 99;
  if (nlcdClass === 31) return 1;
  if (nlcdClass === 41 || nlcdClass === 42 || nlcdClass === 43) return 8;
  if (nlcdClass === 52) return 5;
  if (nlcdClass === 71) return 2;
  if (nlcdClass === 81) return 2;
  if (nlcdClass === 82) return 3;
  if (nlcdClass === 90 || nlcdClass === 95) return 9;
  return 2;
}

function tryExtractNumericGrid(
  data: unknown,
  rows: number,
  cols: number,
): number[][] | null {
  if (Array.isArray(data) && data.length === rows && data.every(Array.isArray)) {
    const candidate = data as unknown[];
    const parsed = z.array(z.array(z.coerce.number())).safeParse(candidate);
    if (parsed.success) {
      return parsed.data.map((row) => row.slice(0, cols));
    }
  }

  if (Array.isArray(data)) {
    const flat = z.array(z.coerce.number()).safeParse(data);
    if (flat.success && flat.data.length >= rows * cols) {
      return reshapeFlat(flat.data.slice(0, rows * cols), rows, cols);
    }
  }

  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const extracted = tryExtractNumericGrid(value, rows, cols);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

async function fetchNlcdFuelGrid(
  bbox: [number, number, number, number],
  rows: number,
  cols: number,
): Promise<number[][] | null> {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  const url = new URL("https://www.mrlc.gov/api");
  url.searchParams.set("service", "WCS");
  url.searchParams.set("request", "GetCoverage");
  url.searchParams.set("version", "2.0.1");
  url.searchParams.set("coverageId", "NLCD_2021_Land_Cover_L48");
  url.searchParams.append("subset", `Long(${minLng},${maxLng})`);
  url.searchParams.append("subset", `Lat(${minLat},${maxLat})`);
  url.searchParams.set("format", "application/json");
  url.searchParams.set("width", String(cols));
  url.searchParams.set("height", String(rows));

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const grid = tryExtractNumericGrid(data, rows, cols);
  if (!grid) {
    return null;
  }

  return grid.map((row) => row.map(nlcdToFuelModel));
}

function computeSlopeAndAspect(
  elevation: number[][],
  xResolutionMeters: number,
  yResolutionMeters: number,
): { slope: number[][]; aspect: number[][] } {
  const rows = elevation.length;
  const cols = elevation[0]?.length ?? 0;

  const slope: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  const aspect: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const left = elevation[r]?.[Math.max(c - 1, 0)] ?? elevation[r]![c]!;
      const right = elevation[r]?.[Math.min(c + 1, cols - 1)] ?? elevation[r]![c]!;
      const up = elevation[Math.max(r - 1, 0)]?.[c] ?? elevation[r]![c]!;
      const down = elevation[Math.min(r + 1, rows - 1)]?.[c] ?? elevation[r]![c]!;

      const dzdx = (right - left) / (2 * Math.max(xResolutionMeters, 1));
      const dzdy = (down - up) / (2 * Math.max(yResolutionMeters, 1));

      const slopeDeg =
        (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI;
      slope[r]![c] = slopeDeg;

      const aspectDeg =
        (Math.atan2(dzdy, -dzdx) * 180) / Math.PI + (dzdx === 0 && dzdy === 0 ? 0 : 0);
      aspect[r]![c] = (aspectDeg + 360) % 360;
    }
  }

  return { slope, aspect };
}

export const fetchTerrainData = createTool({
  id: "geo-fetch-terrain-data",
  description:
    "Fetch elevation and land-cover data, then build DEVS-FIRE fuel, slope, and aspect maps.",
  inputSchema,
  outputSchema,
  execute: async ({ bbox, cellResolution = 30 }) => {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const widthMeters = haversineMeters(centerLat, minLng, centerLat, maxLng);
    const heightMeters = haversineMeters(minLat, centerLng, maxLat, centerLng);

    let cols = Math.max(2, Math.round(widthMeters / cellResolution));
    let rows = Math.max(2, Math.round(heightMeters / cellResolution));

    if (rows * cols > MAX_GRID_POINTS) {
      const factor = Math.sqrt((rows * cols) / MAX_GRID_POINTS);
      rows = Math.max(2, Math.round(rows / factor));
      cols = Math.max(2, Math.round(cols / factor));
    }

    const points = Array.from({ length: rows * cols }, (_, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const lat = lerp(maxLat, minLat, row / Math.max(rows - 1, 1));
      const lng = lerp(minLng, maxLng, col / Math.max(cols - 1, 1));
      return { lat, lng };
    });

    const elevationsFlat = await mapWithConcurrency(points, 12, async (point) => {
      try {
        return await fetchElevationPoint(point.lat, point.lng);
      } catch {
        return 0;
      }
    });

    const elevationGrid = reshapeFlat(elevationsFlat, rows, cols);

    const xResolutionMeters = widthMeters / Math.max(cols - 1, 1);
    const yResolutionMeters = heightMeters / Math.max(rows - 1, 1);
    const { slope, aspect } = computeSlopeAndAspect(
      elevationGrid,
      xResolutionMeters,
      yResolutionMeters,
    );

    const nlcdFuel = await fetchNlcdFuelGrid(bbox, rows, cols);
    if (!nlcdFuel) {
      console.warn(
        "NLCD unavailable. Falling back to uniform fuel model 2 (grass).",
      );
    }

    const fuelGrid = nlcdFuel ??
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => 2));

    return {
      fuelMap: toMapString(fuelGrid),
      slopeMap: toMapString(slope),
      aspectMap: toMapString(aspect),
    };
  },
});
