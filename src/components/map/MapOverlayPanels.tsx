"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ChevronRight,
  Crosshair,
  Database,
  Flame,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

import {
  ASPECT_LEGEND_CAPTION,
  FUEL_LEGEND_STOPS,
  SLOPE_LEGEND_STOPS,
  activeTerrainLayer,
} from "@/lib/terrainLegend";
import { cn } from "@/lib/utils";
import {
  bootstrapTerrainSession,
  fetchTerrainMatrix,
} from "@/lib/devsFireBrowser";
import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type {
  ActionPayload,
  IgnitionMode,
  IgnitionPlan,
  SegmentEdit,
} from "@/types/ignitionPlan";
import {
  IGNITION_TEAM_PICKER_COUNT,
  ignitionModeForGeometry,
  ignitionModesForSegmentGeometry,
} from "@/types/ignitionPlan";
import type { MapInteractionMode } from "./MapInteractionLayer";

import { type ActionId, MAP_INTERACTION_ACTIONS } from "./ActionModal";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SimStats = {
  burning: number;
  burned: number;
  unburned: number;
  weatherSource?: string;
  streamStatus: string;
  shapes: number;
  simulationError?: string | null;
};

export type MapStyleId = "terrain" | "street" | "satellite";

type DrawerId = "scenario";
function TerrainAccordionSection({
  open,
  onToggle,
  icon: Icon,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/70 first:border-t-0">
      <Button
        variant="ghost"
        onClick={onToggle}
        className={cn(
          "h-auto w-full justify-start gap-2 px-2.5 py-2 text-left transition-colors sm:px-3 sm:py-2.5",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        <span className="flex-1 text-[10px] font-semibold tracking-wide sm:text-[11px]">{label}</span>
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform duration-200 sm:h-3 sm:w-3",
            open && "rotate-90",
          )}
        />
      </Button>
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
// ─── Shared primitives ────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "themed-layer pointer-events-auto rounded-xl border border-stroke-secondary/30 bg-card/95 text-card-foreground backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:mb-2 sm:text-[10px]">
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
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-auto w-full justify-start gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-2.5 sm:text-[11px]",
        variant === "primary"
          ? "bg-primary/15 text-primary hover:bg-primary/20"
          : variant === "danger"
            ? "border border-red-500/25 bg-red-500/10 text-red-400/90 hover:bg-red-500/20"
            : "bg-muted text-muted-foreground hover:bg-muted/75 hover:text-foreground",
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
      {label}
    </Button>
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
      <Button
        variant="ghost"
        onClick={() => onToggle(id)}
        className={cn(
          "h-auto w-full justify-start gap-2 px-2.5 py-2 text-left transition-colors sm:px-3 sm:py-2.5",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        <span className="flex-1 text-[10px] font-semibold tracking-wide sm:text-[11px]">{label}</span>
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform duration-200 sm:h-3 sm:w-3",
            open && "rotate-90",
          )}
        />
      </Button>
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
        <Input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          }}
          className="h-auto w-16 border-white/15 bg-white/8 px-1.5 py-0.5 text-right text-[10px] text-white focus-visible:ring-orange-400/50 sm:w-20 sm:px-2 sm:text-[11px]"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setDraft(String(value)); setEditing(true); }}
          className="group h-auto gap-1 px-0 text-[10px] text-white/70 hover:bg-transparent hover:text-white sm:text-[11px]"
        >
          {value}{suffix ? ` ${suffix}` : ""}
          <span className="text-[8px] text-white/20 group-hover:text-white/40 sm:text-[9px]">✎</span>
        </Button>
      )}
    </div>
  );
}

// ─── Progress panel ───────────────────────────────────────────────────────────

