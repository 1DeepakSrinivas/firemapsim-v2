"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { MapPin, Minus, PenLine, RectangleHorizontal, X, Zap } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { MapInteractionMode } from "./MapInteractionLayer";

import { cn } from "@/lib/utils";
import type { ActionPayload, BoundaryGeoJSON } from "@/types/ignitionPlan";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
    agentSeed:
      "Help me define a point ignition in grid coordinates (x, y). When ready, output ```action-result``` JSON with action \"point-ignition\" and a points array containing objects with x, y, speed (m/s), and mode fields.",
    fields: [],
  },
  "line-ignition": {
    id: "line-ignition",
    title: "Define Line Ignition",
    agentSeed:
      "Help me define a line ignition from (start_x, start_y) to (end_x, end_y) in grid coordinates. When ready, output ```action-result``` JSON with action \"line-ignition\" and numeric fields start_x, start_y, end_x, end_y, plus optional speed and mode.",
    fields: [],
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
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{f.label}</span>
          <div className="flex items-center gap-1">
            <Input
              type={f.type === "number" ? "number" : "text"}
              value={initialValues[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) =>
                onValuesChange({ ...initialValues, [f.key]: e.target.value })
              }
              className="h-auto w-full rounded-lg border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
            {f.suffix ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">{f.suffix}</span>
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
        className="cedar-scroll mb-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2"
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
                    : "rounded-[0.95rem] rounded-bl-sm bg-muted text-foreground text-pretty",
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
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Message the agent…"
        disabled={disabled}
        className="h-auto flex-1 rounded-lg border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:ring-ring disabled:opacity-50"
      />
      <Button
        disabled={disabled || !input.trim()}
        className="h-auto shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium"
      >
        Send
      </Button>
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
    <Button
      variant="ghost"
      onClick={onClick}
      className={`h-auto w-full justify-start gap-3 rounded-xl border border-border bg-muted/35 px-4 py-3 text-left transition ${border}`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
      <div>
        <p className="text-[11px] font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </Button>
  );
}

function LocationModalBody({
  onClose,
  onLocationPreview,
  onRequestMapDraw,
  mapRef,
  onConfirm,
  currentPlan,
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
  onConfirm?: (payload: ActionPayload) => void;
  /** Current plan — used to read cellResolution / cellSpaceDimension for auto-boundary sizing */
  currentPlan?: import("@/types/ignitionPlan").IgnitionPlan | null;
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
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Search by address or zip code
        </p>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResult(null);
                setError(null);
                onLocationPreview?.(null);
              }}
              placeholder="e.g. 94102  or  123 Main St, Oakland CA"
              className="h-auto w-full rounded-lg border-border bg-background py-2 pl-8 pr-3 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <Button
            disabled={!query.trim() || loading}
            className="h-auto gap-1 rounded-lg px-3 py-2 text-[11px] font-medium"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
          </Button>
        </form>

        {error ? <p className="text-[10px] text-red-400">{error}</p> : null}

        {result ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
              <p className="text-[10px] font-semibold text-emerald-400">Found</p>
              <p className="mt-0.5 text-[11px] leading-snug text-foreground/80">{result.displayName}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                const payload: ActionPayload = {
                  action: "location",
                  proj_center_lng: result.lng,
                  proj_center_lat: result.lat,
                  ...(currentPlan
                    ? {
                        cellResolution: currentPlan.cellResolution,
                        cellSpaceDimension: currentPlan.cellSpaceDimension,
                        cellSpaceDimensionLat: currentPlan.cellSpaceDimensionLat,
                      }
                    : {}),
                };
                onConfirm?.(payload);
                onClose();
              }}
              className="h-auto w-full rounded-lg px-4 py-2 text-[11px] font-medium"
            >
              Set as project location
            </Button>
            <p className="text-[10px] leading-snug text-muted-foreground">
              This places a {currentPlan?.cellSpaceDimension ?? 200}×
              {currentPlan?.cellSpaceDimension ?? 200}-cell grid square (
              {(((currentPlan?.cellSpaceDimension ?? 200) * (currentPlan?.cellResolution ?? 30)) / 1000).toFixed(1)}{" "}
              km) centered on the result. Or place it manually on the map below.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">or place on map</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <DrawModeButton
          icon={RectangleHorizontal}
          label="Place boundary on map"
          description={`Move cursor to position the ${currentPlan?.cellSpaceDimension ?? 200}×${currentPlan?.cellSpaceDimension ?? 200}-cell square, then click to place`}
          color="sky"
          onClick={() => {
            onRequestMapDraw?.("place-square" as import("./MapInteractionLayer").MapInteractionMode);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

// ─── Ignition Modal ───────────────────────────────────────────────────────────

function IgnitionModalBody({
  actionId,
  onClose,
  onRequestMapDraw,
}: {
  actionId: "point-ignition" | "line-ignition";
  onClose: () => void;
  onRequestMapDraw?: (mode: MapInteractionMode) => void;
}) {
  if (actionId === "point-ignition") {
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Click a location on the map to place a point ignition source.
        </p>
        <DrawModeButton
          icon={MapPin}
          label="Place ignition pin"
          description="Click on the map to drop a point ignition at that location"
          color="orange"
          onClick={() => {
            onRequestMapDraw?.("pin");
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Draw a line on the map to define a line ignition front.
      </p>
      <DrawModeButton
        icon={Zap}
        label="Draw a line (2 nodes)"
        description="Click start point, then click end point to define a line ignition"
        color="orange"
        onClick={() => {
          onRequestMapDraw?.("line");
          onClose();
        }}
      />
      <DrawModeButton
        icon={PenLine}
        label="Multi-node line"
        description="Click multiple nodes to trace a complex ignition front, then press Escape to finish"
        color="orange"
        onClick={() => {
          onRequestMapDraw?.("polyline");
          onClose();
        }}
      />
    </div>
  );
}

// ─── Fuel Break Modal ─────────────────────────────────────────────────────────

function FuelBreakModalBody({
  onClose,
  onRequestMapDraw,
}: {
  onClose: () => void;
  onRequestMapDraw?: (mode: MapInteractionMode) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Choose how to define the fuel break area on the map.
      </p>

      <DrawModeButton
        icon={PenLine}
        label="Draw a line (2 nodes)"
        description="Click start point, then click end point to define a suppression line"
        onClick={() => {
          onRequestMapDraw?.("line");
          onClose();
        }}
      />
      <DrawModeButton
        icon={Minus}
        label="Multi-node line"
        description="Click multiple nodes to trace a complex fuel break path, then press Escape to finish"
        onClick={() => {
          onRequestMapDraw?.("polyline");
          onClose();
        }}
      />
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/** Actions that bypass the modal and go straight to map interaction */
export const MAP_INTERACTION_ACTIONS: ActionId[] = [];
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
  /** Current ignition plan — passed to LocationModal so it can read grid settings for auto-boundary */
  currentPlan?: import("@/types/ignitionPlan").IgnitionPlan | null;
};

export function ActionModal({
  actionId,
  onClose,
  onConfirm,
  onRequestMapDraw,
  mapRef,
  onLocationSearchPreview,
  currentPlan,
}: ActionModalProps) {
  const [tab, setTab] = useState<"agent" | "manual">("agent");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [agentPayload, setAgentPayload] = useState<ActionPayload | null>(null);
  const [threadId, setThreadId] = useState<string>("");

  const cfg = actionId ? ACTION_MODAL_CONFIGS[actionId] : null;

  // Point/line ignition never show a modal — they go straight to map interaction
  const isMapOnly = actionId !== null && MAP_INTERACTION_ACTIONS.includes(actionId);

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

  const open = actionId !== null && cfg !== null && !isMapOnly;

  if (!open || !actionId || !cfg) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="themed-layer flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden border-border bg-card p-0 text-foreground shadow-2xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              {cfg.title}
            </DialogTitle>
            {actionId === "location" ? (
              <DialogDescription className="text-[11px] text-muted-foreground">
                Search for an address or place a boundary square directly on the map.
              </DialogDescription>
            ) : actionId === "point-ignition" ? (
              <DialogDescription className="text-[11px] text-muted-foreground">
                Place a point ignition source on the map.
              </DialogDescription>
            ) : actionId === "line-ignition" ? (
              <DialogDescription className="text-[11px] text-muted-foreground">
                Draw a line ignition front on the map.
              </DialogDescription>
            ) : actionId === "fuel-break" ? (
              <DialogDescription className="text-[11px] text-muted-foreground">
                Choose how you want to draw the fuel break path on the map.
              </DialogDescription>
            ) : null}
            </div>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
          {actionId === "location" ? (
            <LocationModalBody
              onClose={onClose}
              onLocationPreview={onLocationSearchPreview}
              onRequestMapDraw={onRequestMapDraw}
              mapRef={mapRef}
              onConfirm={onConfirm}
              currentPlan={currentPlan}
            />
          ) : actionId === "point-ignition" || actionId === "line-ignition" ? (
            <IgnitionModalBody actionId={actionId} onClose={onClose} onRequestMapDraw={onRequestMapDraw} />
          ) : actionId === "fuel-break" ? (
            <FuelBreakModalBody onClose={onClose} onRequestMapDraw={onRequestMapDraw} />
          ) : (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as "agent" | "manual")}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="border-b border-border px-0 py-2">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="agent"
                    className="rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
                  >
                    Agent
                  </TabsTrigger>
                  <TabsTrigger
                    value="manual"
                    className="rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
                  >
                    Manual
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
                <TabsContent value="manual" className="min-h-0 flex-1 mt-0">
                  {hasManualForm ? (
                    <ManualTab
                      actionId={actionId}
                      initialValues={manualValues}
                      onValuesChange={setManualValues}
                    />
                  ) : null}
                </TabsContent>

                <TabsContent value="agent" className="min-h-0 flex-1 mt-0">
                  {threadId ? (
                    <AgentTabBody
                      key={threadId}
                      actionId={actionId}
                      threadId={threadId}
                      onPendingPayload={stableAgentPayloadCb}
                    />
                  ) : null}
                  {agentPayload ? (
                    <pre className="mt-2 max-h-24 shrink-0 overflow-auto rounded border border-border bg-muted/50 p-2 text-[9px] text-emerald-600 dark:text-emerald-400/90">
                      {JSON.stringify(agentPayload, null, 2)}
                    </pre>
                  ) : null}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        <DialogFooter className="border-t border-border px-4 py-3">
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
          </DialogClose>
          {actionId !== "location" && actionId !== "fuel-break" && actionId !== "point-ignition" && actionId !== "line-ignition" && tab === "manual" && hasManualForm ? (
            <Button
              variant="ghost"
              onClick={handleManualSubmit}
              className="h-auto rounded-lg bg-orange-500/30 px-4 py-1.5 text-[11px] font-medium text-orange-100 hover:bg-orange-500/45"
            >
              Confirm
            </Button>
          ) : null}
          {actionId !== "location" && actionId !== "fuel-break" && actionId !== "point-ignition" && actionId !== "line-ignition" && tab === "agent" ? (
            <Button
              variant="ghost"
              disabled={!agentPayload}
              onClick={() => {
                if (agentPayload) onConfirm(agentPayload);
              }}
              className="h-auto rounded-lg bg-orange-500/30 px-4 py-1.5 text-[11px] font-medium text-orange-100 hover:bg-orange-500/45"
            >
              Use this
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultManualValues(actionId: ActionId): Record<string, string> {
  const base: Record<string, string> = {};
  const fields = ACTION_MODAL_CONFIGS[actionId].fields;
  for (const f of fields) {
    if (f.key === "speed" && (actionId === "point-ignition" || actionId === "line-ignition")) {
      base[f.key] = "3";
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
