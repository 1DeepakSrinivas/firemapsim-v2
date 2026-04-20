"use client";

import type { FireOverlayPoint } from "./types";
import { LogoMarkIcon } from "@/components/brand/LogoMarkIcon";

type FireOverlayProps = {
  points: FireOverlayPoint[];
};

export default function FireOverlay({ points }: FireOverlayProps) {
  const burning = points.filter((p) => p.state === "burning").length;
  const burned = points.filter((p) => p.state === "burned").length;

  if (points.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-450 flex gap-2">
      {burning > 0 && (
        <div className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-[#1a1a1a]/90 px-3 py-1.5 text-[11px] backdrop-blur">
          <LogoMarkIcon className="h-4 w-4" alt="FireMapSim-v2" />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Live Fire Points</p>
            <p className="font-semibold text-red-400">{burning.toLocaleString()}</p>
          </div>
        </div>
      )}
      {burned > 0 && (
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1a1a1a]/90 px-3 py-1.5 text-[11px] backdrop-blur">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Burned</p>
            <p className="font-semibold text-white/60">{burned.toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
