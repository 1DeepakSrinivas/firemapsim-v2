import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";
import type { LatestSimulationReplay, LatestSimulationSummary } from "@/types/latestSimulation";

export type ReplayPlaybackState = "idle" | "playing" | "paused";

export type ReplaySurfaceInput = {
  replayState: ReplayPlaybackState;
  replayFrame: FireOverlayPoint[] | null;
  latestSimulationReplay: LatestSimulationReplay | null;
  latestSimulationSummary: LatestSimulationSummary | null;
  idleReplayHidden: boolean;
};

export function statsFromOverlay(points: FireOverlayPoint[]) {
  let burning = 0;
  let burned = 0;
  let unburned = 0;
  for (const p of points) {
    if (p.state === "burning") burning += 1;
    else if (p.state === "burned") burned += 1;
    else unburned += 1;
  }
  return { burning, burned, unburned };
}

export function deriveEffectiveReplayOverlay(
  input: ReplaySurfaceInput,
): FireOverlayPoint[] {
  if (input.replayState === "idle") {
    if (input.idleReplayHidden) return [];
    return (
      input.latestSimulationReplay?.overlay ??
      input.latestSimulationSummary?.overlayPreview ??
      []
    );
  }
  if (input.replayFrame) return input.replayFrame;
  return [];
}

export function deriveEffectiveReplayPerimeter(
  input: ReplaySurfaceInput,
): PerimeterGeoJSON {
  if (input.replayState === "idle" && input.idleReplayHidden) {
    return null;
  }
  if (input.replayState === "idle") {
    return input.latestSimulationReplay?.perimeterGeoJSON ?? null;
  }
  return null;
}

export function derivePanelFireStats(input: {
  replayState: ReplayPlaybackState;
  idleReplayHidden: boolean;
  latestSimulationSummary: LatestSimulationSummary | null;
  effectiveOverlay: FireOverlayPoint[];
}) {
  if (
    input.replayState === "idle" &&
    input.idleReplayHidden &&
    input.latestSimulationSummary
  ) {
    return input.latestSimulationSummary.stats;
  }
  return statsFromOverlay(input.effectiveOverlay);
}

export function startReplayFromBeginning(input: {
  setIdleReplayHidden: (value: boolean) => void;
  replayCursorRef: { current: number };
  setReplayCursor: (value: number | null) => void;
  setReplayFrame: (value: FireOverlayPoint[] | null) => void;
  setReplayState: (value: ReplayPlaybackState) => void;
}) {
  // Guard idle rendering while we transition into playback.
  input.setIdleReplayHidden(true);
  input.replayCursorRef.current = 0;
  input.setReplayCursor(0);
  input.setReplayFrame([]);
  input.setReplayState("playing");
}
