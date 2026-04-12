"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Bot,
  ChevronRight,
  Crosshair,
  Database,
  Flame,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Play,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";

import { cn } from "@/lib/utils";
import {
  bootstrapTerrainSession,
  fetchTerrainMatrix,
} from "@/lib/devsFireBrowser";
import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type {
  ActionPayload,
  BoundaryGeoJSON,
  IgnitionPlan,
  SegmentEdit,
} from "@/types/ignitionPlan";
import { IGNITION_MODES, applySegmentEdit } from "@/types/ignitionPlan";
import type { MapInteractionMode } from "./MapInteractionLayer";

import { ActionModal, type ActionId, MAP_INTERACTION_ACTIONS } from "./ActionModal";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SimStats = {
  burning: number;
  burned: number;
  unburned: number;
  weatherSource?: string;
  streamStatus: string;
  shapes: number;
};

export type MapStyleId = "terrain" | "street" | "satellite";

type DrawerId = "scenario";

// ─── Shared primitives ────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl border border-white/10 bg-[#141414]/95 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/25 sm:mb-2 sm:text-[10px]">
      {children}
    </p>
  );
}

function ActionBtn({
  onClick,
  label,
  icon: Icon,
  variant = "ghost",
  disabled,
  title,
}: {
  onClick?: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "ghost" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-2.5 sm:text-[11px]",
        variant === "primary"
          ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
          : variant === "danger"
            ? "border border-red-500/25 bg-red-500/10 text-red-400/90 hover:bg-red-500/20"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90",
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
      {label}
    </button>
  );
}

function AccordionSection({
  id,
  open,
  onToggle,
  icon: Icon,
  label,
  children,
}: {
  id: DrawerId;
  open: boolean;
  onToggle: (id: DrawerId) => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/6 first:border-t-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors sm:px-3 sm:py-2.5",
          open ? "text-white" : "text-white/50 hover:text-white/80",
        )}
      >
        <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        <span className="flex-1 text-[10px] font-semibold tracking-wide sm:text-[11px]">{label}</span>
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-white/25 transition-transform duration-200 sm:h-3 sm:w-3",
            open && "rotate-90",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Inline editable value ────────────────────────────────────────────────────

function InlineEdit({
  label,
  value,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function commit() {
    const n = Number(draft);
    if (!Number.isNaN(n)) onCommit(n);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between py-1 sm:py-1.5">
      <span className="text-[10px] text-white/40 sm:text-[11px]">{label}</span>
      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          }}
          className="w-16 rounded border border-white/15 bg-white/8 px-1.5 py-0.5 text-right text-[10px] text-white outline-none focus:border-orange-400/50 sm:w-20 sm:px-2 sm:text-[11px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true); }}
          className="group flex items-center gap-1 text-[10px] text-white/70 hover:text-white sm:text-[11px]"
        >
          {value}{suffix ? ` ${suffix}` : ""}
          <span className="text-[8px] text-white/20 group-hover:text-white/40 sm:text-[9px]">✎</span>
        </button>
      )}
    </div>
  );
}

// ─── Progress panel ───────────────────────────────────────────────────────────

