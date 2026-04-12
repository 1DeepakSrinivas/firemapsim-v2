"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Bot,
  ChevronRight,
  Clock,
  Crosshair,
  Layers,
  MapPin,
  Minus,
  Play,
  Shield,
  Sliders,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { UIMessage } from "ai";

import { ShimmerText } from "@/components/ui/ShimmerText";
import {
  detectPlanStepStatus,
  parsePlanSteps,
  type PlanStepStatus,
} from "@/lib/plan-steps";
import { cn } from "@/lib/utils";
import type { WeatherValues } from "@/components/weather/WeatherPreview";

// ─── Types ────────────────────────────────────────────────────────────────────

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

type SimStats = {
  burning: number;
  burned: number;
  unburned: number;
  weatherSource?: string;
  streamStatus: string;
  shapes: number;
};

type SimSidebarProps = {
  messages: UIMessage[];
  onStartSimulation?: () => void;
  onAskAgent?: () => void;
  stats?: SimStats;
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
};

type DrawerId = "progress" | "scenario" | "run" | "agent" | "layers";

function shimmerStateForStep(s: PlanStepStatus): "in_progress" | "complete" | "error" {
  if (s === "running") return "in_progress";
  if (s === "error") return "error";
  return "complete";
}

// ─── Drawer shell ─────────────────────────────────────────────────────────────

function Drawer({
  id,
  open,
  onToggle,
  icon: Icon,
  label,
  badge,
  children,
}: {
  id: DrawerId;
  open: boolean;
  onToggle: (id: DrawerId) => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/6 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
          open ? "text-white" : "text-white/50 hover:text-white/80",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-[11px] font-semibold tracking-wide">{label}</span>
        {badge}
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200 text-white/30",
            open && "rotate-90",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Small inline editable field ──────────────────────────────────────────────

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

  function commit() {
    const n = Number(draft);
    if (!Number.isNaN(n)) onCommit(n);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-white/40">{label}</span>
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
          className="w-20 rounded border border-white/15 bg-white/8 px-2 py-0.5 text-right text-[11px] text-white outline-none focus:border-orange-400/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true); }}
          className="group flex items-center gap-1 text-[11px] text-white/70 hover:text-white"
        >
          {value}{suffix ? ` ${suffix}` : ""}
          <span className="text-[9px] text-white/20 group-hover:text-white/40">✎</span>
        </button>
      )}
    </div>
  );
}

// ─── Action button ─────────────────────────────────────────────────────────────

function ActionButton({
  onClick,
  label,
  icon: Icon,
  variant = "ghost",
  disabled,
}: {
  onClick?: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "ghost" | "primary" | "danger";
  disabled?: boolean;
}) {
  const cls = {
    ghost: "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90",
    primary: "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30",
    danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        cls,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </button>
  );
}

// ─── Scenario setup section ────────────────────────────────────────────────────

function ScenarioSetup({
  onStartSimulation,
}: {
  onStartSimulation?: () => void;
}) {
  const [zipCode, setZipCode] = useState("");
  const [timeframe, setTimeframe] = useState("current");

  return (
    <div className="space-y-3">
      {/* Setup actions */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">
          Setup Actions
        </p>
        <div className="space-y-1.5">
          <ActionButton label="Set Project Location" icon={MapPin} />
          <ActionButton label="Define Point Ignition" icon={Crosshair} />
          <ActionButton label="Define Line Ignition" icon={Zap} />
          <ActionButton label="Define Fuel Break" icon={Shield} />
        </div>
      </div>

      {/* Weather fetch */}
      <div className="border-t border-white/6 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">
          Weather Fetch
        </p>
        <div className="space-y-2">
          <input
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="Enter zip code"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <div className="flex gap-1.5">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-white/20"
            >
              <option value="current">Current</option>
              <option value="forecast">Forecast</option>
              <option value="historical">Historical</option>
            </select>
            <button
              type="button"
              disabled={!zipCode.trim()}
              className="rounded-lg bg-orange-500/20 px-3 py-1.5 text-[11px] font-medium text-orange-400 transition hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Fetch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Simulation progress section ───────────────────────────────────────────────

function SimProgress({ stats }: { stats?: SimStats }) {
  const isActive = stats?.streamStatus === "open";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          isActive ? "animate-pulse bg-emerald-400" : "bg-white/20",
        )} />
        <span className="text-[11px] text-white/50">
          {isActive ? "Streaming" : stats?.streamStatus ?? "Idle"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Burning", value: stats?.burning ?? 0, color: "text-red-400" },
          { label: "Burned", value: stats?.burned ?? 0, color: "text-orange-300" },
          { label: "Unburned", value: stats?.unburned ?? 0, color: "text-white/50" },
          { label: "Shapes", value: stats?.shapes ?? 0, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
            <p className="text-[10px] text-white/30">{label}</p>
            <p className={cn("text-sm font-semibold tabular-nums", color)}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {stats?.weatherSource && (
        <p className="text-[10px] text-white/30">
          Source: <span className="text-white/50">{stats.weatherSource}</span>
        </p>
      )}
    </div>
  );
}

// ─── Layers & weather section ──────────────────────────────────────────────────

function toCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8] ?? "N";
}

