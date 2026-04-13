"use client";

import { useMemo } from "react";
import { CircleMarker, Polyline } from "react-leaflet";

import {
  gridCellCenterToLatLng,
  gridProjectionFromPlan,
  type GridProjectionParams,
} from "@/lib/gridProjection";
import type { IgnitionPlan } from "@/types/ignitionPlan";

const IGNITION_COLOR = "#dc2626";
const FUEL_BREAK_COLOR = "#2563eb";

function hasValidCenter(p: GridProjectionParams): boolean {
  return (
    Math.abs(p.projCenterLat) > 1e-9 || Math.abs(p.projCenterLng) > 1e-9
  );
}

export function PlanScenarioLayer({ plan }: { plan: IgnitionPlan }) {
  const gp = useMemo(() => gridProjectionFromPlan(plan), [plan]);

  if (!hasValidCenter(gp)) return null;

  const ignitionElements = plan.team_infos.flatMap((team, ti) =>
    team.details.map((seg, si) => {
      const key = `ig-${ti}-${si}-${seg.start_x}-${seg.start_y}-${seg.end_x}-${seg.end_y}`;
      const a = gridCellCenterToLatLng(seg.start_x, seg.start_y, gp);
      const b = gridCellCenterToLatLng(seg.end_x, seg.end_y, gp);
      const isPoint = seg.start_x === seg.end_x && seg.start_y === seg.end_y;
      if (isPoint) {
        return (
          <CircleMarker
            key={key}
            center={[a.lat, a.lng]}
            radius={4}
            pathOptions={{
              color: IGNITION_COLOR,
              fillColor: IGNITION_COLOR,
              fillOpacity: 0.85,
              weight: 2,
            }}
          />
        );
      }
      return (
        <Polyline
          key={key}
          positions={[
            [a.lat, a.lng],
            [b.lat, b.lng],
          ]}
          pathOptions={{ color: IGNITION_COLOR, weight: 2.5, opacity: 0.95 }}
        />
      );
    }),
  );

  const fuelBreakElements = plan.sup_infos.map((sup, idx) => {
    const key = `fb-${idx}-${sup.x1}-${sup.y1}-${sup.x2}-${sup.y2}`;
    const a = gridCellCenterToLatLng(sup.x1, sup.y1, gp);
    const b = gridCellCenterToLatLng(sup.x2, sup.y2, gp);
    const isPoint = sup.x1 === sup.x2 && sup.y1 === sup.y2;
    if (isPoint) {
      return (
        <CircleMarker
          key={key}
          center={[a.lat, a.lng]}
          radius={4}
          pathOptions={{
            color: FUEL_BREAK_COLOR,
            fillColor: FUEL_BREAK_COLOR,
            fillOpacity: 0.55,
            weight: 2,
          }}
        />
      );
    }
    return (
      <Polyline
        key={key}
        positions={[
          [a.lat, a.lng],
          [b.lat, b.lng],
        ]}
        pathOptions={{
          color: FUEL_BREAK_COLOR,
          weight: 2.5,
          dashArray: "5 5",
          opacity: 0.95,
        }}
      />
    );
  });

  return (
    <>
      {ignitionElements}
      {fuelBreakElements}
    </>
  );
}