function ProgressPanel({ stats }: { stats?: SimStats }) {
  const isActive = stats?.streamStatus === "open";

  return (
    <Panel>
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Activity className="h-3 w-3 text-white/40 sm:h-3.5 sm:w-3.5" />
        <span className="flex-1 text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Simulation Progress
        </span>
        {isActive && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400 sm:text-[9px]">
            <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>
      <div className="p-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
          {[
            { label: "Burning", value: stats?.burning ?? 0, color: "text-red-400" },
            { label: "Burned", value: stats?.burned ?? 0, color: "text-orange-300" },
            { label: "Unburned", value: stats?.unburned ?? 0, color: "text-white/40" },
            { label: "Shapes", value: stats?.shapes ?? 0, color: "text-blue-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-white/5 bg-white/3 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="text-[9px] text-white/30 sm:text-[10px]">{label}</p>
              <p className={cn("text-xs font-semibold tabular-nums sm:text-sm", color)}>
                {value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        {stats?.weatherSource && (
          <p className="mt-1.5 text-[9px] text-white/25 sm:mt-2 sm:text-[10px]">
            Source: <span className="text-white/40">{stats.weatherSource}</span>
          </p>
        )}
      </div>
    </Panel>
  );
}

// ─── Run config panel ─────────────────────────────────────────────────────────

function RunConfigPanel({
  onStartSimulation,
  onAskAgent,
  onResetProject,
}: {
  onStartSimulation?: () => void;
  onAskAgent?: () => void;
  onResetProject?: () => void;
}) {
  const [hours, setHours] = useState(24);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <Panel className="w-[160px] sm:w-[175px] md:w-[190px]">
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Sliders className="h-3 w-3 text-white/40 sm:h-3.5 sm:w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Run Configuration
        </span>
      </div>
      <div className="space-y-2.5 p-2.5 sm:space-y-3 sm:p-3">
        {/* Hours stepper */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40 sm:text-[11px]">Sim hours</span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setHours((h) => Math.max(1, h - 1))}
              className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="w-7 text-center text-[10px] font-semibold text-white/80 sm:w-8 sm:text-[11px]">{hours}h</span>
            <button
              type="button"
              onClick={() => setHours((h) => Math.min(72, h + 1))}
              className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-[11px] text-white/50 hover:border-white/20 hover:text-white/80"
            >
              +
            </button>
          </div>
        </div>

        {/* Playback rate */}
        <div className="space-y-1 sm:space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40 sm:text-[11px]">Playback rate</span>
            <span className="text-[10px] font-semibold text-white/70 sm:text-[11px]">{playbackRate}×</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="w-full accent-orange-400"
          />
          <div className="flex justify-between text-[8px] text-white/20 sm:text-[9px]">
            <span>0.25×</span>
            <span>1×</span>
            <span>2×</span>
            <span>4×</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-1 pt-0.5 sm:space-y-1.5">
          <ActionBtn onClick={onStartSimulation} label="Start Simulation" icon={Play} variant="primary" />
          <ActionBtn onClick={onAskAgent} label="Ask Agent To Run" icon={Bot} />
          {onResetProject && (
            <>
              <ActionBtn
                onClick={() => setResetOpen(true)}
                label="Reset project"
                icon={RotateCcw}
                variant="danger"
              />
              <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogContent className="max-w-sm border-white/10 bg-[#141414] text-white shadow-xl">
                  <DialogTitle className="text-sm font-semibold tracking-tight text-white/90">
                    Reset project?
                  </DialogTitle>
                  <DialogDescription className="text-[11px] leading-relaxed text-white/55">
                    Clears the project location and boundary, ignition lines, fuel breaks, weather values, terrain
                    overlay selections, and stops the current simulation. This cannot be undone.
                  </DialogDescription>
                  <div className="flex justify-end gap-2 pt-1">
                    <DialogClose asChild>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </DialogClose>
                    <button
                      type="button"
                      onClick={() => {
                        onResetProject();
                        setResetOpen(false);
                      }}
                      className="rounded-lg bg-red-500/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-600"
                    >
                      Reset
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ─── Scenario + Weather/Layers accordion ─────────────────────────────────────

function toCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8] ?? "N";
}

const setupStep1Motion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

const setupStep2List = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

const setupStep2Item = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.16, ease: "easeOut" as const },
  },
};

function ScenarioPanel({
  weather,
  onWeatherOverride,
  onWeatherFetched,
  onActionConfirm,
  onRequestMapInteraction,
  onLocationSearchPreview,
  planPreview,
  mapRef,
  hasProjectLocation,
}: {
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
  /** Applied to scenario state and mirrored into project config (simulation). */
  onWeatherFetched?: (next: WeatherValues) => void;
  onActionConfirm?: (payload: ActionPayload) => void;
  onRequestMapInteraction?: (mode: MapInteractionMode, action?: "location" | "fuel-break") => void;
  onLocationSearchPreview?: (
    preview: {
      lat: number;
      lng: number;
      boundaryGeoJSON: BoundaryGeoJSON;
    } | null,
  ) => void;
  planPreview?: { segments: number; fuelBreaks: number; centerSet: boolean };
  mapRef?: import("leaflet").Map | null;
  hasProjectLocation: boolean;
}) {
  const [open, setOpen] = useState<DrawerId>("scenario");
  const [zipCode, setZipCode] = useState("");
  const [fetching, setFetching] = useState(false);
  const [zipFetchError, setZipFetchError] = useState<string | null>(null);
  const [zipFetchHint, setZipFetchHint] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);

  function handleActionBtnClick(id: ActionId) {
    if (id === "location" && hasProjectLocation) return;
    if (MAP_INTERACTION_ACTIONS.includes(id)) {
      if (!hasProjectLocation) return;
      // Go straight to map interaction — no modal
      const mode: MapInteractionMode = id === "point-ignition" ? "pin" : "line";
      onRequestMapInteraction?.(mode);
    } else {
      if (id === "fuel-break" && !hasProjectLocation) return;
      // location and fuel-break open their own dedicated modals
      setActiveAction(id);
    }
  }

  function toggle(id: DrawerId) {
    setOpen((prev) => (prev === id ? "scenario" : id));
  }

  async function handleFetch() {
    if (!zipCode.trim()) return;
    setFetching(true);
    setZipFetchError(null);
    setZipFetchHint(null);
    try {
      const res = await fetch(
        `/api/weather/zip?zip=${encodeURIComponent(zipCode.trim())}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        error?: string;
        weather?: WeatherValues;
        placeLabel?: string;
        source?: string;
      };
      if (!res.ok || !json.weather) {
        throw new Error(json.error ?? "Weather fetch failed");
      }
      onWeatherFetched?.(json.weather);
      setZipFetchHint(
        json.placeLabel
          ? `US ZIP → ${json.placeLabel} · forecast (Open-Meteo)`
          : "Current conditions loaded for US ZIP (Open-Meteo)",
      );
    } catch (e) {
      setZipFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  const hasWeather = weather.windSpeed > 0 || weather.temperature > 0;

  return (
    <Panel className="w-[min(92vw,280px)] min-w-[240px] sm:w-[270px] md:w-[290px]">
      <AccordionSection
        id="scenario"
        open={open === "scenario"}
        onToggle={toggle}
        icon={MapPin}
        label="Scenario Setup"
      >
        <div className="space-y-3 sm:space-y-4">
          {/* Setup actions — step 1 then staggered step 2 */}
          <div className="space-y-1 sm:space-y-1.5">
            <SectionLabel>Setup Actions</SectionLabel>
            <motion.div {...setupStep1Motion} className="space-y-1">
              <ActionBtn
                label={hasProjectLocation ? "Project location set" : "Set Project Location"}
                icon={MapPin}
                disabled={hasProjectLocation}
                title={
                  hasProjectLocation
                    ? "Only one project area per project. Use Reset project to choose a different location."
                    : undefined
                }
                onClick={() => handleActionBtnClick("location")}
              />
              {hasProjectLocation ? (
                <p className="text-[8px] leading-relaxed text-white/30 sm:text-[9px]">
                  One location per project. Reset project to replace the area.
                </p>
              ) : null}
            </motion.div>

            <AnimatePresence initial={false}>
              {hasProjectLocation ? (
                <motion.div
                  key="setup-step2"
                  variants={setupStep2List}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="space-y-1 sm:space-y-1.5"
                >
                  <p className="text-[8px] leading-relaxed text-white/30 sm:text-[9px]">
                    Ignition and fuel breaks must be placed inside the project area.
                  </p>
                  <motion.div variants={setupStep2Item}>
                    <ActionBtn
                      label="Define Point Ignition"
                      icon={Crosshair}
                      onClick={() => handleActionBtnClick("point-ignition")}
                    />
                  </motion.div>
                  <motion.div variants={setupStep2Item}>
                    <ActionBtn
                      label="Define Line Ignition"
                      icon={Zap}
                      onClick={() => handleActionBtnClick("line-ignition")}
                    />
                  </motion.div>
                  <motion.div variants={setupStep2Item}>
                    <ActionBtn
                      label="Define Fuel Break"
                      icon={Shield}
                      onClick={() => handleActionBtnClick("fuel-break")}
                    />
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {planPreview ? (
              <p className="pt-1 text-[8px] leading-relaxed text-white/30 sm:text-[9px]">
                Plan: {planPreview.centerSet ? "area set" : "no area"} · {planPreview.segments}{" "}
                segment{planPreview.segments === 1 ? "" : "s"} · {planPreview.fuelBreaks} break
                {planPreview.fuelBreaks === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          {/* Weather fetch */}
          <div className="space-y-1.5 border-t border-white/6 pt-2.5 sm:space-y-2 sm:pt-3">
            <SectionLabel>Weather Fetch</SectionLabel>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2">
              <input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="US ZIP code"
                inputMode="numeric"
                autoComplete="postal-code"
                className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white placeholder:text-white/25 outline-none focus:border-white/20 sm:px-3 sm:py-2 sm:text-[11px]"
              />
              <button
                type="button"
                onClick={() => void handleFetch()}
                disabled={!zipCode.trim() || fetching}
                className="min-h-[32px] shrink-0 rounded-lg bg-orange-500/20 px-3 py-1.5 text-[10px] font-medium text-orange-400 transition hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[72px] sm:px-4 sm:text-[11px]"
              >
                {fetching ? "…" : "Fetch"}
              </button>
            </div>
            {zipFetchError ? (
              <p className="text-[9px] leading-snug text-red-400/90 sm:text-[10px]">{zipFetchError}</p>
            ) : null}
            {zipFetchHint ? (
              <p className="text-[9px] leading-snug text-emerald-400/80 sm:text-[10px]">{zipFetchHint}</p>
            ) : (
              <p className="text-[9px] text-white/25 sm:text-[10px]">
                US ZIP codes only (lookup via Zippopotam). Forecast from Open-Meteo at that location. Values
                sync to the plan and Weather &amp; Layers; edits there override for the run.
              </p>
            )}
          </div>

          {/* Weather values */}
          <div className="border-t border-white/6 pt-2.5 sm:pt-3">
            <div className="mb-1.5 flex items-center justify-between sm:mb-2">
              <SectionLabel>
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Layers className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  Weather & Layers
                </span>
              </SectionLabel>
              {hasWeather && (
                <span className="mb-1.5 text-[8px] text-emerald-400 sm:mb-2 sm:text-[9px]">● Populated</span>
              )}
            </div>
            <div className="divide-y divide-white/5 rounded-lg border border-white/8 bg-white/3 px-2 sm:px-3">
              <InlineEdit label="Wind" value={weather.windSpeed} suffix={`mph ${toCompass(weather.windDirection)}`} onCommit={(v) => onWeatherOverride("windSpeed", v)} />
              <InlineEdit label="Direction" value={weather.windDirection} suffix="°" onCommit={(v) => onWeatherOverride("windDirection", v)} />
              <InlineEdit label="Temp" value={weather.temperature} suffix="°F" onCommit={(v) => onWeatherOverride("temperature", v)} />
              <InlineEdit label="Humidity" value={weather.humidity} suffix="%" onCommit={(v) => onWeatherOverride("humidity", v)} />
            </div>
          </div>
        </div>
      </AccordionSection>

      <ActionModal
        actionId={activeAction}
        onClose={() => {
          if (activeAction === "location") onLocationSearchPreview?.(null);
          setActiveAction(null);
        }}
        onConfirm={(payload) => {
          onActionConfirm?.(payload);
          setActiveAction(null);
        }}
        onRequestMapDraw={(mode) => {
          const action = activeAction === "fuel-break" ? "fuel-break" : "location";
          setActiveAction(null);
          onRequestMapInteraction?.(mode, action);
        }}
        mapRef={mapRef}
        onLocationSearchPreview={onLocationSearchPreview}
      />
    </Panel>
  );
}

// ─── Map controls (top-right) ─────────────────────────────────────────────────

const MAP_STYLES: { id: MapStyleId; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "street", label: "Street" },
  { id: "satellite", label: "Satellite" },
];

function MapControlsPanel({
  mapStyle,
  onMapStyleChange,
  mapRef,
}: {
  mapStyle: MapStyleId;
  onMapStyleChange: (s: MapStyleId) => void;
  mapRef: import("leaflet").Map | null;
}) {
  const [styleOpen, setStyleOpen] = useState(false);
  const currentLabel = MAP_STYLES.find((s) => s.id === mapStyle)?.label ?? "Terrain";

  return (
    <Panel className="overflow-hidden">
      {/* Zoom buttons — side by side */}
      <div className="flex border-b border-white/6">
        <button
          type="button"
          onClick={() => mapRef?.zoomIn()}
          className="flex h-7 flex-1 items-center justify-center border-r border-white/6 text-sm font-bold text-white/50 transition hover:bg-white/5 hover:text-white/90 sm:h-8"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => mapRef?.zoomOut()}
          className="flex h-7 flex-1 items-center justify-center text-sm font-bold text-white/50 transition hover:bg-white/5 hover:text-white/90 sm:h-8"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

      {/* Map style dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setStyleOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-[9px] font-medium text-white/50 transition hover:bg-white/5 hover:text-white/80 sm:text-[10px]"
        >
          <span>{currentLabel}</span>
          <ChevronRight
            className={cn(
              "h-2.5 w-2.5 shrink-0 text-white/25 transition-transform duration-150",
              styleOpen && "rotate-90",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {styleOpen && (
            <motion.div
              key="style-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="overflow-hidden border-t border-white/6"
            >
              <div className="flex flex-col gap-0.5 p-1">
                {MAP_STYLES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onMapStyleChange(id); setStyleOpen(false); }}
                    className={cn(
                      "rounded-md px-1.5 py-1 text-left text-[9px] font-medium transition sm:text-[10px]",
                      mapStyle === id
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-white/40 hover:bg-white/5 hover:text-white/70",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

// ─── Terrain Data Panel ───────────────────────────────────────────────────────

export type TerrainLayer = "fuel" | "slope" | "aspect";

export type TerrainData = {
  fuel: number[][] | null;
  slope: number[][] | null;
  aspect: number[][] | null;
};

export type TerrainOverlayState = {
  show: Set<TerrainLayer>;
  data: TerrainData;
  loading: boolean;
  error: string | null;
  showCellInfo: boolean;
};

async function tryFetchTerrainMatrix(
  path: string,
  token: string,
): Promise<{ data: number[][] | null; error: string | null }> {
  try {
    const data = await fetchTerrainMatrix(path, token);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function TerrainDataPanel({
  centerSet,
  state,
  onChange,
  plan,
  weather,
}: {
  centerSet: boolean;
  state: TerrainOverlayState;
  onChange: (next: Partial<TerrainOverlayState>) => void;
  plan: IgnitionPlan;
  weather: WeatherValues;
}) {
  if (!centerSet) return null;

  async function handleFetch() {
    onChange({ loading: true, error: null });

    let token: string;
    try {
      token = await bootstrapTerrainSession(plan, weather);
    } catch (e) {
      onChange({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    const [fuelResult, slopeResult, aspectResult] = await Promise.all([
      state.show.has("fuel")   ? tryFetchTerrainMatrix("/getCellFuel/", token)   : Promise.resolve({ data: state.data.fuel,   error: null }),
      state.show.has("slope")  ? tryFetchTerrainMatrix("/getCellSlope/", token)  : Promise.resolve({ data: state.data.slope,  error: null }),
      state.show.has("aspect") ? tryFetchTerrainMatrix("/getCellAspect/", token) : Promise.resolve({ data: state.data.aspect, error: null }),
    ]);

    const errors: string[] = [];
    if (fuelResult.error)   errors.push(`Fuel: ${fuelResult.error}`);
    if (slopeResult.error)  errors.push(`Slope: ${slopeResult.error}`);
    if (aspectResult.error) errors.push(`Aspect: ${aspectResult.error}`);

    onChange({
      loading: false,
      data: {
        fuel:   fuelResult.data,
        slope:  slopeResult.data,
        aspect: aspectResult.data,
      },
      error: errors.length ? errors.join(" · ") : null,
    });
  }

  function toggleLayer(layer: TerrainLayer) {
    const next = new Set(state.show);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    onChange({ show: next });
  }

  const hasSelection = state.show.size > 0;
  const hasData = state.data.fuel !== null || state.data.slope !== null || state.data.aspect !== null;

  const LAYERS: { id: TerrainLayer; label: string; loadedKey: keyof TerrainData }[] = [
    { id: "fuel",   label: "Show Fuel",   loadedKey: "fuel"   },
    { id: "slope",  label: "Show Slope",  loadedKey: "slope"  },
    { id: "aspect", label: "Show Aspect", loadedKey: "aspect" },
  ];

  return (
    <Panel className="w-[160px] overflow-hidden sm:w-[175px] md:w-[190px]">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-white/6 px-3 py-2">
        <Database className="h-3 w-3 shrink-0 text-sky-400/70 sm:h-3.5 sm:w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Terrain Data
        </span>
        {hasData && (
          <span className="ml-auto shrink-0 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
            loaded
          </span>
        )}
      </div>

      <div className="space-y-3 px-3 py-2.5">
        {/* Layer checkboxes */}
        <div className="space-y-2">
          {LAYERS.map(({ id, label, loadedKey }) => (
            <div key={id} className="flex items-center gap-2">
              <Checkbox
                id={`terrain-${id}`}
                checked={state.show.has(id)}
                onCheckedChange={() => toggleLayer(id)}
              />
              <label
                htmlFor={`terrain-${id}`}
                className="flex flex-1 cursor-pointer select-none items-center justify-between text-[10px] text-white/60 sm:text-[11px]"
              >
                {label}
                {state.data[loadedKey] !== null && (
                  <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/70" />
                )}
              </label>
            </div>
          ))}
        </div>

        {/* Fetch button */}
        <button
          type="button"
          disabled={!hasSelection || state.loading}
          onClick={() => void handleFetch()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500/20 py-1.5 text-[10px] font-medium text-sky-200 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:text-[11px]"
        >
          {state.loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Database className="h-3 w-3" />
          )}
          {state.loading ? "Fetching…" : "Fetch Data"}
        </button>


        {/* Cell info toggle */}
        <div className="flex items-center justify-between gap-2 border-t border-white/6 pt-2.5">
          <label
            htmlFor="cell-info-toggle"
            className="cursor-pointer select-none text-[10px] text-white/55 sm:text-[11px]"
          >
            Cell info cursor
          </label>
          <Switch
            id="cell-info-toggle"
            checked={state.showCellInfo}
            onCheckedChange={(checked) => onChange({ showCellInfo: checked })}
          />
        </div>
      </div>
    </Panel>
  );
}

// ─── Ignition Lines Panel ─────────────────────────────────────────────────────

type IgnitionLinesPanelProps = {
  plan: IgnitionPlan;
  onSegmentEdit: (edit: SegmentEdit) => void;
  onSegmentDelete: (teamIndex: number, segmentIndex: number) => void;
};

function IgnitionLinesPanel({ plan, onSegmentEdit, onSegmentDelete }: IgnitionLinesPanelProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Collect all line segments (start ≠ end) across all teams
  const rows: Array<{
    teamIndex: number;
    segIndex: number;
    teamName: string;
    seg: IgnitionPlan["team_infos"][number]["details"][number];
    key: string;
  }> = [];

  plan.team_infos.forEach((team, ti) => {
    team.details.forEach((seg, si) => {
      if (seg.start_x !== seg.end_x || seg.start_y !== seg.end_y) {
        rows.push({ teamIndex: ti, segIndex: si, teamName: team.team_name, seg, key: `${ti}-${si}` });
      }
    });
  });

  if (rows.length === 0) return null;

  return (
    <Panel className="w-[190px] sm:w-[210px] md:w-[230px]">
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Flame className="h-3 w-3 text-orange-400/70 sm:h-3.5 sm:w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Ignition Lines
        </span>
        <span className="ml-auto rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-orange-300">
          {rows.length}
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {rows.map(({ teamIndex, segIndex, teamName, seg, key }) => {
          const isOpen = openKey === key;
          const dx = seg.end_x - seg.start_x;
          const dy = seg.end_y - seg.start_y;
          const dist = Math.round(Math.sqrt(dx * dx + dy * dy));

          return (
            <div key={key} className="pointer-events-auto">
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : key)}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-white/3 sm:px-3 sm:py-2"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-white/30 transition-transform sm:h-3.5 sm:w-3.5",
                    isOpen && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/70 sm:text-[11px]">
                  Line {segIndex + 1}
                  <span className="ml-1 text-white/30">({teamName})</span>
                </span>
                <span className="shrink-0 text-[9px] text-white/30">{dist}c</span>
              </button>

              {/* Accordion body */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 px-2.5 pb-2.5 pt-1 sm:px-3 sm:pb-3">
                      {/* Ignition type */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-white/35 sm:text-[10px]">Ignition type</span>
                        <select
                          value={seg.mode}
                          onChange={(e) =>
                            onSegmentEdit({
                              teamIndex,
                              segmentIndex: segIndex,
                              mode: e.target.value as import("@/types/ignitionPlan").IgnitionMode,
                            })
                          }
                          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/80 outline-none focus:border-orange-400/40 sm:text-[11px]"
                        >
                          {IGNITION_MODES.map((m) => (
                            <option key={m.value} value={m.value} className="bg-zinc-900">
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Speed */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] text-white/35 sm:text-[10px]">Speed (m/s)</span>
                        <input
                          type="number"
                          min={0.01}
                          max={10}
                          step={0.01}
                          value={seg.speed}
                          onChange={(e) =>
                            onSegmentEdit({
                              teamIndex,
                              segmentIndex: segIndex,
                              speed: parseFloat(e.target.value) || seg.speed,
                            })
                          }
                          className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 outline-none focus:border-orange-400/40 sm:w-18 sm:text-[11px]"
                        />
                      </div>

                      {/* Distance override */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] text-white/35 sm:text-[10px]">Distance (cells)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="auto"
                          value={seg.distance ?? ""}
                          onChange={(e) =>
                            onSegmentEdit({
                              teamIndex,
                              segmentIndex: segIndex,
                              distance: e.target.value === "" ? null : parseInt(e.target.value),
                            })
                          }
                          className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 outline-none focus:border-orange-400/40 sm:w-18 sm:text-[11px]"
                        />
                      </div>

                      {/* Team name */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-white/35 sm:text-[10px]">Team name</span>
                        <input
                          type="text"
                          value={teamName}
                          onChange={(e) =>
                            onSegmentEdit({
                              teamIndex,
                              segmentIndex: segIndex,
                              teamName: e.target.value,
                            })
                          }
                          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/80 outline-none focus:border-orange-400/40 sm:text-[11px]"
                        />
                      </div>

                      {/* Coords (read-only) */}
                      <div className="rounded-md bg-white/3 px-2 py-1.5">
                        <p className="text-[9px] text-white/25">
                          ({seg.start_x}, {seg.start_y}) → ({seg.end_x}, {seg.end_y})
                        </p>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => {
                          onSegmentDelete(teamIndex, segIndex);
                          setOpenKey(null);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-500/20 py-1 text-[10px] text-red-400/60 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove line
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Fuel Breaks Panel ────────────────────────────────────────────────────────

type FuelBreaksPanelProps = {
  plan: IgnitionPlan;
  onFuelBreakDelete: (index: number) => void;
};

function FuelBreaksPanel({ plan, onFuelBreakDelete }: FuelBreaksPanelProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (plan.sup_infos.length === 0) return null;

  return (
    <Panel className="w-[190px] sm:w-[210px] md:w-[230px]">
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Shield className="h-3 w-3 text-sky-400/70 sm:h-3.5 sm:w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Fuel Breaks
        </span>
        <span className="ml-auto rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
          {plan.sup_infos.length}
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {plan.sup_infos.map((rect, idx) => {
          const isOpen = openIdx === idx;
          const w = Math.abs(rect.x2 - rect.x1);
          const h = Math.abs(rect.y2 - rect.y1);

          return (
            <div key={idx} className="pointer-events-auto">
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-white/3 sm:px-3 sm:py-2"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-white/30 transition-transform sm:h-3.5 sm:w-3.5",
                    isOpen && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/70 sm:text-[11px]">
                  Break {idx + 1}
                </span>
                <span className="shrink-0 text-[9px] text-white/30">{w}×{h}c</span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 px-2.5 pb-2.5 pt-1 sm:px-3 sm:pb-3">
                      {/* Coords (read-only) */}
                      <div className="rounded-md bg-white/3 px-2 py-1.5 space-y-0.5">
                        <p className="text-[9px] text-white/40">Top-left</p>
                        <p className="text-[9px] text-white/25">({rect.x1}, {rect.y1})</p>
                        <p className="text-[9px] text-white/40 pt-0.5">Bottom-right</p>
                        <p className="text-[9px] text-white/25">({rect.x2}, {rect.y2})</p>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => {
                          onFuelBreakDelete(idx);
                          setOpenIdx(null);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-500/20 py-1 text-[10px] text-red-400/60 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove break
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type MapOverlayPanelsProps = {
  stats?: SimStats;
  messages: UIMessage[];
  onStartSimulation?: () => void;
  onAskAgent?: () => void;
  onResetProject?: () => void;
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
  onWeatherFetched?: (next: WeatherValues) => void;
  onActionConfirm?: (payload: ActionPayload) => void;
  onRequestMapInteraction?: (mode: MapInteractionMode, action?: "location" | "fuel-break") => void;
  onLocationSearchPreview?: (
    preview: {
      lat: number;
      lng: number;
      boundaryGeoJSON: BoundaryGeoJSON;
    } | null,
  ) => void;
  planPreview?: { segments: number; fuelBreaks: number; centerSet: boolean };
  /** True once a project boundary exists (drawn, geocoded, or synthetic grid footprint). */
  hasProjectLocation?: boolean;
  mapStyle: MapStyleId;
  onMapStyleChange: (s: MapStyleId) => void;
  mapRef: import("leaflet").Map | null;
  projectConfig?: IgnitionPlan;
  onSegmentEdit?: (edit: SegmentEdit) => void;
  onSegmentDelete?: (teamIndex: number, segmentIndex: number) => void;
  onFuelBreakDelete?: (index: number) => void;
  terrainState?: TerrainOverlayState;
  onTerrainChange?: (next: Partial<TerrainOverlayState>) => void;
};

export function MapOverlayPanels({
  stats,
  onStartSimulation,
  onAskAgent,
  onResetProject,
  weather,
  onWeatherOverride,
  onWeatherFetched,
  onActionConfirm,
  onRequestMapInteraction,
  onLocationSearchPreview,
  planPreview,
  hasProjectLocation = false,
  mapStyle,
  onMapStyleChange,
  mapRef,
  projectConfig,
  onSegmentEdit,
  onSegmentDelete,
  onFuelBreakDelete,
  terrainState,
  onTerrainChange,
}: MapOverlayPanelsProps) {
  return (
    <>
      {/* Top-left: Scenario + Run Config side by side, with Ignition Lines below Run Config */}
      <div className="pointer-events-none absolute left-2 top-2 z-450 flex items-start gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
        <ScenarioPanel
          weather={weather}
          onWeatherOverride={onWeatherOverride}
          onWeatherFetched={onWeatherFetched}
          onActionConfirm={onActionConfirm}
          onRequestMapInteraction={onRequestMapInteraction}
          onLocationSearchPreview={onLocationSearchPreview}
          planPreview={planPreview}
          mapRef={mapRef}
          hasProjectLocation={hasProjectLocation}
        />
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <RunConfigPanel
            onStartSimulation={onStartSimulation}
            onAskAgent={onAskAgent}
            onResetProject={onResetProject}
          />
          {projectConfig && onSegmentEdit && onSegmentDelete && (
            <IgnitionLinesPanel
              plan={projectConfig}
              onSegmentEdit={onSegmentEdit}
              onSegmentDelete={onSegmentDelete}
            />
          )}
          {projectConfig && onFuelBreakDelete && (
            <FuelBreaksPanel
              plan={projectConfig}
              onFuelBreakDelete={onFuelBreakDelete}
            />
          )}
        </div>
      </div>

      {/* Top-right: Simulation progress */}
      <div className="pointer-events-none absolute right-2 top-2 z-450 w-[180px] sm:right-3 sm:top-3 sm:w-[200px] md:w-[220px]">
        <ProgressPanel stats={stats} />
      </div>

      {/* Bottom-right: Terrain Data above map zoom/style controls */}
      <div className="pointer-events-none absolute bottom-16 right-2 z-450 flex flex-col gap-1.5 sm:bottom-20 sm:right-3 sm:gap-2">
        {terrainState && onTerrainChange && projectConfig && (
          <TerrainDataPanel
            centerSet={!!projectConfig.boundaryGeoJSON}
            plan={projectConfig}
            weather={weather}
            state={terrainState}
            onChange={onTerrainChange}
          />
        )}
        <MapControlsPanel
          mapStyle={mapStyle}
          onMapStyleChange={onMapStyleChange}
          mapRef={mapRef}
        />
      </div>
    </>
  );
}