function LayersPanel({
  weather,
  onWeatherOverride,
}: {
  weather: WeatherValues;
  onWeatherOverride: (field: keyof WeatherValues, value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/25">
          Weather
        </p>
        <div className="divide-y divide-white/5 rounded-lg border border-white/8 bg-white/3 px-3">
          <InlineEdit
            label="Wind"
            value={weather.windSpeed}
            suffix={`mph ${toCompass(weather.windDirection)}`}
            onCommit={(v) => onWeatherOverride("windSpeed", v)}
          />
          <InlineEdit
            label="Direction"
            value={weather.windDirection}
            suffix="°"
            onCommit={(v) => onWeatherOverride("windDirection", v)}
          />
          <InlineEdit
            label="Temp"
            value={weather.temperature}
            suffix="°F"
            onCommit={(v) => onWeatherOverride("temperature", v)}
          />
          <InlineEdit
            label="Humidity"
            value={weather.humidity}
            suffix="%"
            onCommit={(v) => onWeatherOverride("humidity", v)}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Run configuration ─────────────────────────────────────────────────────────

function RunConfig({
  onStartSimulation,
  onAskAgent,
}: {
  onStartSimulation?: () => void;
  onAskAgent?: () => void;
}) {
  const [hours, setHours] = useState(24);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between py-1">
        <span className="text-[11px] text-white/40">Simulation hours</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHours((h) => Math.max(1, h - 1))}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
          <span className="w-8 text-center text-[11px] font-semibold text-white/80">{hours}h</span>
          <button
            type="button"
            onClick={() => setHours((h) => Math.min(72, h + 1))}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <ActionButton
          onClick={onStartSimulation}
          label="Start Simulation"
          icon={Play}
          variant="primary"
        />
        <ActionButton
          onClick={onAskAgent}
          label="Ask Agent To Run"
          icon={Bot}
          variant="ghost"
        />
      </div>
    </div>
  );
}

// ─── Agent plan section ────────────────────────────────────────────────────────

function AgentPlan({ messages }: { messages: UIMessage[] }) {
  const planSteps = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return [];
    return parsePlanSteps(getMessageText(last));
  }, [messages]);

  if (planSteps.length === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/3 p-3">
        <p className="font-mono text-[10px] leading-relaxed text-white/30">
          {"// Waiting for agent plan\n// Simulate(Area, Forecast);\n// [Tool] DEVS-FIRE;\n// [Output] Perimeter_Map_v3"}
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {planSteps.map((step) => {
        const st = detectPlanStepStatus(step.text);
        const label = `${step.index}. ${step.text}`;
        if (st === "pending") {
          return (
            <li key={`${step.index}-${step.text}`} className="text-[11px] text-white/35">
              {label}
            </li>
          );
        }
        return (
          <li key={`${step.index}-${step.text}`} className="text-[11px]">
            <ShimmerText text={label} state={shimmerStateForStep(st)} />
          </li>
        );
      })}
    </ol>
  );
}

// ─── Main sidebar ──────────────────────────────────────────────────────────────

export function SimSidebar({
  messages,
  onStartSimulation,
  onAskAgent,
  stats,
  weather,
  onWeatherOverride,
}: SimSidebarProps) {
  const isActive = stats?.streamStatus === "open";
  const [openDrawer, setOpenDrawer] = useState<DrawerId>("scenario");

  // Auto-open progress drawer when simulation starts
  useEffect(() => {
    if (isActive) setOpenDrawer("progress");
  }, [isActive]);

  function toggle(id: DrawerId) {
    setOpenDrawer((prev) => (prev === id ? "scenario" : id));
  }

  return (
    <motion.aside
      className="cedar-scroll flex w-[240px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#141414]"
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Simulation Progress */}
      <Drawer
        id="progress"
        open={openDrawer === "progress"}
        onToggle={toggle}
        icon={Activity}
        label="Simulation Progress"
        badge={
          isActive ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
              <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
              Live
            </span>
          ) : null
        }
      >
        <SimProgress stats={stats} />
      </Drawer>

      {/* Scenario Setup */}
      <Drawer
        id="scenario"
        open={openDrawer === "scenario"}
        onToggle={toggle}
        icon={MapPin}
        label="Scenario Setup"
      >
        <ScenarioSetup onStartSimulation={onStartSimulation} />
      </Drawer>

      {/* Run Configuration */}
      <Drawer
        id="run"
        open={openDrawer === "run"}
        onToggle={toggle}
        icon={Sliders}
        label="Run Configuration"
      >
        <RunConfig onStartSimulation={onStartSimulation} onAskAgent={onAskAgent} />
      </Drawer>

      {/* Agent Plan */}
      <Drawer
        id="agent"
        open={openDrawer === "agent"}
        onToggle={toggle}
        icon={Bot}
        label="Agent Plan"
        badge={
          messages.some((m) => m.role === "assistant") ? (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">
              {messages.filter((m) => m.role === "assistant").length}
            </span>
          ) : null
        }
      >
        <AgentPlan messages={messages} />
      </Drawer>

      {/* Layers & Analysis */}
      <Drawer
        id="layers"
        open={openDrawer === "layers"}
        onToggle={toggle}
        icon={Layers}
        label="Layers & Analysis"
      >
        <LayersPanel weather={weather} onWeatherOverride={onWeatherOverride} />
      </Drawer>
    </motion.aside>
  );
}
