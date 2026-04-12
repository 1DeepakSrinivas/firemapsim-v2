"use client";

import { Layer, Line, Rect, Stage } from "react-konva";
import { useEffect, useMemo, useState } from "react";

import type { PolygonFeature } from "./types";

export type DrawingTool = "select" | "pen" | "rectangle" | "eraser";

type Point = { x: number; y: number };

type FreeLine = {
  id: string;
  points: number[];
};

type DraftRect = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type KonvaDrawingLayerProps = {
  width: number;
  height: number;
  activeTool: DrawingTool;
  map: import("leaflet").Map | null;
  onShapeCommit: (feature: PolygonFeature) => void;
  clearSignal: number;
};

const STROKE_COLOR = "#f97316";

function pointsToPolygon(points: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push({ x: points[i] ?? 0, y: points[i + 1] ?? 0 });
  }
  return out;
}

function closePolygon(points: Point[]): Point[] {
  if (points.length < 3) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return points;
  }
  if (first.x === last.x && first.y === last.y) {
    return points;
  }
  return [...points, { x: first.x, y: first.y }];
}

function commitPolygon(
  map: import("leaflet").Map,
  points: Point[],
  onShapeCommit: (feature: PolygonFeature) => void,
) {
  const closed = closePolygon(points);
  if (closed.length < 4) {
    return;
  }

  const ring: [number, number][] = closed.map((point) => {
    const ll = map.containerPointToLatLng([point.x, point.y]);
    return [ll.lng, ll.lat];
  });

  onShapeCommit({
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties: {
      source: "konva-drawing",
      committedAt: Date.now(),
    },
  });
}

export default function KonvaDrawingLayer({
  width,
  height,
  activeTool,
  map,
  onShapeCommit,
  clearSignal,
}: KonvaDrawingLayerProps) {
  const [lines, setLines] = useState<FreeLine[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);

  const pointerEvents =
    activeTool === "eraser" || activeTool === "select" ? "none" : "auto";

  const stageStyle = useMemo(
    () => ({
      position: "absolute" as const,
      inset: 0,
      pointerEvents: pointerEvents as "none" | "auto",
      zIndex: 430,
    }),
    [pointerEvents],
  );

  useEffect(() => {
    setLines([]);
    setDraftRect(null);
    setDrawing(false);
  }, [clearSignal]);

  return (
    <Stage
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      style={stageStyle}
      onMouseDown={(event) => {
        if (!map) {
          return;
        }
        const stage = event.target.getStage();
        const point = stage?.getPointerPosition();
        if (!point) {
          return;
        }

        if (activeTool === "select") {
          return;
        }

        if (activeTool === "pen") {
          setDrawing(true);
          setLines((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              points: [point.x, point.y],
            },
          ]);
          return;
        }

        if (activeTool === "rectangle") {
          setDrawing(true);
          setDraftRect({
            startX: point.x,
            startY: point.y,
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
          });
        }
      }}
      onMouseMove={(event) => {
        if (!drawing || !map) {
          return;
        }

        const stage = event.target.getStage();
        const point = stage?.getPointerPosition();
        if (!point) {
          return;
        }

        if (activeTool === "pen") {
          setLines((prev) => {
            const last = prev[prev.length - 1];
            if (!last) {
              return prev;
            }
            const updated: FreeLine = {
              ...last,
              points: [...last.points, point.x, point.y],
            };
            return [...prev.slice(0, -1), updated];
          });
          return;
        }

        if (activeTool === "rectangle") {
          setDraftRect((prev) => {
            if (!prev) {
              return prev;
            }

            const x = Math.min(prev.startX, point.x);
            const y = Math.min(prev.startY, point.y);
            const width = Math.abs(point.x - prev.startX);
            const height = Math.abs(point.y - prev.startY);

            return {
              ...prev,
              x,
              y,
              width,
              height,
            };
          });
        }
      }}
      onMouseUp={() => {
        if (!map) {
          setDrawing(false);
          return;
        }

        if (activeTool === "select") {
          return;
        }

        if (activeTool === "pen") {
          const last = lines[lines.length - 1];
          if (last) {
            const poly = pointsToPolygon(last.points);
            commitPolygon(map, poly, onShapeCommit);
          }
          setDrawing(false);
          return;
        }

        if (activeTool === "rectangle" && draftRect) {
          const rectPoints: Point[] = [
            { x: draftRect.x, y: draftRect.y },
            { x: draftRect.x + draftRect.width, y: draftRect.y },
            {
              x: draftRect.x + draftRect.width,
              y: draftRect.y + draftRect.height,
            },
            { x: draftRect.x, y: draftRect.y + draftRect.height },
          ];
          commitPolygon(map, rectPoints, onShapeCommit);
          setDraftRect(null);
        }

        setDrawing(false);
      }}
    >
      <Layer>
        {lines.map((line) => (
          <Line
            key={line.id}
            points={line.points}
            stroke={STROKE_COLOR}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
            tension={0.2}
          />
        ))}

        {draftRect ? (
          <Rect
            x={draftRect.x}
            y={draftRect.y}
            width={draftRect.width}
            height={draftRect.height}
            stroke={STROKE_COLOR}
            strokeWidth={2}
            dash={[6, 4]}
            fill="rgba(249, 115, 22, 0.12)"
          />
        ) : null}
      </Layer>
    </Stage>
  );
}
