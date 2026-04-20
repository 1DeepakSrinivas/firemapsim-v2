"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Flame,
  LayoutGrid,
  Grid2x2,
  Loader2,
  MapPin,
  Minus,
  Shield,
  Sliders,
  Trash2,
  Wind,
  Pencil,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type {
  IgnitionPlan,
  SegmentEdit,
} from "@/types/ignitionPlan";
import {
  IGNITION_TEAM_PICKER_COUNT,
  ignitionModeForGeometry,
  ignitionModeOptionsForCurrent,
} from "@/types/ignitionPlan";
import type { MapInteractionMode } from "./MapInteractionLayer";
import { type ActionId } from "./ActionModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceSidebarProps = {
  projectTitle: string;
  projectConfig: IgnitionPlan;
  weather: WeatherValues;
  onCommitPlanGridField: (
    field: "cellResolution" | "cellSpaceDimension" | "cellSpaceDimensionLat",
    value: number,
  ) => void;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
  onWeatherFetched: (w: WeatherValues) => void;
  onWeatherFetchedAtCoords?: (
    next: WeatherValues,
    coords: { lat: number; lng: number },
    label?: string,
  ) => void;
  onOpenActionModal: (id: ActionId) => void;
  onRequestMapInteraction: (
    mode: MapInteractionMode,
    action?: "location" | "fuel-break" | "line-ignition",
  ) => void;
  simulationTimesteps: number;
  onSimulationTimestepsChange: (value: number) => void;
  onStartSimulation: (timesteps: number) => void;
  onAskAgent: () => void;
  /** Emits upward — modal host owns the confirm dialog */
  onResetRequest: () => void;
  /** Emits upward — modal host owns the relocate dialog */
  onRelocateRequest: () => void;
  onSegmentEdit: (edit: SegmentEdit) => void;
  onSegmentDelete: (teamIndex: number, segmentIndex: number) => void;
  onPointIgnitionEdit: (input: {
    teamIndex: number;
    segmentIndex: number;
    x: number;
    y: number;
  }) => void;
  onFuelBreakDelete: (index: number) => void;
  runActionsEnabled: boolean;
  simulationRunning: boolean;
  hasProjectLocation: boolean;
  hasSimulationResults: boolean;
  planPreview?: { segments: number; fuelBreaks: number; centerSet: boolean };
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  onRenameProject: (title: string) => Promise<boolean>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8] ?? "N";
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
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
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
          className="h-auto w-20 border-input px-1.5 py-0.5 text-right text-xs"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setDraft(String(value)); setEditing(true); }}
          className="group h-auto gap-1 px-1 text-xs font-medium text-foreground hover:bg-transparent"
        >
          {value}{suffix ? ` ${suffix}` : ""}
          <span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground">✎</span>
        </Button>
      )}
    </div>
  );
}

// ─── Section wrapper used inside SidebarGroupContent ─────────────────────────

function SidebarSection({
  icon: Icon,
  label,
  defaultOpen = false,
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/section mb-1.5 last:mb-0 data-[state=open]:mb-2.5"
    >
      <CollapsibleTrigger asChild>
        <SidebarMenuButton className="w-full justify-between font-medium group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">{label}</span>
          </span>
          <span className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
            {badge}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-180" />
          </span>
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
        <div className="mt-1.5 space-y-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── ActionButton inside sidebar ─────────────────────────────────────────────

function SidebarActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  variant = "ghost",
  title,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "ghost" | "primary" | "danger";
  title?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "bg-primary/10 text-primary hover:bg-primary/20"
          : variant === "danger"
            ? "border border-destructive/25 bg-destructive/10 text-destructive/80 hover:bg-destructive/20"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Button>
  );
}

// ─── Ignition mode select ─────────────────────────────────────────────────────

