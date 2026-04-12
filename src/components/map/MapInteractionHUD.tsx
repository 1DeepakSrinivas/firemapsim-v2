"use client";

import { AnimatePresence, motion } from "motion/react";
import { X, Check } from "lucide-react";
import type { MapInteractionMode } from "./MapInteractionLayer";

const INSTRUCTIONS: Record<NonNullable<MapInteractionMode>, string> = {
  pin: "Click anywhere on the map to drop the ignition pin",
  line: "Click to set the start point, then click again to set the end point",
  polyline: "Click to add nodes along the fuel break path — press Escape to finish",
  polygon: "Click to add boundary nodes — double-click to close the polygon",
  rect: "Click to set the first corner, then click again to set the opposite corner",
};

export function MapInteractionHUD({
  mode,
  canConfirm,
  onConfirm,
  onCancel,
  hint,
}: {
  mode: MapInteractionMode;
  canConfirm?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  /** Short warning (e.g. placement rejected). */
  hint?: string | null;
}) {
  return (
    <AnimatePresence>
      {mode ? (
        <motion.div
          key="hud"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto absolute inset-x-0 top-3 z-500 mx-auto flex max-w-[min(100%,420px)] flex-col items-center gap-1.5"
        >
          <div className="flex w-fit items-center gap-3 rounded-full border border-white/15 bg-[#1a1a1a]/95 px-4 py-2 shadow-2xl backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
          <span className="text-[11px] text-white/70">{INSTRUCTIONS[mode]}</span>
          {canConfirm && onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1 rounded-full bg-orange-500/30 px-2.5 py-1 text-[10px] font-medium text-orange-200 transition hover:bg-orange-500/45"
            >
              <Check className="h-3 w-3" />
              Done
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[10px] text-white/50 transition hover:bg-white/15 hover:text-white/80"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
          </div>
          {hint ? (
            <motion.p
              key={hint}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-center text-[10px] text-amber-200/90"
            >
              {hint}
            </motion.p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
