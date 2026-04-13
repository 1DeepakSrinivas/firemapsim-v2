"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, PenLine, RectangleHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search } from "lucide-react";
import type { MapInteractionMode } from "./MapInteractionLayer";

import { cn } from "@/lib/utils";
import type { ActionPayload, BoundaryGeoJSON } from "@/types/ignitionPlan";

// ─── Action IDs & configs ─────────────────────────────────────────────────────

export type ActionId = "location" | "point-ignition" | "line-ignition" | "fuel-break";

type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text";
  placeholder?: string;
  suffix?: string;
};

export type ActionModalConfig = {
  id: ActionId;
  title: string;
  /** First user message sent to the agent when the modal opens */
  agentSeed: string;
  fields: FieldDef[];
};

export const ACTION_MODAL_CONFIGS: Record<ActionId, ActionModalConfig> = {
  location: {
    id: "location",
    title: "Set Project Location",
    agentSeed:
      "I need to set the simulation project location. Please ask me for a street address or place name. Use geocodeAddress to resolve it, then emit an ```action-result``` block with action \"location\" and the resolved proj_center_lng, proj_center_lat (in decimal degrees), plus cellResolution (default 30) and cellSpaceDimension (default 200).",
    fields: [
      // Manual tab for location uses polygon draw on map — fields are not shown directly
    ],
  },
  "point-ignition": {
    id: "point-ignition",
    title: "Define Point Ignition",
    agentSeed: "", // not used — goes straight to map
    fields: [],    // not used
  },
  "line-ignition": {
    id: "line-ignition",
    title: "Define Line Ignition",
    agentSeed: "", // not used — goes straight to map
    fields: [],    // not used
  },
  "fuel-break": {
    id: "fuel-break",
    title: "Define Fuel Break",
    agentSeed:
      "Help me define a linear fuel break / suppression segment in grid coordinates (x1, y1) to (x2, y2). When ready, output ```action-result``` JSON with action \"fuel-break\" and numeric fields.",
    fields: [
      { key: "x1", label: "X1", type: "number" },
      { key: "y1", label: "Y1", type: "number" },
      { key: "x2", label: "X2", type: "number" },
      { key: "y2", label: "Y2", type: "number" },
    ],
  },
};

// ─── Parse ```action-result``` blocks ─────────────────────────────────────────

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function parseActionResultBlocks(raw: string): {
  displayText: string;
  payloads: unknown[];
} {
  const payloads: unknown[] = [];
  const displayText = raw
    .replace(/```action-result\n([\s\S]*?)```/g, (_, json: string) => {
      try {
        payloads.push(JSON.parse(json.trim()));
      } catch {
        // ignore
      }
      return "";
    })
    .trim();
  return { displayText, payloads };
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** Best-effort: turn parsed JSON into ActionPayload for the expected action */
export function payloadFromAgentJson(
  actionId: ActionId,
  data: unknown,
): ActionPayload | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const a = o.action;
  if (typeof a !== "string") return null;

  switch (actionId) {
    case "location": {
      if (a !== "location") return null;
      const proj_center_lng = coerceNumber(o.proj_center_lng);
      const proj_center_lat = coerceNumber(o.proj_center_lat);
      if (proj_center_lng === undefined || proj_center_lat === undefined) return null;
      return {
        action: "location",
        proj_center_lng,
        proj_center_lat,
        cellResolution: coerceNumber(o.cellResolution),
        cellSpaceDimension: coerceNumber(o.cellSpaceDimension),
        cellSpaceDimensionLat: coerceNumber(o.cellSpaceDimensionLat),
      };
    }
    case "point-ignition": {
      if (a !== "point-ignition") return null;
      const pointsRaw = o.points;
      if (!Array.isArray(pointsRaw)) return null;
      const points: Array<{ x: number; y: number; speed?: number; mode?: string }> = [];
      for (const p of pointsRaw) {
        if (!p || typeof p !== "object") continue;
        const rec = p as Record<string, unknown>;
        const x = coerceNumber(rec.x);
        const y = coerceNumber(rec.y);
        if (x === undefined || y === undefined) continue;
        const speed = coerceNumber(rec.speed);
        const mode = typeof rec.mode === "string" ? rec.mode : undefined;
        points.push({ x, y, ...(speed !== undefined ? { speed } : {}), ...(mode ? { mode } : {}) });
      }
      if (points.length === 0) return null;
      return { action: "point-ignition", points };
    }
    case "line-ignition": {
      if (a !== "line-ignition") return null;
      const start_x = coerceNumber(o.start_x);
      const start_y = coerceNumber(o.start_y);
      const end_x = coerceNumber(o.end_x);
      const end_y = coerceNumber(o.end_y);
      if (
        start_x === undefined ||
        start_y === undefined ||
        end_x === undefined ||
        end_y === undefined
      ) {
        return null;
      }
      const speed = coerceNumber(o.speed);
      const mode = typeof o.mode === "string" ? o.mode : undefined;
      return {
        action: "line-ignition",
        start_x,
        start_y,
        end_x,
        end_y,
        ...(speed !== undefined ? { speed } : {}),
        ...(mode ? { mode } : {}),
      };
    }
    case "fuel-break": {
      if (a !== "fuel-break") return null;
      const x1 = coerceNumber(o.x1);
      const y1 = coerceNumber(o.y1);
      const x2 = coerceNumber(o.x2);
      const y2 = coerceNumber(o.y2);
      if (
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined
      ) {
        return null;
      }
      return {
        action: "fuel-break",
        x1,
        y1,
        x2,
        y2,
      };
    }
    default:
      return null;
  }
}

