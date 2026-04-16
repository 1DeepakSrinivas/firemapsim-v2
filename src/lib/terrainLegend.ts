/**
 * Shared terrain color scales for map overlay + progress legend.
 * Must stay in sync with DEVS-FIRE matrix semantics (fuel model id, degrees, aspect).
 */

export type LegendStop = { label: string; color: string };

/** Fuel model buckets (matches FireMapClient fuelColor) */
export const FUEL_LEGEND_STOPS: LegendStop[] = [
  { label: "0 / empty", color: "transparent" },
  { label: "1–3 grass", color: "rgba(134,239,172,0.85)" },
  { label: "4–7 shrub", color: "rgba(234,179,8,0.85)" },
  { label: "8–13 timber", color: "rgba(249,115,22,0.85)" },
  { label: "14+ heavy", color: "rgba(239,68,68,0.85)" },
];

/** Slope gradient keyframes (0° → 60°+) */
export const SLOPE_LEGEND_STOPS: LegendStop[] = [
  { label: "0°", color: "rgba(59,130,246,0.75)" },
  { label: "15°", color: "rgba(100,180,200,0.75)" },
  { label: "30°", color: "rgba(180,160,80,0.75)" },
  { label: "45°+", color: "rgba(220,80,40,0.75)" },
];

export function fuelColorForCell(v: number): string {
  if (v <= 0) return "transparent";
  if (v <= 3) return "rgba(134,239,172,0.45)";
  if (v <= 7) return "rgba(234,179,8,0.45)";
  if (v <= 13) return "rgba(249,115,22,0.45)";
  return "rgba(239,68,68,0.45)";
}

export function fuelLabelForCell(v: number): string {
  if (v <= 0) return "Empty";
  if (v <= 3) return "Grass";
  if (v <= 7) return "Shrub";
  if (v <= 13) return "Timber";
  return "Heavy";
}

export function slopeColorForCell(v: number): string {
  if (v <= 0) return "transparent";
  const t = Math.min(v / 60, 1);
  const r = Math.round(59 + t * 196);
  const g = Math.round(130 - t * 130);
  const b = Math.round(246 - t * 246);
  return `rgba(${r},${g},${b},0.45)`;
}

export function aspectColorForCell(v: number): string {
  if (v < 0) return "transparent";
  const hue = Math.round(v) % 360;
  return `hsla(${hue},70%,55%,0.4)`;
}

export const ASPECT_LEGEND_CAPTION =
  "Hue = aspect (0–360°); downslope direction of steepest grade.";

export function activeTerrainLayer(
  show: Set<string>,
): "fuel" | "slope" | "aspect" | null {
  if (show.has("fuel")) return "fuel";
  if (show.has("slope")) return "slope";
  if (show.has("aspect")) return "aspect";
  return null;
}
