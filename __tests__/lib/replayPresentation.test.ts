import { describe, expect, test } from "bun:test";

import {
  deriveEffectiveReplayOverlay,
  deriveEffectiveReplayPerimeter,
  derivePanelFireStats,
  startReplayFromBeginning,
  type ReplaySurfaceInput,
} from "@/lib/replayPresentation";
import type { FireOverlayPoint } from "@/components/map/types";
import type { LatestSimulationReplay, LatestSimulationSummary } from "@/types/latestSimulation";

function sampleOverlay(): FireOverlayPoint[] {
  return [
    { x: 10, y: 10, state: "burning", time: 0 },
    { x: 11, y: 10, state: "burned", time: 1 },
    { x: 12, y: 10, state: "unburned", time: 1 },
  ];
}

function sampleSummary(overlayPreview: FireOverlayPoint[]): LatestSimulationSummary {
  return {
    completedAt: "2026-04-20T00:00:00.000Z",
    weatherSource: "dynamic",
    hasExactReplay: true,
    operationCount: 3,
    stats: {
      burning: 7,
      burned: 30,
      unburned: 63,
    },
    finalMetrics: {
      burnedArea: 1,
      perimeterLength: 2,
      burningCells: 3,
      unburnedCells: 4,
    },
    gridMeta: {
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      projCenterLat: 37.77,
      projCenterLng: -122.44,
    },
    overlayPreview,
  };
}

function sampleReplay(overlay: FireOverlayPoint[]): LatestSimulationReplay {
  const summary = sampleSummary(overlay);
  return {
    summary,
    manifest: {
      startedAt: "2026-04-20T00:00:00.000Z",
      completedAt: "2026-04-20T00:00:05.000Z",
      baseUrl: "https://firesim.cs.gsu.edu/api",
      projectId: "project-1",
      terrainMode: "online",
      weatherMode: "static",
      planSnapshot: {} as any,
      weatherFetched: {} as any,
      weatherUsed: {} as any,
      weatherOverrideApplied: [],
      setupCalls: [],
      executionCalls: [],
    },
    operations: [],
    overlay,
    perimeterGeoJSON: {
      type: "LineString",
      coordinates: [
        [-122.44, 37.77],
        [-122.43, 37.78],
      ],
    },
    finalMetrics: {
      perimeterCells: [],
      burnedArea: 1,
      perimeterLength: 2,
      burningCells: 3,
      unburnedCells: 4,
    },
  };
}

function baseInput(): ReplaySurfaceInput {
  const overlay = sampleOverlay();
  return {
    replayState: "idle",
    replayFrame: null,
    latestSimulationReplay: sampleReplay(overlay),
    latestSimulationSummary: sampleSummary(overlay),
    idleReplayHidden: true,
  };
}

describe("replay presentation helpers", () => {
  test("hides replay output in idle when idle replay is hidden", () => {
    const input = baseInput();
    expect(deriveEffectiveReplayOverlay(input)).toEqual([]);
    expect(deriveEffectiveReplayPerimeter(input)).toBeNull();
  });

  test("shows frame-driven overlay while playing/paused", () => {
    const input = baseInput();
    const frame: FireOverlayPoint[] = [{ x: 99, y: 99, state: "burning", time: 0 }];
    expect(
      deriveEffectiveReplayOverlay({
        ...input,
        replayState: "playing",
        replayFrame: frame,
      }),
    ).toEqual(frame);
    expect(
      deriveEffectiveReplayOverlay({
        ...input,
        replayState: "paused",
        replayFrame: frame,
      }),
    ).toEqual(frame);
  });

  test("prefers summary stats in idle hidden mode", () => {
    const input = baseInput();
    const effectiveOverlay = deriveEffectiveReplayOverlay(input);
    expect(
      derivePanelFireStats({
        replayState: "idle",
        idleReplayHidden: true,
        latestSimulationSummary: input.latestSimulationSummary,
        effectiveOverlay,
      }),
    ).toEqual(input.latestSimulationSummary!.stats);
  });

  test("uses effective overlay stats while playing", () => {
    const input = baseInput();
    const frame: FireOverlayPoint[] = [
      { x: 1, y: 1, state: "burning", time: 0 },
      { x: 2, y: 1, state: "burned", time: 0 },
    ];
    const effectiveOverlay = deriveEffectiveReplayOverlay({
      ...input,
      replayState: "playing",
      replayFrame: frame,
    });
    expect(
      derivePanelFireStats({
        replayState: "playing",
        idleReplayHidden: true,
        latestSimulationSummary: input.latestSimulationSummary,
        effectiveOverlay,
      }),
    ).toEqual({ burning: 1, burned: 1, unburned: 0 });
  });
});

describe("startReplayFromBeginning", () => {
  test("applies replay start updates in deterministic order", () => {
    const callOrder: string[] = [];
    const replayCursorRef = { current: 999 };
    startReplayFromBeginning({
      setIdleReplayHidden: (value) => {
        callOrder.push(`hidden:${value}`);
      },
      replayCursorRef,
      setReplayCursor: (value) => {
        callOrder.push(`cursor:${String(value)}`);
      },
      setReplayFrame: (value) => {
        callOrder.push(`frame:${Array.isArray(value) ? value.length : "null"}`);
      },
      setReplayState: (value) => {
        callOrder.push(`state:${value}`);
      },
    });

    expect(replayCursorRef.current).toBe(0);
    expect(callOrder).toEqual([
      "hidden:true",
      "cursor:0",
      "frame:0",
      "state:playing",
    ]);
  });
});
