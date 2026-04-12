"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";
import {
  buildStats,
  normalizeOverlay,
  normalizePerimeter,
} from "@/lib/simulationOverlay";

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
  operations?: unknown;
};

export function useSimulationStream(simulationId: string | null) {
  const [fireOverlay, setFireOverlay] = useState<FireOverlayPoint[]>([]);
  const [perimeterGeoJSON, setPerimeterGeoJSON] = useState<PerimeterGeoJSON>(null);
  const [stats, setStats] = useState<SimulationStats>({
    burning: 0,
    burned: 0,
    unburned: 0,
    updatedAt: null,
  });
  const [streamStatus, setStreamStatus] = useState<"idle" | "open" | "closed" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);
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
    setErrorMessage(null);

    const source = new EventSource(`/api/simulation/stream?${simulationId}`);
    sourceRef.current = source;
    setStreamStatus("open");

    const applyOperations = (operations: unknown) => {
      const overlay = normalizeOverlay(operations);
      if (overlay.length > 0) {
        setFireOverlay(overlay);
        setStats((prev) => ({
          ...prev,
          ...buildStats(overlay),
        }));
      }
    };

    const onSimulationProgress = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as SimulationEventPayload;
        const data = payload.data ?? payload.payload ?? payload;
        if (typeof data === "object" && data !== null) {
          const ops = (data as Record<string, unknown>).operations;
          if (ops !== undefined) {
            applyOperations(ops);
          }
          const weatherSource = (data as Record<string, unknown>).weatherSource;
          if (typeof weatherSource === "string") {
            setStats((prev) => ({ ...prev, weatherSource }));
          }
        }
      } catch {
        setStreamStatus("error");
        setErrorMessage("Failed to parse simulation progress");
      }
    };

    const onSimulationResult = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        const operations = payload.operations;
        applyOperations(operations);

        const perimeter = normalizePerimeter(payload.perimeterGeoJSON);
        if (perimeter) {
          setPerimeterGeoJSON(perimeter);
        }

        const weatherSource = payload.weatherSource;
        if (typeof weatherSource === "string") {
          setStats((prev) => ({ ...prev, weatherSource }));
        }
      } finally {
        source.close();
        setStreamStatus("closed");
      }
    };

    const onSimulationError = (event: MessageEvent) => {
      let msg = "Simulation stream failed";
      try {
        const payload = JSON.parse(event.data) as { error?: string };
        if (typeof payload.error === "string") {
          msg = payload.error;
        }
      } catch {
        /* use default */
      }
      setErrorMessage(msg);
      setStreamStatus("error");
      source.close();
    };

    source.addEventListener("simulation-progress", onSimulationProgress);
    source.addEventListener("simulation-result", onSimulationResult);
    source.addEventListener("simulation-error", onSimulationError);
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      setErrorMessage("EventSource connection error");
      setStreamStatus("error");
      source.close();
    };

    return () => {
      source.removeEventListener("simulation-progress", onSimulationProgress);
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
      errorMessage,
    }),
    [fireOverlay, perimeterGeoJSON, stats, streamStatus, errorMessage],
  );

  return derived;
}