function SidebarIgnitionModeSelect({
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
  const options = ignitionModeOptionsForCurrent(value, isPoint);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onSegmentEdit({ teamIndex, segmentIndex: segIndex, mode: nextValue })
      }
    >
      <SelectTrigger className="h-auto w-full border-border/60 px-2 py-1 text-xs">
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

// ─── Project Location section ─────────────────────────────────────────────────

function ProjectLocationSection({
  hasProjectLocation,
  hasSimulationResults,
  planPreview,
  onOpenActionModal,
  onRelocateRequest,
}: Pick<
  WorkspaceSidebarProps,
  | "hasProjectLocation"
  | "hasSimulationResults"
  | "planPreview"
  | "onOpenActionModal"
  | "onRelocateRequest"
>) {
  const locationLocked = hasSimulationResults;

  function handleLocationClick() {
    if (locationLocked) return;
    if (hasProjectLocation) {
      onRelocateRequest();
    } else {
      onOpenActionModal("location");
    }
  }

  return (
    <SidebarSection icon={MapPin} label="Project Location" defaultOpen>
      <SidebarActionBtn
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
              ? "Change project location — all scenario data will be reset"
              : undefined
        }
        onClick={handleLocationClick}
      />
      {locationLocked && (
        <p className="text-[10px] leading-relaxed text-muted-foreground/60">
          Location locked after simulation. Reset project to start fresh.
        </p>
      )}
      {!locationLocked && hasProjectLocation && (
        <p className="text-[10px] leading-relaxed text-amber-500/70">
          Changing location resets ignitions, fuel breaks and terrain.
        </p>
      )}
      {planPreview && (
        <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground/60">
          {planPreview.centerSet ? "Area set" : "No area"} · {planPreview.segments} segment{planPreview.segments === 1 ? "" : "s"} · {planPreview.fuelBreaks} break{planPreview.fuelBreaks === 1 ? "" : "s"}
        </p>
      )}
    </SidebarSection>
  );
}

// ─── Cell Grid section ────────────────────────────────────────────────────────

function CellGridSection({
  projectConfig,
  onCommitPlanGridField,
}: Pick<WorkspaceSidebarProps, "projectConfig" | "onCommitPlanGridField">) {
  return (
    <SidebarSection icon={Grid2x2} label="Cell Grid">
      <p className="text-[10px] leading-relaxed text-muted-foreground/60 pb-0.5">
        Defines the square project boundary (N×N cells).
      </p>
      <div className="divide-y divide-border/50 rounded-md border border-border/50 bg-background/50 px-2">
        <InlineEdit
          label="Cell resolution"
          value={projectConfig.cellResolution}
          suffix="m / cell"
          onCommit={(v) =>
            onCommitPlanGridField("cellResolution", Math.max(1, Math.min(500, Math.round(v))))
          }
        />
        <InlineEdit
          label="Cells (side)"
          value={projectConfig.cellSpaceDimension}
          onCommit={(v) => {
            const clamped = Math.max(10, Math.min(2000, Math.round(v)));
            onCommitPlanGridField("cellSpaceDimension", clamped);
            onCommitPlanGridField("cellSpaceDimensionLat", clamped);
          }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/50">
        ≈ {((projectConfig.cellSpaceDimension * projectConfig.cellResolution) / 1000).toFixed(1)} km × {((projectConfig.cellSpaceDimension * projectConfig.cellResolution) / 1000).toFixed(1)} km
      </p>
    </SidebarSection>
  );
}

// ─── Weather section ──────────────────────────────────────────────────────────

function WeatherSection({
  weather,
  onWeatherOverride,
  onWeatherFetched,
  onWeatherFetchedAtCoords,
}: Pick<
  WorkspaceSidebarProps,
  "weather" | "onWeatherOverride" | "onWeatherFetched" | "onWeatherFetchedAtCoords"
>) {
  const [weatherQuery, setWeatherQuery] = useState("");
  const [fetching, setFetching] = useState(false);
  const [weatherFetchError, setWeatherFetchError] = useState<string | null>(null);

  const hasWeather = weather.windSpeed > 0 || weather.temperature > 0;

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
      if (!res.ok || !json.weather) throw new Error(json.error ?? "Weather fetch failed");
      onWeatherFetched(json.weather);
      if (typeof json.lat === "number" && typeof json.lng === "number" && onWeatherFetchedAtCoords) {
        onWeatherFetchedAtCoords(json.weather, { lat: json.lat, lng: json.lng }, json.placeLabel);
      }
      toast.success(json.placeLabel ? `${json.placeLabel} · current conditions` : "Current conditions loaded");
    } catch (e) {
      setWeatherFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  return (
    <SidebarSection
      icon={Wind}
      label="Weather & Layers"
      badge={hasWeather ? <span className="text-[9px] text-emerald-500">●</span> : undefined}
    >
      <div className="divide-y divide-border/50 rounded-md border border-border/50 bg-background/50 px-2">
        <InlineEdit label="Wind" value={weather.windSpeed} suffix={`mph ${toCompass(weather.windDirection)}`} onCommit={(v) => onWeatherOverride("windSpeed", v)} />
        <InlineEdit label="Direction" value={weather.windDirection} suffix="°" onCommit={(v) => onWeatherOverride("windDirection", v)} />
        <InlineEdit label="Temp" value={weather.temperature} suffix="°F" onCommit={(v) => onWeatherOverride("temperature", v)} />
        <InlineEdit label="Humidity" value={weather.humidity} suffix="%" onCommit={(v) => onWeatherOverride("humidity", v)} />
      </div>

      <div className="pt-1 space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground">Weather Lookup</p>
        <div className="flex gap-1.5">
          <Input
            value={weatherQuery}
            onChange={(e) => setWeatherQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleFetchWeather(); }}
            placeholder="City, address, or ZIP"
            autoComplete="postal-code"
            className="h-auto min-w-0 flex-1 border-border/60 px-2 py-1.5 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleFetchWeather()}
            disabled={!weatherQuery.trim() || fetching}
            className="h-auto shrink-0 rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fetch"}
          </Button>
        </div>
        {weatherFetchError && (
          <p className="text-[10px] leading-snug text-destructive">{weatherFetchError}</p>
        )}
      </div>
    </SidebarSection>
  );
}

