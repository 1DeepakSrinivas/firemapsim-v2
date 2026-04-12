"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";

type SimulationStats = {
  burning: number;
  burned: number;
  unburned: number;
  updatedAt: number | null;
  weatherSource?: string;
};

type SimulationEventPayload = {
  type?: string;
  payload?: unknown;
  data?: unknown;
  stage?: string;
};

function normalizeOverlay(payload: unknown): FireOverlayPoint[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const value = item as Record<string, unknown>;
      const x = Number(value.x ?? 0);
      const y = Number(value.y ?? 0);
      const time = Number(value.time ?? 0);
      const op = String(value.Operation ?? value.state ?? "").toLowerCase();

      let state: FireOverlayPoint["state"] = "unburned";
      if (op.includes("burning") || op.includes("ignite")) {
        state = "burning";
      } else if (op.includes("burned") || op.includes("burn")) {
        state = "burned";
      }

      return {
        x,
        y,
        time,
        state,
      } satisfies FireOverlayPoint;
    })
    .filter((item): item is FireOverlayPoint => item !== null);
}

function normalizePerimeter(payload: unknown): PerimeterGeoJSON {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybe = payload as Record<string, unknown>;
  if (
    maybe.type === "Feature" ||
    maybe.type === "LineString" ||
    maybe.type === "Polygon"
  ) {
    return maybe as PerimeterGeoJSON;
  }

  return null;
}

function buildStats(points: FireOverlayPoint[]): SimulationStats {
  let burning = 0;
  let burned = 0;
  let unburned = 0;

  for (const point of points) {
    if (point.state === "burning") {
      burning += 1;
    } else if (point.state === "burned") {
      burned += 1;
    } else {
      unburned += 1;
    }
  }

  return {
    burning,
    burned,
    unburned,
    updatedAt: Date.now(),
  };
}

export function useSimulationStream(simulationId: string | null) {
  const [fireOverlay, setFireOverlay] = useState<FireOverlayPoint[]>([]);
  const [perimeterGeoJSON, setPerimeterGeoJSON] = useState<PerimeterGeoJSON>(null);
  const [stats, setStats] = useState<SimulationStats>({
    burning: 0,
    burned: 0,
    unburned: 0,
    updatedAt: null,
  });
  const [streamStatus, setStreamStatus] = useState<"idle" | "open" | "closed" | "error">("idle");

  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!simulationId) {
      setFireOverlay([]);
      setPerimeterGeoJSON(null);
      setStats({
        burning: 0,
        burned: 0,
        unburned: 0,
        updatedAt: null,
      });
      setStreamStatus("idle");
      return;
    }

    setFireOverlay([]);
    setPerimeterGeoJSON(null);
    setStats({
      burning: 0,
      burned: 0,
      unburned: 0,
      updatedAt: null,
    });

    const source = new EventSource(`/api/simulation/stream?${simulationId}`);
    sourceRef.current = source;
    setStreamStatus("open");

    const onSimulationEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as SimulationEventPayload;
        const data = payload.data ?? payload.payload ?? payload;

        const operations =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>).operations
            : data;

        const overlay = normalizeOverlay(operations);
        if (overlay.length > 0) {
          setFireOverlay(overlay);
          setStats((prev) => ({
            ...prev,
            ...buildStats(overlay),
          }));
        }

        const perimeter =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>).perimeterGeoJSON
            : null;
        const parsedPerimeter = normalizePerimeter(perimeter);
        if (parsedPerimeter) {
          setPerimeterGeoJSON(parsedPerimeter);
        }

        const weatherSource =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>).weatherSource
            : undefined;
        if (typeof weatherSource === "string") {
          setStats((prev) => ({
            ...prev,
            weatherSource,
          }));
        }
      } catch {
        setStreamStatus("error");
      }
    };

    const onSimulationResult = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        const operations = payload.operations;
        const overlay = normalizeOverlay(operations);
        if (overlay.length > 0) {
          setFireOverlay(overlay);
          setStats((prev) => ({
            ...prev,
            ...buildStats(overlay),
          }));
        }

        const perimeter = normalizePerimeter(payload.perimeterGeoJSON);
        if (perimeter) {
          setPerimeterGeoJSON(perimeter);
        }
      } finally {
        source.close();
        setStreamStatus("closed");
      }
    };

    const onSimulationError = () => {
      setStreamStatus("error");
      source.close();
    };

    source.addEventListener("simulation-event", onSimulationEvent);
    source.addEventListener("simulation-result", onSimulationResult);
    source.addEventListener("simulation-error", onSimulationError);
    source.onerror = onSimulationError;

    return () => {
      source.removeEventListener("simulation-event", onSimulationEvent);
      source.removeEventListener("simulation-result", onSimulationResult);
      source.removeEventListener("simulation-error", onSimulationError);
      source.close();
      sourceRef.current = null;
      setStreamStatus("closed");
    };
  }, [simulationId]);

  const derived = useMemo(
    () => ({
      fireOverlay,
      perimeterGeoJSON,
      stats,
      streamStatus,
    }),
    [fireOverlay, perimeterGeoJSON, stats, streamStatus],
  );

  return derived;
}