function manualFormToPayload(actionId: ActionId, values: Record<string, string>): ActionPayload | null {
  const num = (k: string) => {
    const v = values[k];
    if (v === undefined || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  };
  const txt = (k: string) => values[k]?.trim() ?? "";

  switch (actionId) {
    case "location": {
      const proj_center_lng = num("proj_center_lng");
      const proj_center_lat = num("proj_center_lat");
      if (proj_center_lng === undefined || proj_center_lat === undefined) return null;
      return {
        action: "location",
        proj_center_lng,
        proj_center_lat,
        cellResolution: num("cellResolution"),
        cellSpaceDimension: num("cellSpaceDimension"),
      };
    }
    case "point-ignition": {
      const xs = txt("xs")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s));
      const ys = txt("ys")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s));
      if (xs.length === 0 || xs.length !== ys.length || xs.some((n) => Number.isNaN(n)) || ys.some((n) => Number.isNaN(n))) {
        return null;
      }
      const speedN = num("speed");
      const modeStr = txt("mode");
      const points = xs.map((x, i) => ({
        x,
        y: ys[i]!,
        ...(speedN !== undefined ? { speed: speedN } : {}),
        ...(modeStr ? { mode: modeStr } : {}),
      }));
      return { action: "point-ignition", points };
    }
    case "line-ignition": {
      const start_x = num("start_x");
      const start_y = num("start_y");
      const end_x = num("end_x");
      const end_y = num("end_y");
      if (
        start_x === undefined ||
        start_y === undefined ||
        end_x === undefined ||
        end_y === undefined
      ) {
        return null;
      }
      const sp = num("speed");
      const mode = txt("mode");
      return {
        action: "line-ignition",
        start_x,
        start_y,
        end_x,
        end_y,
        ...(sp !== undefined ? { speed: sp } : {}),
        ...(mode ? { mode } : {}),
      };
    }
    case "fuel-break": {
      const x1 = num("x1");
      const y1 = num("y1");
      const x2 = num("x2");
      const y2 = num("y2");
      if (
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined
      ) {
        return null;
      }
      return {
        action: "fuel-break",
        x1,
        y1,
        x2,
        y2,
      };
    }
    default:
      return null;
  }
}

// ─── Manual tab ───────────────────────────────────────────────────────────────