// ─── Ignition Parameters section ─────────────────────────────────────────────

function IgnitionSection({
  projectConfig,
  hasProjectLocation,
  onSegmentEdit,
  onSegmentDelete,
  onPointIgnitionEdit,
  onOpenActionModal,
  onRequestMapInteraction,
}: Pick<WorkspaceSidebarProps, "projectConfig" | "hasProjectLocation" | "onSegmentEdit" | "onSegmentDelete" | "onPointIgnitionEdit" | "onOpenActionModal" | "onRequestMapInteraction">) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const forwardSegmentEdit = useCallback(
    (edit: SegmentEdit) => {
      if (edit.moveToTeamIndex !== undefined) setOpenKey(null);
      onSegmentEdit(edit);
    },
    [onSegmentEdit],
  );

  const rows: {
    kind: "line" | "point";
    teamIndex: number;
    segIndex: number;
    seg: IgnitionPlan["team_infos"][number]["details"][number];
    key: string;
  }[] = [];

  projectConfig.team_infos.forEach((team, ti) => {
    team.details.forEach((seg, si) => {
      const key = `${ti}-${si}`;
      const isPoint = seg.start_x === seg.end_x && seg.start_y === seg.end_y;
      rows.push({ kind: isPoint ? "point" : "line", teamIndex: ti, segIndex: si, seg, key });
    });
  });

  const lineRows = rows.filter((r) => r.kind === "line");
  const pointRows = rows.filter((r) => r.kind === "point");

  const totalCount = rows.length;
  const badge = totalCount > 0
    ? <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-500">{totalCount}</span>
    : undefined;

  return (
    <SidebarSection icon={Flame} label="Ignition Parameters" badge={badge}>
      {/* Add buttons — always visible when location is set */}
      {hasProjectLocation && (
        <div className="flex gap-1 pb-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => onOpenActionModal("point-ignition")}
            className="h-auto flex-1 justify-start gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Crosshair className="h-3.5 w-3.5 shrink-0" /> Point
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => onOpenActionModal("line-ignition")}
            className="h-auto flex-1 justify-start gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Zap className="h-3.5 w-3.5 shrink-0" /> Line
          </Button>
        </div>
      )}
      {!hasProjectLocation && (
        <p className="text-[10px] text-muted-foreground/60">Set a project location first.</p>
      )}
      {hasProjectLocation && rows.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60">No ignitions defined yet. Use the buttons above to add.</p>
      ) : rows.length > 0 ? (
        <div className="space-y-0.5">
          {lineRows.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 pb-0.5">Lines ({lineRows.length})</p>
          )}
          {lineRows.map(({ teamIndex, segIndex, seg, key }) => {
            const isOpen = openKey === key;
            const dx = seg.end_x - seg.start_x;
            const dy = seg.end_y - seg.start_y;
            const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
            return (
              <div key={key}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  className="h-auto w-full justify-start gap-1.5 px-1.5 py-1 text-xs hover:bg-accent"
                >
                  <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <span className="flex-1 truncate text-left">Line · {segIndex + 1} <span className="text-muted-foreground/50">(T{teamIndex + 1})</span></span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">{dist}c</span>
                </Button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 rounded-md border border-border/50 bg-background/50 px-2.5 py-2 mt-1 mb-1">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Ignition type</p>
                          <SidebarIgnitionModeSelect teamIndex={teamIndex} segIndex={segIndex} mode={seg.mode} isPoint={false} onSegmentEdit={onSegmentEdit} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Speed (m/s)</span>
                          <Input
                            type="number" min={0.01} max={10} step={0.01} value={seg.speed}
                            onChange={(e) => onSegmentEdit({ teamIndex, segmentIndex: segIndex, speed: parseFloat(e.target.value) || seg.speed })}
                            className="h-auto w-16 border-border/60 px-2 py-1 text-center text-xs"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Distance (cells)</span>
                          <Input
                            type="number" min={1} step={1} placeholder="auto" value={seg.distance ?? ""}
                            onChange={(e) => onSegmentEdit({ teamIndex, segmentIndex: segIndex, distance: e.target.value === "" ? null : parseInt(e.target.value) })}
                            className="h-auto w-16 border-border/60 px-2 py-1 text-center text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Team</p>
                          <Select
                            value={String(Math.min(Math.max(0, teamIndex), IGNITION_TEAM_PICKER_COUNT - 1))}
                            onValueChange={(v) => forwardSegmentEdit({ teamIndex, segmentIndex: segIndex, moveToTeamIndex: parseInt(v, 10) })}
                          >
                            <SelectTrigger className="h-auto w-full border-border/60 px-2 py-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: IGNITION_TEAM_PICKER_COUNT }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>Team {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="rounded-md bg-muted/50 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground/60">({seg.start_x}, {seg.start_y}) → ({seg.end_x}, {seg.end_y})</p>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => { onSegmentDelete(teamIndex, segIndex); setOpenKey(null); }}
                          className="h-auto w-full rounded-md border border-destructive/20 py-1 text-xs text-destructive/70 hover:border-destructive/40 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Remove line
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {pointRows.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 pt-1 pb-0.5">Points ({pointRows.length})</p>
          )}
          {pointRows.map(({ teamIndex, segIndex, seg, key }) => {
            const isOpen = openKey === key;
            return (
              <div key={key}>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  className="h-auto w-full justify-start gap-1.5 px-1.5 py-1 text-xs hover:bg-accent"
                >
                  <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <span className="flex-1 truncate text-left">Point · {segIndex + 1} <span className="text-muted-foreground/50">(T{teamIndex + 1})</span></span>
                </Button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 rounded-md border border-border/50 bg-background/50 px-2.5 py-2 mt-1 mb-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground">X (cell)</p>
                            <Input type="number" step={1} value={seg.start_x}
                              onChange={(e) => onPointIgnitionEdit({ teamIndex, segmentIndex: segIndex, x: Math.round(Number(e.target.value)), y: seg.start_y })}
                              className="h-auto w-full border-border/60 px-2 py-1 text-center text-xs" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground">Y (cell)</p>
                            <Input type="number" step={1} value={seg.start_y}
                              onChange={(e) => onPointIgnitionEdit({ teamIndex, segmentIndex: segIndex, x: seg.start_x, y: Math.round(Number(e.target.value)) })}
                              className="h-auto w-full border-border/60 px-2 py-1 text-center text-xs" />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Ignition type</p>
                          <SidebarIgnitionModeSelect teamIndex={teamIndex} segIndex={segIndex} mode={seg.mode} isPoint onSegmentEdit={onSegmentEdit} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Speed (m/s)</span>
                          <Input type="number" min={0.01} max={10} step={0.01} value={seg.speed}
                            onChange={(e) => onSegmentEdit({ teamIndex, segmentIndex: segIndex, speed: parseFloat(e.target.value) || seg.speed })}
                            className="h-auto w-16 border-border/60 px-2 py-1 text-center text-xs" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Team</p>
                          <Select
                            value={String(Math.min(Math.max(0, teamIndex), IGNITION_TEAM_PICKER_COUNT - 1))}
                            onValueChange={(v) => forwardSegmentEdit({ teamIndex, segmentIndex: segIndex, moveToTeamIndex: parseInt(v, 10) })}
                          >
                            <SelectTrigger className="h-auto w-full border-border/60 px-2 py-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: IGNITION_TEAM_PICKER_COUNT }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>Team {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => { onSegmentDelete(teamIndex, segIndex); setOpenKey(null); }}
                          className="h-auto w-full rounded-md border border-destructive/20 py-1 text-xs text-destructive/70 hover:border-destructive/40 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Remove point
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : null}
    </SidebarSection>
  );
}

// ─── Fuel Breaks section ──────────────────────────────────────────────────────

function FuelBreaksSection({
  projectConfig,
  hasProjectLocation,
  onFuelBreakDelete,
  onOpenActionModal,
}: Pick<WorkspaceSidebarProps, "projectConfig" | "hasProjectLocation" | "onFuelBreakDelete" | "onOpenActionModal">) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const count = projectConfig.sup_infos.length;
  const badge = count > 0
    ? <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-500">{count}</span>
    : undefined;

  return (
    <SidebarSection icon={Shield} label="Fuel Breaks" badge={badge}>
      {/* Add button */}
      {hasProjectLocation && (
        <div className="pb-1">
          <SidebarActionBtn
            label="Define Fuel Break"
            icon={Shield}
            onClick={() => onOpenActionModal("fuel-break")}
          />
        </div>
      )}
      {!hasProjectLocation && (
        <p className="text-[10px] text-muted-foreground/60">Set a project location first.</p>
      )}
      {hasProjectLocation && count === 0 ? (
        <p className="text-[10px] text-muted-foreground/60">No fuel breaks defined yet. Use the button above to add.</p>
      ) : count > 0 ? (
        <div className="space-y-0.5">
          {projectConfig.sup_infos.map((rect, idx) => {
            const isOpen = openIdx === idx;
            const w = Math.abs(rect.x2 - rect.x1);
            const h = Math.abs(rect.y2 - rect.y1);
            return (
              <div key={idx}>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="h-auto w-full justify-start gap-1.5 px-1.5 py-1 text-xs hover:bg-accent"
                >
                  <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <span className="flex-1 truncate text-left">Break {idx + 1}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">{w}×{h}c</span>
                </Button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 rounded-md border border-border/50 bg-background/50 px-2.5 py-2 mt-1 mb-1">
                        <div className="rounded-md bg-muted/50 px-2 py-1.5 space-y-0.5">
                          <p className="text-[10px] text-muted-foreground/60">Top-left: ({rect.x1}, {rect.y1})</p>
                          <p className="text-[10px] text-muted-foreground/60">Bottom-right: ({rect.x2}, {rect.y2})</p>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => { onFuelBreakDelete(idx); setOpenIdx(null); }}
                          className="h-auto w-full rounded-md border border-destructive/20 py-1 text-xs text-destructive/70 hover:border-destructive/40 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Remove break
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : null}
    </SidebarSection>
  );
}

// ─── Duration section ─────────────────────────────────────────────────────────

function DurationSection({
  simulationTimesteps,
  onSimulationTimestepsChange,
}: Pick<
  WorkspaceSidebarProps,
  | "simulationTimesteps"
  | "onSimulationTimestepsChange"
  | "simulationRunning"
>) {
  return (
    <SidebarSection icon={Sliders} label="Run Configuration" defaultOpen>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Timesteps</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            onClick={() => onSimulationTimestepsChange(Math.max(1000, simulationTimesteps - 1000))}
            className="h-6 w-6 border-border/60 text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-2.5 w-2.5" />
          </Button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums">{simulationTimesteps}</span>
          <Button
            variant="outline" size="icon"
            onClick={() => onSimulationTimestepsChange(Math.min(100_000, simulationTimesteps + 1000))}
            className="h-6 w-6 border-border/60 text-muted-foreground hover:text-foreground"
          >
            +
          </Button>
        </div>
      </div>
    </SidebarSection>
  );
}


// ─── Main export ──────────────────────────────────────────────────────────────

export function WorkspaceSidebar({
  projectTitle,
  projectConfig,
  weather,
  onCommitPlanGridField,
  onWeatherOverride,
  onWeatherFetched,
  onWeatherFetchedAtCoords,
  onOpenActionModal,
  onRequestMapInteraction,
  simulationTimesteps,
  onSimulationTimestepsChange,
  onStartSimulation,
  onAskAgent,
  onResetRequest,
  onRelocateRequest,
  onSegmentEdit,
  onSegmentDelete,
  onPointIgnitionEdit,
  onFuelBreakDelete,
  runActionsEnabled,
  simulationRunning,
  hasProjectLocation,
  hasSimulationResults,
  planPreview,
  playbackRate,
  onPlaybackRateChange,
  onRenameProject,
}: WorkspaceSidebarProps) {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const userName = user?.fullName ?? user?.firstName ?? user?.username ?? "FireMapSim";
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "Manage your account";
  const [editingProjectTitle, setEditingProjectTitle] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState(projectTitle);
  const [savingProjectTitle, setSavingProjectTitle] = useState(false);

  useEffect(() => {
    if (!editingProjectTitle) {
      setProjectTitleDraft(projectTitle);
    }
  }, [projectTitle, editingProjectTitle]);

  const handleSaveProjectTitle = useCallback(async () => {
    const nextTitle = projectTitleDraft.trim();
    if (!nextTitle) {
      return;
    }
    if (nextTitle === projectTitle) {
      setEditingProjectTitle(false);
      return;
    }
    setSavingProjectTitle(true);
    try {
      const ok = await onRenameProject(nextTitle);
      if (ok) {
        setEditingProjectTitle(false);
      }
    } finally {
      setSavingProjectTitle(false);
    }
  }, [onRenameProject, projectTitle, projectTitleDraft]);

  const handleCancelProjectTitle = useCallback(() => {
    setEditingProjectTitle(false);
    setProjectTitleDraft(projectTitle);
  }, [projectTitle]);

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="icon"
      className="border-r border-sidebar-border/80"
    >
      {/* ── Header ── */}
      <SidebarHeader className="border-b border-sidebar-border/70 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="gap-3 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0" asChild>
              <div className="group-data-[collapsible=icon]:justify-center">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Flame className="size-4" />
                </div>
                <div className="min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  {editingProjectTitle ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={projectTitleDraft}
                        onChange={(event) => setProjectTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleSaveProjectTitle();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            handleCancelProjectTitle();
                          }
                        }}
                        className="h-6 border-sidebar-border/70 bg-sidebar px-1.5 py-0 text-xs"
                        disabled={savingProjectTitle}
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => void handleSaveProjectTitle()}
                        disabled={savingProjectTitle || !projectTitleDraft.trim()}
                        title="Save project name"
                      >
                        {savingProjectTitle ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={handleCancelProjectTitle}
                        disabled={savingProjectTitle}
                        title="Cancel rename"
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex w-full min-w-0 items-center gap-1">
                      <span className="block truncate text-sm font-semibold">{projectTitle}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-5 text-sidebar-foreground/65 hover:text-sidebar-foreground"
                        onClick={() => setEditingProjectTitle(true)}
                        title="Rename project"
                      >
                        <Pencil className="size-2.5" />
                      </Button>
                    </div>
                  )}
                  <span className="block truncate text-xs text-sidebar-foreground/60">Project workspace</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent className="overflow-y-auto">
        <SidebarGroup className="px-2 pt-3 pb-2">
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/dashboard">
                    <LayoutGrid className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/docs" target="_blank" rel="noopener noreferrer">
                    <BookOpen className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">Documentation</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-2 pb-3">
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <ProjectLocationSection
                  hasProjectLocation={hasProjectLocation}
                  hasSimulationResults={hasSimulationResults}
                  planPreview={planPreview}
                  onOpenActionModal={onOpenActionModal}
                  onRelocateRequest={onRelocateRequest}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <CellGridSection
                  projectConfig={projectConfig}
                  onCommitPlanGridField={onCommitPlanGridField}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <WeatherSection
                  weather={weather}
                  onWeatherOverride={onWeatherOverride}
                  onWeatherFetched={onWeatherFetched}
                  onWeatherFetchedAtCoords={onWeatherFetchedAtCoords}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <IgnitionSection
                  projectConfig={projectConfig}
                  hasProjectLocation={hasProjectLocation}
                  onSegmentEdit={onSegmentEdit}
                  onSegmentDelete={onSegmentDelete}
                  onPointIgnitionEdit={onPointIgnitionEdit}
                  onOpenActionModal={onOpenActionModal}
                  onRequestMapInteraction={onRequestMapInteraction}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <FuelBreaksSection
                  projectConfig={projectConfig}
                  hasProjectLocation={hasProjectLocation}
                  onFuelBreakDelete={onFuelBreakDelete}
                  onOpenActionModal={onOpenActionModal}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <DurationSection
                  simulationTimesteps={simulationTimesteps}
                  onSimulationTimestepsChange={onSimulationTimestepsChange}
                  simulationRunning={simulationRunning}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
              <button
                type="button"
                onClick={() => openUserProfile()}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-sidebar-border/70 px-2 py-1.5 text-left hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:hidden"
                title="Open account settings"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                  {user?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.imageUrl}
                      alt={userName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (userName[0] ?? "U").toUpperCase()
                  )}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{userName}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
                </span>
              </button>
              <ThemeSwitcher />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