function TerrainLegendBlock({ terrainState }: { terrainState?: TerrainOverlayState }) {
  const layer = terrainState ? activeTerrainLayer(terrainState.show) : null;
  if (!layer || !terrainState?.show.size) return null;

  const stops =
    layer === "fuel" ? FUEL_LEGEND_STOPS :
    layer === "slope" ? SLOPE_LEGEND_STOPS :
    null;

  return (
    <div className="mt-2 border-t border-white/6 pt-2 sm:mt-2.5 sm:pt-2.5">
      <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-white/35 sm:text-[9px]">
        Terrain legend ({layer})
      </p>
      {stops ? (
        <div className="flex flex-wrap gap-1.5">
          {stops.map((s) => (
            <div key={s.label} className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/10"
                style={{ background: s.color === "transparent" ? "transparent" : s.color }}
              />
              <span className="text-[8px] text-white/45 sm:text-[9px]">{s.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[8px] leading-snug text-white/40 sm:text-[9px]">{ASPECT_LEGEND_CAPTION}</p>
      )}
    </div>
  );
}

function ProgressPanel({
  stats,
  terrainState,
}: {
  stats?: SimStats;
  terrainState?: TerrainOverlayState;
}) {
  const isActive = stats?.streamStatus === "open";

  return (
    <Panel className="w-[160px] sm:w-[175px] md:w-[190px]">
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Activity className="h-3 w-3 text-white/40 sm:h-3.5 sm:w-3.5" />
        <span className="flex-1 text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Simulation Progress
        </span>
        {isActive && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-amber-300 sm:text-[9px]">
            <span className="h-1 w-1 animate-pulse rounded-full bg-amber-300" />
            Processing
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
        {stats?.simulationError ? (
          <p className="mt-1.5 text-[9px] leading-snug text-red-400/90 sm:mt-2 sm:text-[10px]">
            {stats.simulationError}
          </p>
        ) : null}
        <TerrainLegendBlock terrainState={terrainState} />
      </div>
    </Panel>
  );
}

// ─── Run config panel ─────────────────────────────────────────────────────────

function RunConfigPanel({
  onStartSimulation,
  onResetRequest,
  runActionsEnabled,
  simulationRunning,
  simulationTimesteps = 12000,
  onSimulationTimestepsChange,
  playbackRate = 1,
  onPlaybackRateChange,
  replayState = "idle",
  canReplay = false,
  onReplayPlay,
  onReplayPause,
}: {
  onStartSimulation?: (simulationTimesteps: number) => void;
  /** Emits upward — modal host owns the confirm dialog */
  onResetRequest?: () => void;
  /** Boundary set and at least one ignition (required to run or reset from this panel) */
  runActionsEnabled: boolean;
  simulationRunning?: boolean;
  simulationTimesteps?: number;
  onSimulationTimestepsChange?: (value: number) => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  replayState?: "idle" | "playing" | "paused";
  canReplay?: boolean;
  onReplayPlay?: () => void;
  onReplayPause?: () => void;
}) {

  return (
    <Panel className="w-[160px] sm:w-[175px] md:w-[190px]">
      <div className="flex items-center gap-2 border-b border-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <Sliders className="h-3 w-3 text-white/40 sm:h-3.5 sm:w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
          Run Configuration
        </span>
      </div>
      <div className="space-y-2.5 p-2.5 sm:space-y-3 sm:p-3">
        {/* Timesteps stepper */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40 sm:text-[11px]">Timesteps</span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSimulationTimestepsChange?.(Math.max(1000, simulationTimesteps - 1000))}
              className="size-5 shrink-0 border-white/10 p-0 text-white/50 hover:border-white/20 hover:text-white/80"
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <span className="w-10 text-center text-[10px] font-semibold text-white/80 sm:w-12 sm:text-[11px]">{simulationTimesteps}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSimulationTimestepsChange?.(Math.min(100_000, simulationTimesteps + 1000))}
              className="size-5 shrink-0 border-white/10 p-0 text-[11px] text-white/50 hover:border-white/20 hover:text-white/80"
            >
              +
            </Button>
          </div>
        </div>

        {/* Playback rate */}
        <div className="space-y-1 sm:space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40 sm:text-[11px]">Playback rate</span>
            <span className="text-[10px] font-semibold text-white/70 sm:text-[11px]">{playbackRate}×</span>
          </div>
          <Input
            type="range"
            min={1}
            max={10}
            step={0.25}
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange?.(Number(e.target.value))}
            className="h-auto w-full border-0 bg-transparent px-0 py-0 accent-orange-400"
          />
          <div className="flex justify-between text-[8px] text-white/20 sm:text-[9px]">
            <span>1×</span>
            <span>2×</span>
            <span>5×</span>
            <span>10×</span>
          </div>
        </div>

        <div className="space-y-1 sm:space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40 sm:text-[11px]">Replay</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={onReplayPlay}
              aria-label="Play"
              title="Play"
              disabled={!canReplay || simulationRunning}
              className="size-7 border-white/10 p-0 text-white/70 hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="sr-only">Play</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onReplayPause}
              aria-label="Pause"
              title="Pause"
              disabled={replayState !== "playing" || simulationRunning}
              className="size-7 border-white/10 p-0 text-white/70 hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              <Pause className="h-3.5 w-3.5" />
              <span className="sr-only">Pause</span>
            </Button>
          </div>
          {!canReplay && (
            <p className="text-[9px] text-white/35">
              Run a simulation first to enable replay.
            </p>
          )}
          {canReplay && simulationRunning && (
            <p className="text-[9px] text-white/35">
              Replay controls are disabled while simulation is processing.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-1 pt-0.5 sm:space-y-1.5">
          <ActionBtn
            onClick={() => onStartSimulation?.(simulationTimesteps)}
            label="Start Simulation"
            icon={Play}
            variant="primary"
            disabled={!runActionsEnabled || simulationRunning}
            title={
              !runActionsEnabled
                ? "Set the project area and at least one point or line ignition first"
                : simulationRunning
                  ? "Simulation is already processing"
                  : undefined
            }
          />
          {onResetRequest && (
            <ActionBtn
              onClick={onResetRequest}
              label="Reset project"
              icon={RotateCcw}
              variant="danger"
            />
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
  onWeatherFetchedAtCoords,
  onOpenActionModal,
  onRequestMapInteraction,
  onRelocateRequest,
  planPreview,
  plan,
  onCommitGridField,
  hasProjectLocation,
  hasSimulationResults = false,
}: {
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
  /** Applied to scenario state and mirrored into project config (simulation). */
  onWeatherFetched?: (next: WeatherValues) => void;
  onWeatherFetchedAtCoords?: (next: WeatherValues, coords: { lat: number; lng: number }, label?: string) => void;
  onOpenActionModal?: (actionId: ActionId) => void;
  onRequestMapInteraction?: (
    mode: MapInteractionMode,
    action?: "location" | "fuel-break" | "line-ignition",
  ) => void;
  /** Emits upward — modal host owns the relocate confirm dialog */
  onRelocateRequest?: () => void;
  planPreview?: { segments: number; fuelBreaks: number; centerSet: boolean };
  plan?: IgnitionPlan;
  onCommitGridField?: (
    field: "cellResolution" | "cellSpaceDimension" | "cellSpaceDimensionLat",
    value: number,
  ) => void;
  hasProjectLocation: boolean;
  /** True after a simulation has been run and results received. Location becomes locked. */
  hasSimulationResults?: boolean;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
}) {
  const [open, setOpen] = useState<DrawerId>("scenario");
  const [weatherQuery, setWeatherQuery] = useState("");
  const [fetching, setFetching] = useState(false);
  const [weatherFetchError, setWeatherFetchError] = useState<string | null>(null);
  const [cellGridOpen, setCellGridOpen] = useState(false);

  // Location is locked once a simulation has been run and received.
  const locationLocked = hasSimulationResults;

  function handleActionBtnClick(id: ActionId) {
    if (id === "location") {
      if (locationLocked) return;
      if (hasProjectLocation) {
        // Location already set but no simulation yet — emit upward for modal host
        onRelocateRequest?.();
        return;
      }
    }
    if (MAP_INTERACTION_ACTIONS.includes(id)) {
      if (!hasProjectLocation) return;
      if (id === "point-ignition") {
        onRequestMapInteraction?.("pin");
      } else if (id === "line-ignition") {
        onRequestMapInteraction?.("polyline", "line-ignition");
      } else {
        onRequestMapInteraction?.("line");
      }
    } else {
      if (id === "fuel-break" && !hasProjectLocation) return;
      onOpenActionModal?.(id);
    }
  }

  function toggle(id: DrawerId) {
    setOpen(id);
  }

  async function handleFetchWeather() {
    if (!weatherQuery.trim()) return;
    setFetching(true);
    setWeatherFetchError(null);
    try {
      const res = await fetch(
        `/api/weather/zip?q=${encodeURIComponent(weatherQuery.trim())}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        error?: string;
        weather?: WeatherValues;
        placeLabel?: string;
        source?: string;
        lat?: number;
        lng?: number;
      };
      if (!res.ok || !json.weather) {
        throw new Error(json.error ?? "Weather fetch failed");
      }
      onWeatherFetched?.(json.weather);
      if (
        typeof json.lat === "number" &&
        typeof json.lng === "number" &&
        onWeatherFetchedAtCoords
      ) {
        onWeatherFetchedAtCoords(json.weather, { lat: json.lat, lng: json.lng }, json.placeLabel);
      }
      toast.success(
        json.placeLabel
          ? `${json.placeLabel} · current conditions (Open-Meteo)`
          : "Current conditions loaded (Open-Meteo)",
      );
    } catch (e) {
      setWeatherFetchError(e instanceof Error ? e.message : String(e));
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
                label={
                  locationLocked
                    ? "Location locked (simulation ran)"
                    : hasProjectLocation
                      ? "Change project location"
                      : "Set Project Location"
                }
                icon={MapPin}
                disabled={locationLocked}
                title={
                  locationLocked
                    ? "Location cannot be changed after a simulation has been run. Reset project to start fresh."
                    : hasProjectLocation
                      ? "Change project location — all scenario data (ignitions, fuel breaks, terrain) will be reset"
                      : undefined
                }
                onClick={() => handleActionBtnClick("location")}
              />
              {locationLocked ? (
                <p className="text-[8px] leading-relaxed text-white/30 sm:text-[9px]">
                  Location locked after simulation. Use Reset project to start fresh.
                </p>
              ) : hasProjectLocation ? (
                <p className="text-[8px] leading-relaxed text-amber-400/50 sm:text-[9px]">
                  Changing location will reset ignitions, fuel breaks and terrain data.
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

          {plan && onCommitGridField ? (
            <div className="border-t border-white/6 pt-2.5 sm:pt-3">
              <Button
                variant="ghost"
                onClick={() => setCellGridOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-white/65 transition hover:bg-white/5 hover:text-white/85"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-white/30 transition-transform",
                    cellGridOpen && "rotate-90",
                  )}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">
                  Cell Grid
                </span>
              </Button>
              <AnimatePresence initial={false}>
                {cellGridOpen ? (
                  <motion.div
                    key="cell-grid"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[8px] leading-relaxed text-white/30 sm:text-[9px]">
                        Cell resolution and grid side length. These define the square project
                        boundary. DEVS-FIRE uses a single square grid (N×N cells).
                      </p>
                      <div className="rounded-lg border border-white/8 bg-white/3 px-2 sm:px-3">
                        <InlineEdit
                          label="Cell resolution"
                          value={plan.cellResolution}
                          suffix="m / cell"
                          onCommit={(v) =>
                            onCommitGridField(
                              "cellResolution",
                              Math.max(1, Math.min(500, Math.round(v))),
                            )
                          }
                        />
                        <InlineEdit
                          label="Cells (side)"
                          value={plan.cellSpaceDimension}
                          onCommit={(v) => {
                            const clamped = Math.max(10, Math.min(2000, Math.round(v)));
                            onCommitGridField("cellSpaceDimension", clamped);
                            onCommitGridField("cellSpaceDimensionLat", clamped);
                          }}
                        />
                      </div>
                      {/* Physical size hint */}
                      <p className="text-[8px] text-white/25 sm:text-[9px]">
                        ≈ {((plan.cellSpaceDimension * plan.cellResolution) / 1000).toFixed(1)} km × {((plan.cellSpaceDimension * plan.cellResolution) / 1000).toFixed(1)} km boundary
                      </p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}

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

            <div className="mt-2 space-y-1.5 border-t border-white/6 pt-2.5 sm:space-y-2 sm:pt-3">
              <SectionLabel>Weather Lookup</SectionLabel>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2">
                <Input
                  value={weatherQuery}
                  onChange={(e) => setWeatherQuery(e.target.value)}
                  placeholder="City, address, or US ZIP"
                  autoComplete="postal-code"
                  className="min-h-[32px] min-w-0 flex-1 rounded-lg border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white placeholder:text-white/25 focus-visible:ring-white/20 sm:px-3 sm:py-2 sm:text-[11px]"
                />
                <Button
                  variant="ghost"
                  onClick={() => void handleFetchWeather()}
                  disabled={!weatherQuery.trim() || fetching}
                  className="min-h-[32px] shrink-0 rounded-lg bg-orange-500/20 px-3 py-1.5 text-[10px] font-medium text-orange-400 hover:bg-orange-500/30 sm:min-w-[72px] sm:px-4 sm:text-[11px]"
                >
                  {fetching ? "…" : "Fetch"}
                </Button>
              </div>
              {weatherFetchError ? (
                <p className="text-[9px] leading-snug text-red-400/90 sm:text-[10px]">{weatherFetchError}</p>
              ) : null}
              <p className="text-[9px] text-white/25 sm:text-[10px]">
                Enter a city, street address, or US ZIP. Weather fields are auto-populated from Open-Meteo.
              </p>
            </div>
          </div>
        </div>
      </AccordionSection>

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
        <Button
          variant="ghost"
          onClick={() => mapRef?.zoomIn()}
          className="h-7 flex-1 rounded-none border-r border-white/6 text-sm font-bold text-white/50 hover:bg-white/5 hover:text-white/90 sm:h-8"
          aria-label="Zoom in"
        >
          +
        </Button>
        <Button
          variant="ghost"
          onClick={() => mapRef?.zoomOut()}
          className="h-7 flex-1 rounded-none text-sm font-bold text-white/50 hover:bg-white/5 hover:text-white/90 sm:h-8"
          aria-label="Zoom out"
        >
          −
        </Button>
      </div>

      {/* Map style dropdown */}
      <div className="relative">
        <Button
          variant="ghost"
          onClick={() => setStyleOpen((o) => !o)}
          className="h-auto w-full justify-between gap-1.5 px-2 py-1.5 text-[9px] font-medium text-white/50 hover:bg-white/5 hover:text-white/80 sm:text-[10px]"
        >
          <span>{currentLabel}</span>
          <ChevronRight
            className={cn(
              "h-2.5 w-2.5 shrink-0 text-white/25 transition-transform duration-150",
              styleOpen && "rotate-90",
            )}
          />
        </Button>
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
                  <Button
                    key={id}
                    variant="ghost"
                    onClick={() => { onMapStyleChange(id); setStyleOpen(false); }}
                    className={cn(
                      "h-auto w-full justify-start rounded-md px-1.5 py-1 text-left text-[9px] font-medium sm:text-[10px]",
                      mapStyle === id
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-white/40 hover:bg-white/5 hover:text-white/70",
                    )}
                  >
                    {label}
                  </Button>
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

function selectedTerrainLayer(show: Set<TerrainLayer>): TerrainLayer | null {
  const first = show.values().next().value as TerrainLayer | undefined;
  if (first === "fuel" || first === "slope" || first === "aspect") return first;
  if (show.has("fuel")) return "fuel";
  if (show.has("slope")) return "slope";
  if (show.has("aspect")) return "aspect";
  return null;
}

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
  const [terrainOpen, setTerrainOpen] = useState(true);

  async function handleFetch(layerOverride?: TerrainLayer) {
    const active = layerOverride ?? selectedTerrainLayer(state.show);
    if (!active) return;

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

    const endpoint =
      active === "fuel"
        ? "/getCellFuel/"
        : active === "slope"
          ? "/getCellSlope/"
          : "/getCellAspect/";

    const result = await tryFetchTerrainMatrix(endpoint, token);

    onChange({
      loading: false,
      data: {
        fuel: active === "fuel" ? result.data : null,
        slope: active === "slope" ? result.data : null,
        aspect: active === "aspect" ? result.data : null,
      },
      error: result.error ? `${active}: ${result.error}` : null,
    });
  }

  async function selectLayer(layer: TerrainLayer) {
    if (state.show.has(layer)) {
      onChange({
        show: new Set(),
        // Keep data so it doesn't refetch if toggled back soon, 
        // or we could clear it. The request didn't specify clearing data,
        // just unselecting the chosen terrain data.
      });
      return;
    }

    onChange({
      show: new Set([layer]),
      data: {
        fuel: layer === "fuel" ? state.data.fuel : null,
        slope: layer === "slope" ? state.data.slope : null,
        aspect: layer === "aspect" ? state.data.aspect : null,
      },
    });

    const currentData = state.data[layer];
    if (currentData !== null || state.loading) return;
    await handleFetch(layer);
  }

  const activeLayer = selectedTerrainLayer(state.show);
  const hasSelection = Boolean(activeLayer);
  const hasData = state.data.fuel !== null || state.data.slope !== null || state.data.aspect !== null;
  const activeHasData = activeLayer ? state.data[activeLayer] !== null : false;

  const LAYERS: { id: TerrainLayer; label: string; loadedKey: keyof TerrainData }[] = [
    { id: "fuel",   label: "Show Fuel",   loadedKey: "fuel"   },
    { id: "slope",  label: "Show Slope",  loadedKey: "slope"  },
    { id: "aspect", label: "Show Aspect", loadedKey: "aspect" },
  ];

  return (
    <Panel className="w-[160px] overflow-hidden sm:w-[175px] md:w-[190px]">
      <TerrainAccordionSection
        open={terrainOpen}
        onToggle={() => setTerrainOpen((prev) => !prev)}
        icon={Database}
        label="Terrain Data"
      >
      <div className="space-y-3">
        {hasData && (
          <span className="inline-block rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
            loaded
          </span>
        )}
        {/* Exclusive layer selector */}
        <div className="space-y-2">
          {LAYERS.map(({ id, label, loadedKey }) => (
            <Button
              key={id}
              variant="ghost"
              onClick={() => selectLayer(id)}
              disabled={state.loading}
              className={cn(
                "h-auto w-full justify-between rounded-md border px-2 py-1.5 text-[10px] sm:text-[11px]",
                activeLayer === id
                  ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                  : "border-white/10 bg-white/4 text-white/60 hover:border-white/20 hover:text-white/80",
                state.loading && "cursor-not-allowed opacity-55",
              )}
            >
              <span>{label}</span>
              <span className="flex items-center gap-1">
                {state.data[loadedKey] !== null ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300/80" />
                ) : null}
                {activeLayer === id ? (
                  <span className="text-[9px] font-medium uppercase tracking-wide">active</span>
                ) : null}
              </span>
            </Button>
          ))}
        </div>

        {/* Fetch button */}
        <Button
          variant="ghost"
          disabled={!hasSelection || state.loading}
          onClick={() => void handleFetch()}
          className="h-auto w-full rounded-md bg-sky-500/20 py-1.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/30 sm:text-[11px]"
        >
          {state.loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Database className="h-3 w-3" />
          )}
          {state.loading ? "Fetching…" : "Fetch Data"}
        </Button>

        {!state.loading && activeLayer && !activeHasData ? (
          <p className="text-[9px] leading-snug text-white/35 sm:text-[10px]">
            Select a layer above; data fetch starts automatically once selected.
          </p>
        ) : null}


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
      </TerrainAccordionSection>
    </Panel>
  );
}

// ─── Ignition Parameters (line + point ignitions) ────────────────────────────

function IgnitionModeSelect({
  teamIndex,
  segIndex,
  mode,
  isPoint,
  onSegmentEdit,
}: {
  teamIndex: number;
  segIndex: number;
  mode: string;
  isPoint: boolean;
  onSegmentEdit: (edit: SegmentEdit) => void;
}) {
  const value = ignitionModeForGeometry(mode, isPoint);
  const options = ignitionModesForSegmentGeometry(isPoint);

  useEffect(() => {
    if (value !== mode) {
      onSegmentEdit({ teamIndex, segmentIndex: segIndex, mode: value });
    }
  }, [teamIndex, segIndex, mode, value, onSegmentEdit]);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onSegmentEdit({
          teamIndex,
          segmentIndex: segIndex,
          mode: nextValue as IgnitionMode,
        })
      }
    >
      <SelectTrigger className="h-auto w-full border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/80 sm:text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type IgnitionParametersPanelProps = {
  plan: IgnitionPlan;
  onSegmentEdit: (edit: SegmentEdit) => void;
  onSegmentDelete: (teamIndex: number, segmentIndex: number) => void;
  onPointIgnitionEdit: (input: {
    teamIndex: number;
    segmentIndex: number;
    x: number;
    y: number;
  }) => void;
};

type IgnitionParamRow =
  | {
      kind: "line";
      teamIndex: number;
      segIndex: number;
      seg: IgnitionPlan["team_infos"][number]["details"][number];
      key: string;
    }
  | {
      kind: "point";
      teamIndex: number;
      segIndex: number;
      seg: IgnitionPlan["team_infos"][number]["details"][number];
      key: string;
    };

function IgnitionTeamSelect({
  teamIndex,
  segmentIndex,
  onSegmentEdit,
}: {
  teamIndex: number;
  segmentIndex: number;
  onSegmentEdit: (edit: SegmentEdit) => void;
}) {
  const safeIndex = Math.min(Math.max(0, teamIndex), IGNITION_TEAM_PICKER_COUNT - 1);
  return (
    <Select
      value={String(safeIndex)}
      onValueChange={(nextValue) => {
        const next = parseInt(nextValue, 10);
        onSegmentEdit({ teamIndex, segmentIndex, moveToTeamIndex: next });
      }}
    >
      <SelectTrigger className="h-auto w-full border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/80 sm:text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: IGNITION_TEAM_PICKER_COUNT }, (_, i) => (
          <SelectItem key={i} value={String(i)}>
            Team {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IgnitionGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      role="presentation"
      className="flex items-center gap-2 bg-white/4 px-2.5 py-1.5 sm:px-3"
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </span>
      <span className="ml-auto tabular-nums text-[9px] font-medium text-white/35">{count}</span>
    </div>
  );
}

function IgnitionParametersPanel({
  plan,
  onSegmentEdit,
  onSegmentDelete,
  onPointIgnitionEdit,
}: IgnitionParametersPanelProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const forwardSegmentEdit = useCallback(
    (edit: SegmentEdit) => {
      if (edit.moveToTeamIndex !== undefined) setOpenKey(null);
      onSegmentEdit(edit);
    },
    [onSegmentEdit],
  );

  const rows: IgnitionParamRow[] = [];
  plan.team_infos.forEach((team, ti) => {
    team.details.forEach((seg, si) => {
      const key = `${ti}-${si}`;
      const isPoint = seg.start_x === seg.end_x && seg.start_y === seg.end_y;
      if (isPoint) {
        rows.push({
          kind: "point",
          teamIndex: ti,
          segIndex: si,
          seg,
          key,
        });
      } else {
        rows.push({
          kind: "line",
          teamIndex: ti,
          segIndex: si,
          seg,
          key,
        });
      }
    });
  });

  const lineRows = rows.filter((r): r is Extract<IgnitionParamRow, { kind: "line" }> => r.kind === "line");
  const pointRows = rows.filter((r): r is Extract<IgnitionParamRow, { kind: "point" }> => r.kind === "point");

  if (rows.length === 0) return null;

  const renderRow = (row: IgnitionParamRow) => {
    const { teamIndex, segIndex, seg, key } = row;
    const teamLabel = teamIndex + 1;
    const isOpen = openKey === key;

    if (row.kind === "point") {
      return (
        <div key={key} className="pointer-events-auto">
          <Button
            variant="ghost"
            onClick={() => setOpenKey(isOpen ? null : key)}
            className="h-auto w-full justify-start gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/3 sm:px-3 sm:py-2"
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-white/30 transition-transform sm:h-3.5 sm:w-3.5",
                isOpen && "rotate-90",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/70 sm:text-[11px]">
              Point · {segIndex + 1}
              <span className="ml-1 text-white/30">(Team {teamLabel})</span>
            </span>
          </Button>

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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/35 sm:text-[10px]">X (cell)</span>
                      <Input
                        type="number"
                        step={1}
                        value={seg.start_x}
                        onChange={(e) =>
                          onPointIgnitionEdit({
                            teamIndex,
                            segmentIndex: segIndex,
                            x: Math.round(Number(e.target.value)),
                            y: seg.start_y,
                          })
                        }
                        className="h-auto w-full border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 focus-visible:ring-orange-400/40 sm:text-[11px]"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/35 sm:text-[10px]">Y (cell)</span>
                      <Input
                        type="number"
                        step={1}
                        value={seg.start_y}
                        onChange={(e) =>
                          onPointIgnitionEdit({
                            teamIndex,
                            segmentIndex: segIndex,
                            x: seg.start_x,
                            y: Math.round(Number(e.target.value)),
                          })
                        }
                        className="h-auto w-full border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 focus-visible:ring-orange-400/40 sm:text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] text-white/35 sm:text-[10px]">Ignition type</span>
                    <IgnitionModeSelect
                      teamIndex={teamIndex}
                      segIndex={segIndex}
                      mode={seg.mode}
                      isPoint
                      onSegmentEdit={onSegmentEdit}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] text-white/35 sm:text-[10px]">Speed (m/s)</span>
                    <Input
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
                      className="h-auto w-16 border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 focus-visible:ring-orange-400/40 sm:w-18 sm:text-[11px]"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] text-white/35 sm:text-[10px]">Team</span>
                    <IgnitionTeamSelect
                      teamIndex={teamIndex}
                      segmentIndex={segIndex}
                      onSegmentEdit={forwardSegmentEdit}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      onSegmentDelete(teamIndex, segIndex);
                      setOpenKey(null);
                    }}
                    className="h-auto w-full rounded-md border border-red-500/20 py-1 text-[10px] text-red-400/60 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove point
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    const dx = seg.end_x - seg.start_x;
    const dy = seg.end_y - seg.start_y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));

    return (
      <div key={key} className="pointer-events-auto">
        <Button
          variant="ghost"
          onClick={() => setOpenKey(isOpen ? null : key)}
          className="h-auto w-full justify-start gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/3 sm:px-3 sm:py-2"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-white/30 transition-transform sm:h-3.5 sm:w-3.5",
              isOpen && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/70 sm:text-[11px]">
            Line · {segIndex + 1}
            <span className="ml-1 text-white/30">(Team {teamLabel})</span>
          </span>
          <span className="shrink-0 text-[9px] text-white/30">{dist}c</span>
        </Button>

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
                <div className="space-y-0.5">
                  <span className="text-[9px] text-white/35 sm:text-[10px]">Ignition type</span>
                  <IgnitionModeSelect
                    teamIndex={teamIndex}
                    segIndex={segIndex}
                    mode={seg.mode}
                    isPoint={false}
                    onSegmentEdit={onSegmentEdit}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-white/35 sm:text-[10px]">Speed (m/s)</span>
                  <Input
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
                    className="h-auto w-16 border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 focus-visible:ring-orange-400/40 sm:w-18 sm:text-[11px]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-white/35 sm:text-[10px]">Distance (cells)</span>
                  <Input
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
                    className="h-auto w-16 border-white/10 bg-white/5 px-2 py-1 text-center text-[10px] text-white/80 focus-visible:ring-orange-400/40 sm:w-18 sm:text-[11px]"
                  />
                </div>

                <div className="space-y-0.5">
                  <span className="text-[9px] text-white/35 sm:text-[10px]">Team</span>
                  <IgnitionTeamSelect
                    teamIndex={teamIndex}
                    segmentIndex={segIndex}
                    onSegmentEdit={forwardSegmentEdit}
                  />
                </div>

                <div className="rounded-md bg-white/3 px-2 py-1.5">
                  <p className="text-[9px] text-white/25">
                    ({seg.start_x}, {seg.start_y}) → ({seg.end_x}, {seg.end_y})
                  </p>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => {
                    onSegmentDelete(teamIndex, segIndex);
                    setOpenKey(null);
                  }}
                  className="h-auto w-full rounded-md border border-red-500/20 py-1 text-[10px] text-red-400/60 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove line
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <Panel className="w-[160px] sm:w-[175px] md:w-[190px] p-0 flex flex-col">
      <Accordion type="single" collapsible defaultValue="ignition" className="w-full">
        <AccordionItem value="ignition" className="border-none">
          <AccordionTrigger className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 hover:no-underline hover:bg-white/5 data-[state=open]:border-b data-[state=open]:border-white/6">
            <div className="flex items-center gap-2 flex-1 text-left">
              <Flame className="h-3 w-3 text-orange-400/70 sm:h-3.5 sm:w-3.5" />
              <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
                Ignition Parameters
              </span>
              <span className="ml-auto mr-2 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-orange-300">
                {rows.length}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="divide-y divide-white/5">
        {lineRows.length > 0 && (
          <>
            <IgnitionGroupHeader label="Lines" count={lineRows.length} />
            {lineRows.map(renderRow)}
          </>
        )}
        {pointRows.length > 0 && (
          <>
            <IgnitionGroupHeader label="Points" count={pointRows.length} />
            {pointRows.map(renderRow)}
          </>
        )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
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
    <Panel className="w-[160px] sm:w-[175px] md:w-[190px] p-0 flex flex-col">
      <Accordion type="single" collapsible defaultValue="fuel-breaks" className="w-full">
        <AccordionItem value="fuel-breaks" className="border-none">
          <AccordionTrigger className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 hover:no-underline hover:bg-white/5 data-[state=open]:border-b data-[state=open]:border-white/6">
            <div className="flex items-center gap-2 flex-1 text-left">
              <Shield className="h-3 w-3 text-sky-400/70 sm:h-3.5 sm:w-3.5" />
              <span className="text-[10px] font-semibold tracking-wide text-white/80 sm:text-[11px]">
                Fuel Breaks
              </span>
              <span className="ml-auto mr-2 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
                {plan.sup_infos.length}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="divide-y divide-white/5">
        {plan.sup_infos.map((rect, idx) => {
          const isOpen = openIdx === idx;
          const w = Math.abs(rect.x2 - rect.x1);
          const h = Math.abs(rect.y2 - rect.y1);

          return (
            <div key={idx} className="pointer-events-auto">
              <Button
                variant="ghost"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="h-auto w-full justify-start gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/3 sm:px-3 sm:py-2"
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
              </Button>

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
                      <Button
                        variant="ghost"
                        onClick={() => {
                          onFuelBreakDelete(idx);
                          setOpenIdx(null);
                        }}
                        className="h-auto w-full rounded-md border border-red-500/20 py-1 text-[10px] text-red-400/60 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove break
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Panel>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type MapOverlayPanelsProps = {
  stats?: SimStats;
  projectTitle?: string;
  onOpenActionModal?: (actionId: ActionId) => void;
  onStartSimulation?: (simulationTimesteps: number) => void;
  /** Emits upward — modal host owns the reset confirm dialog */
  onResetRequest?: () => void;
  /** Emits upward — modal host owns the relocate confirm dialog */
  onRelocateRequest?: () => void;
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
  onWeatherFetched?: (next: WeatherValues) => void;
  onWeatherFetchedAtCoords?: (
    next: WeatherValues,
    coords: { lat: number; lng: number },
    label?: string,
  ) => void;
  onRequestMapInteraction?: (
    mode: MapInteractionMode,
    action?: "location" | "fuel-break" | "line-ignition",
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
  onPointIgnitionEdit?: (input: {
    teamIndex: number;
    segmentIndex: number;
    x: number;
    y: number;
  }) => void;
  onFuelBreakDelete?: (index: number) => void;
  terrainState?: TerrainOverlayState;
  onTerrainChange?: (next: Partial<TerrainOverlayState>) => void;
  /** True when boundary exists and at least one ignition is defined */
  runActionsEnabled?: boolean;
  onCommitPlanGridField?: (
    field: "cellResolution" | "cellSpaceDimension" | "cellSpaceDimensionLat",
    value: number,
  ) => void;
  /** True after a simulation has been run and results received */
  hasSimulationResults?: boolean;
  simulationRunning?: boolean;
  simulationTimesteps?: number;
  onSimulationTimestepsChange?: (value: number) => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  replayState?: "idle" | "playing" | "paused";
  canReplay?: boolean;
  onReplayPlay?: () => void;
  onReplayPause?: () => void;
  layout?: "overlay" | "map-utilities" | "run-config-overlay";
};

export function MapOverlayPanels({
  stats,
  projectTitle = "Untitled project",
  onOpenActionModal,
  onStartSimulation,
  onResetRequest,
  onRelocateRequest,
  weather,
  onWeatherOverride,
  onWeatherFetched,
  onWeatherFetchedAtCoords,
  onRequestMapInteraction,
  planPreview,
  hasProjectLocation = false,
  mapStyle,
  onMapStyleChange,
  mapRef,
  projectConfig,
  onSegmentEdit,
  onSegmentDelete,
  onPointIgnitionEdit,
  onFuelBreakDelete,
  terrainState,
  onTerrainChange,
  runActionsEnabled = false,
  onCommitPlanGridField,
  hasSimulationResults = false,
  simulationRunning = false,
  simulationTimesteps = 12000,
  onSimulationTimestepsChange,
  playbackRate = 1,
  onPlaybackRateChange,
  replayState = "idle",
  canReplay = false,
  onReplayPlay,
  onReplayPause,
  layout = "overlay",
}: MapOverlayPanelsProps) {
  if (layout === "run-config-overlay") {
    return (
      <div className="pointer-events-none absolute right-2 top-2 z-450 sm:right-3 sm:top-3">
        <RunConfigPanel
          onStartSimulation={onStartSimulation}
          onResetRequest={onResetRequest}
          runActionsEnabled={runActionsEnabled}
          simulationRunning={simulationRunning}
          simulationTimesteps={simulationTimesteps}
          onSimulationTimestepsChange={onSimulationTimestepsChange}
          playbackRate={playbackRate}
          onPlaybackRateChange={onPlaybackRateChange}
          replayState={replayState}
          canReplay={canReplay}
          onReplayPlay={onReplayPlay}
          onReplayPause={onReplayPause}
        />
      </div>
    );
  }

  if (layout === "map-utilities") {
    return (
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
        <MapControlsPanel mapStyle={mapStyle} onMapStyleChange={onMapStyleChange} mapRef={mapRef} />
      </div>
    );
  }

  return (
    <>
      {/* Top-left: Scenario + Run Config side by side, with Ignition Lines below Run Config */}
      <div className="pointer-events-none absolute left-2 top-2 z-450 flex items-start gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
        <ScenarioPanel
          weather={weather}
          onWeatherOverride={onWeatherOverride}
          onWeatherFetched={onWeatherFetched}
          onWeatherFetchedAtCoords={onWeatherFetchedAtCoords}
          onOpenActionModal={onOpenActionModal}
          onRequestMapInteraction={onRequestMapInteraction}
          onRelocateRequest={onRelocateRequest}
          planPreview={planPreview}
          plan={projectConfig}
          onCommitGridField={onCommitPlanGridField}
          hasProjectLocation={hasProjectLocation}
          hasSimulationResults={hasSimulationResults}
          playbackRate={playbackRate}
          onPlaybackRateChange={onPlaybackRateChange}
        />
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <RunConfigPanel
            onStartSimulation={onStartSimulation}
            onResetRequest={onResetRequest}
            runActionsEnabled={runActionsEnabled}
            simulationRunning={simulationRunning}
            playbackRate={playbackRate}
            onPlaybackRateChange={onPlaybackRateChange}
            replayState={replayState}
            canReplay={canReplay}
            onReplayPlay={onReplayPlay}
            onReplayPause={onReplayPause}
          />
          {projectConfig && onSegmentEdit && onSegmentDelete && onPointIgnitionEdit && (
            <IgnitionParametersPanel
              plan={projectConfig}
              onSegmentEdit={onSegmentEdit}
              onSegmentDelete={onSegmentDelete}
              onPointIgnitionEdit={onPointIgnitionEdit}
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
      <div className="pointer-events-none absolute right-2 top-2 z-450 w-[160px] sm:right-3 sm:top-3 sm:w-[175px] md:w-[190px]">
        <ProgressPanel stats={stats} terrainState={terrainState} />
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