function ManualTab({
  actionId,
  initialValues,
  onValuesChange,
}: {
  actionId: ActionId;
  initialValues: Record<string, string>;
  onValuesChange: (v: Record<string, string>) => void;
}) {
  const cfg = ACTION_MODAL_CONFIGS[actionId];

  return (
    <div className="space-y-2.5">
      {cfg.fields.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/45">{f.label}</span>
          <div className="flex items-center gap-1">
            <input
              type={f.type === "number" ? "number" : "text"}
              value={initialValues[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) =>
                onValuesChange({ ...initialValues, [f.key]: e.target.value })
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-orange-400/40"
            />
            {f.suffix ? (
              <span className="shrink-0 text-[10px] text-white/30">{f.suffix}</span>
            ) : null}
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Agent tab (embedded chat) ────────────────────────────────────────────────

function AgentTabBody({
  actionId,
  threadId,
  onPendingPayload,
}: {
  actionId: ActionId;
  threadId: string;
  onPendingPayload: (p: ActionPayload | null) => void;
}) {
  const cfg = ACTION_MODAL_CONFIGS[actionId];
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: () => ({ threadId }),
    }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract latest valid action-result for this action from completed assistant messages
  useEffect(() => {
    let latest: ActionPayload | null = null;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      if (status === "streaming" && msg === messages[messages.length - 1]) continue;
      const text = getMessageText(msg);
      const { payloads } = parseActionResultBlocks(text);
      for (const raw of payloads) {
        const parsed = payloadFromAgentJson(actionId, raw);
        if (parsed) latest = parsed;
      }
    }
    onPendingPayload(latest);
  }, [messages, status, actionId, onPendingPayload]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void sendMessage({ text: cfg.agentSeed });
  }, [cfg.agentSeed, sendMessage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="cedar-scroll mb-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/8 bg-[#0a0a0a]/45 p-2"
      >
        {messages.map((message) => {
          const raw = getMessageText(message);
          const { displayText } = parseActionResultBlocks(raw);
          const isUser = message.role === "user";
          return (
            <div
              key={message.id}
              className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[min(100%,14rem)] px-2.5 py-1.5 text-left text-[11px] leading-snug shadow-sm sm:max-w-[min(72%,18rem)] sm:px-3 sm:py-2 sm:text-[12px]",
                  isUser
                    ? "rounded-[0.95rem] rounded-br-sm bg-[#0A84FF] text-white text-pretty"
                    : "rounded-[0.95rem] rounded-bl-sm bg-[#3A3A3C] text-white/95 text-pretty",
                )}
              >
                <p className="whitespace-pre-wrap">
                  {displayText || (isBusy && message === messages[messages.length - 1] && !isUser ? "…" : "")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <AgentInputBar
        disabled={isBusy}
        onSend={async (text) => {
          await sendMessage({ text });
        }}
      />
    </div>
  );
}

function AgentInputBar({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  return (
    <form
      className="flex gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = input.trim();
        if (!t) return;
        setInput("");
        await onSend(t);
      }}
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Message the agent…"
        disabled={disabled}
        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-white/25 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="shrink-0 rounded-lg bg-orange-500/30 px-3 py-1.5 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/40 disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}

// ─── Location modal (standalone, no agent tab) ────────────────────────────────

type GeoResult = {
  lat: number;
  lng: number;
  displayName: string;
  boundaryGeoJSON?: import("@/types/ignitionPlan").BoundaryGeoJSON;
};

// Continental US + Alaska + Hawaii bounding box (generous)
const US_BOUNDS = { minLat: 17.0, maxLat: 71.5, minLng: -180.0, maxLng: -65.0 };

function isInUS(lat: number, lng: number): boolean {
  return (
    lat >= US_BOUNDS.minLat &&
    lat <= US_BOUNDS.maxLat &&
    lng >= US_BOUNDS.minLng &&
    lng <= US_BOUNDS.maxLng
  );
}

async function geocodeQuery(query: string): Promise<GeoResult> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("polygon_geojson", "1");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "FireSimApp/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    geojson?: { type: string; coordinates: unknown };
  }>;
  const usResults = data.filter((r) => isInUS(Number(r.lat), Number(r.lon)));
  if (!usResults.length) throw new Error("No results found in the United States");
  const first = usResults[0]!;

  // Only keep Polygon / MultiPolygon boundaries; points/lines are not useful
  let boundaryGeoJSON: GeoResult["boundaryGeoJSON"] = null;
  if (
    first.geojson &&
    (first.geojson.type === "Polygon" || first.geojson.type === "MultiPolygon")
  ) {
    boundaryGeoJSON = first.geojson as GeoResult["boundaryGeoJSON"];
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: first.display_name,
    boundaryGeoJSON,
  };
}

function flyMapToSearchResult(map: import("leaflet").Map, r: GeoResult) {
  void import("leaflet").then((L) => {
    if (r.boundaryGeoJSON) {
      const tmp = L.geoJSON(r.boundaryGeoJSON as Parameters<typeof L.geoJSON>[0]);
      try {
        const b = tmp.getBounds();
        if (b.isValid()) {
          map.fitBounds(b, { padding: [36, 36], maxZoom: 17, animate: true });
          tmp.remove();
          return;
        }
      } catch {
        /* fall through */
      }
      tmp.remove();
    }
    map.flyTo([r.lat, r.lng], 14, { animate: true, duration: 1.2 });
  });
}

function DrawModeButton({
  icon: Icon,
  label,
  description,
  color = "orange",
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color?: "orange" | "sky";
  onClick: () => void;
}) {
  const border = color === "sky" ? "hover:border-sky-500/30 hover:bg-sky-500/8" : "hover:border-orange-500/30 hover:bg-orange-500/8";
  const iconColor = color === "sky" ? "text-sky-400/70" : "text-orange-400/70";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left transition ${border}`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
      <div>
        <p className="text-[11px] font-medium text-white/80">{label}</p>
        <p className="text-[10px] text-white/35">{description}</p>
      </div>
    </button>
  );
}

function LocationModal({
  onClose,
  onLocationPreview,
  onRequestMapDraw,
  mapRef,
}: {
  onClose: () => void;
  /** Updates map preview (green); does not commit project location */
  onLocationPreview?: (preview: {
    lat: number;
    lng: number;
    boundaryGeoJSON: BoundaryGeoJSON;
  } | null) => void;
  onRequestMapDraw?: (mode: MapInteractionMode) => void;
  mapRef?: import("leaflet").Map | null;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeoResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    onLocationPreview?.(null);
    try {
      const r = await geocodeQuery(q);
      setResult(r);
      onLocationPreview?.({
        lat: r.lat,
        lng: r.lng,
        boundaryGeoJSON: r.boundaryGeoJSON ?? null,
      });
      if (mapRef) flyMapToSearchResult(mapRef, r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white/90">Set Project Location</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Address / zip search */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Search by address or zip code
          </p>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => { e.preventDefault(); void handleSearch(); }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResult(null);
                  setError(null);
                  onLocationPreview?.(null);
                }}
                placeholder="e.g. 94102  or  123 Main St, Oakland CA"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-orange-400/40"
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="flex items-center gap-1 rounded-lg bg-orange-500/25 px-3 py-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/40 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
            </button>
          </form>

          {error ? (
            <p className="text-[10px] text-red-400">{error}</p>
          ) : null}

          {result ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
                <p className="text-[10px] font-semibold text-emerald-400">Found — map preview only</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/70">{result.displayName}</p>
                <p className="mt-1 text-[10px] text-white/35">
                  {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
                </p>
              </div>
              <p className="text-[10px] leading-snug text-white/45">
                The green outline or marker shows this search. To set the project area, draw a rectangle on the map
                (below or use the button when ready).
              </p>
            </div>
          ) : null}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/8" />
          <span className="text-[9px] uppercase tracking-wider text-white/25">or draw on map</span>
          <div className="h-px flex-1 bg-white/8" />
        </div>

        {/* Draw options */}
        <div className="space-y-2">
          <DrawModeButton
            icon={RectangleHorizontal}
            label="Draw project area (rectangle)"
            description="Two opposite corners define your simulation boundary — required to finish setup"
            color="sky"
            onClick={() => { onRequestMapDraw?.("rect"); onClose(); }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-[11px] text-white/50 transition hover:bg-white/5 hover:text-white/80"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!result}
          onClick={() => {
            onRequestMapDraw?.("rect");
            onClose();
          }}
          className="rounded-lg bg-orange-500/30 px-4 py-1.5 text-[11px] font-medium text-orange-100 transition hover:bg-orange-500/45 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Draw project rectangle
        </button>
      </div>
    </motion.div>
  );
}

// ─── Fuel Break Modal ─────────────────────────────────────────────────────────

function FuelBreakModal({
  onClose,
  onRequestMapDraw,
}: {
  onClose: () => void;
  onRequestMapDraw?: (mode: MapInteractionMode) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white/90">Define Fuel Break</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-[10px] text-white/40">
          Choose how to define the fuel break area on the map.
        </p>

        <DrawModeButton
          icon={PenLine}
          label="Draw a line (2 nodes)"
          description="Click start point, then click end point to define a suppression line"
          onClick={() => { onRequestMapDraw?.("line"); onClose(); }}
        />
        <DrawModeButton
          icon={Minus}
          label="Multi-node line"
          description="Click multiple nodes to trace a complex fuel break path, then press Escape to finish"
          onClick={() => { onRequestMapDraw?.("polyline"); onClose(); }}
        />
      </div>

      <div className="flex justify-end border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-[11px] text-white/50 transition hover:bg-white/5 hover:text-white/80"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/** Actions that bypass the modal and go straight to map interaction */
export const MAP_INTERACTION_ACTIONS: ActionId[] = ["point-ignition", "line-ignition"];
/** Location manual tab uses polygon draw */
export const POLYGON_DRAW_ACTIONS: ActionId[] = ["location"];

export type ActionModalProps = {
  actionId: ActionId | null;
  onClose: () => void;
  onConfirm: (payload: ActionPayload) => void;
  /** Called when the user picks a draw mode — carries the mode to activate */
  onRequestMapDraw?: (mode: MapInteractionMode) => void;
  mapRef?: import("leaflet").Map | null;
  /** Geocode preview for Set Project Location (green highlight); null clears */
  onLocationSearchPreview?: (
    preview: {
      lat: number;
      lng: number;
      boundaryGeoJSON: BoundaryGeoJSON;
    } | null,
  ) => void;
};

export function ActionModal({
  actionId,
  onClose,
  onConfirm,
  onRequestMapDraw,
  mapRef,
  onLocationSearchPreview,
}: ActionModalProps) {
  const [tab, setTab] = useState<"agent" | "manual">("agent");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [agentPayload, setAgentPayload] = useState<ActionPayload | null>(null);
  const [threadId, setThreadId] = useState<string>("");

  const cfg = actionId ? ACTION_MODAL_CONFIGS[actionId] : null;

  // Point/line ignition never show a modal — they go straight to map interaction
  const isMapOnly = actionId !== null && MAP_INTERACTION_ACTIONS.includes(actionId);

  // Location manual tab shows a "draw on map" button instead of coordinate fields
  const isLocationManual = actionId === "location" && tab === "manual";

  // fuel-break and location have their own dedicated modals, not the generic agent/manual tabs
  const hasManualForm = false;

  // New thread each time modal opens with a concrete action (layout effect: ready before paint)
  useLayoutEffect(() => {
    if (!actionId || isMapOnly) {
      setThreadId("");
      return;
    }
    setTab("agent");
    setAgentPayload(null);
    setManualValues(defaultManualValues(actionId));
    setThreadId(`action-${actionId}-${crypto.randomUUID()}`);
  }, [actionId, isMapOnly]);

  const handleManualSubmit = useCallback(() => {
    if (!actionId) return;
    const payload = manualFormToPayload(actionId, manualValues);
    if (payload) onConfirm(payload);
  }, [actionId, manualValues, onConfirm]);

  const stableAgentPayloadCb = useCallback((p: ActionPayload | null) => {
    setAgentPayload(p);
  }, []);

  // Don't render a modal for map-only actions
  const open = actionId !== null && cfg !== null && !isMapOnly;

  // Portal target — only available in the browser
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const modalContent = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-600 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Location gets its own dedicated modal */}
          {actionId === "location" ? (
            <LocationModal
              onClose={onClose}
              onLocationPreview={onLocationSearchPreview}
              onRequestMapDraw={onRequestMapDraw}
              mapRef={mapRef}
            />
          ) : actionId === "fuel-break" ? (
            <FuelBreakModal
              onClose={onClose}
              onRequestMapDraw={onRequestMapDraw}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 id="action-modal-title" className="text-sm font-semibold text-white/90">
                  {cfg.title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs — fuel-break has Agent + Manual */}
              <div className="flex gap-1 border-b border-white/8 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setTab("agent")}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[11px] font-medium transition",
                    tab === "agent"
                      ? "bg-orange-500/25 text-orange-200"
                      : "text-white/45 hover:bg-white/5 hover:text-white/75",
                  )}
                >
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => setTab("manual")}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[11px] font-medium transition",
                    tab === "manual"
                      ? "bg-orange-500/25 text-orange-200"
                      : "text-white/45 hover:bg-white/5 hover:text-white/75",
                  )}
                >
                  Manual
                </button>
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
                {/* Manual form (fuel-break) */}
                <div className={cn("min-h-0 flex-1", tab !== "manual" && "hidden")}>
                  {hasManualForm ? (
                    <ManualTab
                      actionId={actionId!}
                      initialValues={manualValues}
                      onValuesChange={setManualValues}
                    />
                  ) : null}
                </div>

                {/* Agent tab — keep mounted to survive tab switches */}
                <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "agent" && "hidden")}>
                  {threadId ? (
                    <AgentTabBody
                      key={threadId}
                      actionId={actionId!}
                      threadId={threadId}
                      onPendingPayload={stableAgentPayloadCb}
                    />
                  ) : null}
                  {agentPayload ? (
                    <pre className="mt-2 max-h-24 shrink-0 overflow-auto rounded border border-white/8 bg-black/30 p-2 text-[9px] text-emerald-400/90">
                      {JSON.stringify(agentPayload, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-[11px] text-white/50 transition hover:bg-white/5 hover:text-white/80"
                >
                  Cancel
                </button>
                {tab === "manual" && hasManualForm ? (
                  <button
                    type="button"
                    onClick={handleManualSubmit}
                    className="rounded-lg bg-orange-500/30 px-4 py-1.5 text-[11px] font-medium text-orange-100 transition hover:bg-orange-500/45"
                  >
                    Confirm
                  </button>
                ) : tab === "agent" ? (
                  <button
                    type="button"
                    disabled={!agentPayload}
                    onClick={() => {
                      if (agentPayload) onConfirm(agentPayload);
                    }}
                    className="rounded-lg bg-orange-500/30 px-4 py-1.5 text-[11px] font-medium text-orange-100 transition hover:bg-orange-500/45 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Use this
                  </button>
                ) : null}
              </div>
            </motion.div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}

function defaultManualValues(actionId: ActionId): Record<string, string> {
  const base: Record<string, string> = {};
  const fields = ACTION_MODAL_CONFIGS[actionId].fields;
  for (const f of fields) {
    if (f.key === "speed" && (actionId === "point-ignition" || actionId === "line-ignition")) {
      base[f.key] = "0.6";
    } else if (f.key === "mode" && actionId === "point-ignition") {
      base[f.key] = "point_static";
    } else if (f.key === "mode" && actionId === "line-ignition") {
      base[f.key] = "continuous_static";
    } else if (f.key === "cellResolution") {
      base[f.key] = "30";
    } else if (f.key === "cellSpaceDimension") {
      base[f.key] = "200";
    }
  }
  return base;
}
