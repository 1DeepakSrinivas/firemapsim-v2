"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Home, Play } from "lucide-react";

import { CedarCaptionChat, type SetupUpdate } from "@/chatComponents/CedarCaptionChat";
import FireMap from "@/components/map/FireMap";
import FireOverlay from "@/components/map/FireOverlay";
import { MapInteractionHUD } from "@/components/map/MapInteractionHUD";
import type { MapInteractionMode } from "@/components/map/MapInteractionLayer";
import { MapOverlayPanels, type MapStyleId } from "@/components/map/MapOverlayPanels";
import type {
  BoundsChangePayload,
  FireOverlayPoint,
  PolygonFeature,
} from "@/components/map/types";
import type { WeatherValues } from "@/components/weather/WeatherPreview";

import { useSimulationStream } from "@/hooks/useSimulationStream";
import {
  hasSavedProjectMapPosition,
  navigateMapToProject,
  projectMapPositionKey,
} from "@/lib/mapProjectNavigation";
import { ensurePlanBoundary, pointInBoundary } from "@/lib/projectBoundary";
import {
  applySegmentEdit,
  defaultIgnitionPlan,
  mergeActionIntoPlan,
  type ActionPayload,
  type BoundaryGeoJSON,
  type IgnitionPlan,
  type SegmentEdit,
} from "@/types/ignitionPlan";
import type { TerrainOverlayState } from "@/components/map/MapOverlayPanels";
import type { LastSimulationSnapshot } from "@/types/lastSimulation";

const DEFAULT_WEATHER: WeatherValues = {
  windSpeed: 10,
  windDirection: 225,
  temperature: 72,
  humidity: 38,
};

const INITIAL_TERRAIN: TerrainOverlayState = {
  show: new Set(),
  data: { fuel: null, slope: null, aspect: null },
  loading: false,
  error: null,
  showCellInfo: false,
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function messageToText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toSimulationQuery(bounds: BoundsChangePayload | null): string {
  const params = new URLSearchParams();
  if (bounds) {
    params.set("lat", String(bounds.lat));
    params.set("lng", String(bounds.lng));
  }
  params.set("simulationHours", "24");
  return params.toString();
}

function statsFromOverlay(points: FireOverlayPoint[]) {
  let burning = 0;
  let burned = 0;
  let unburned = 0;
  for (const p of points) {
    if (p.state === "burning") burning += 1;
    else if (p.state === "burned") burned += 1;
    else unburned += 1;
  }
  return { burning, burned, unburned };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProjectWorkspace({
  userSlug,
  projectId,
}: {
  userSlug: string;
  projectId: string;
}) {
  const { user } = useUser();
  const router = useRouter();

  const [mapRef, setMapRef] = useState<import("leaflet").Map | null>(null);
  const [mapBounds, setMapBounds] = useState<BoundsChangePayload | null>(null);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [lastSimulationSnapshot, setLastSimulationSnapshot] =
    useState<LastSimulationSnapshot | null>(null);
  const [replayFrame, setReplayFrame] = useState<FireOverlayPoint[] | null>(null);
  const [isReplayAnimating, setIsReplayAnimating] = useState(false);
  const prevStreamStatusRef = useRef<"idle" | "open" | "closed" | "error">("idle");
  const replayTimersRef = useRef<number[]>([]);
  const [drawnShapes, setDrawnShapes] = useState<PolygonFeature[]>([]);
  const [mapStyle, setMapStyle] = useState<MapStyleId>("terrain");

  const [weather, setWeather] = useState<WeatherValues>({ ...DEFAULT_WEATHER });

  const [projectConfig, setProjectConfig] = useState<IgnitionPlan>(() => defaultIgnitionPlan());

  const [terrainState, setTerrainState] = useState<TerrainOverlayState>({ ...INITIAL_TERRAIN });

  /** Geocode preview in the location modal (green); cleared when the project boundary is set */
  const [locationSearchPreview, setLocationSearchPreview] = useState<{
    lat: number;
    lng: number;
    boundaryGeoJSON: BoundaryGeoJSON;
  } | null>(null);

  const [projectTitle, setProjectTitle] = useState(`Untitled project - ${randomSuffix()}`);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [titleEditing, setTitleEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [projectMissing, setProjectMissing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectTitle);

  const skipSaveAfterLoadRef = useRef(true);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTerrainChange = useCallback((next: Partial<TerrainOverlayState>) => {
    setTerrainState((prev) => ({ ...prev, ...next }));
  }, []);

  const [mapInteractionMode, setMapInteractionMode] = useState<MapInteractionMode>(null);
  const [interactionHint, setInteractionHint] = useState<string | null>(null);
  const pendingActionRef = useRef<"location" | "fuel-break" | null>(null);
  const pendingPolygonRef = useRef<import("leaflet").LatLng[]>([]);
  const interactionHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMapPositionNavKeyRef = useRef<string | null>(null);

  const {
    fireOverlay: streamedOverlay,
    perimeterGeoJSON,
    stats,
    streamStatus,
  } = useSimulationStream(simulationId);

  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: () => ({ threadId: `project-${projectId}` }),
    }),
  });

  const clearReplayTimers = useCallback(() => {
    replayTimersRef.current.forEach(clearTimeout);
    replayTimersRef.current = [];
  }, []);

  const runReplayAnimation = useCallback(
    (points: FireOverlayPoint[]) => {
      clearReplayTimers();
      if (points.length === 0) {
        setIsReplayAnimating(false);
        setReplayFrame(null);
        return;
      }
      const times = [...new Set(points.map((p) => p.time))].sort((a, b) => a - b);
      if (times.length <= 1) {
        setIsReplayAnimating(true);
        setReplayFrame(points);
        const id = window.setTimeout(() => {
          setIsReplayAnimating(false);
          setReplayFrame(null);
        }, 420);
        replayTimersRef.current.push(id);
        return;
      }
      setIsReplayAnimating(true);
      times.forEach((t, i) => {
        const id = window.setTimeout(() => {
          setReplayFrame(points.filter((p) => p.time <= t));
          if (i === times.length - 1) {
            setIsReplayAnimating(false);
            setReplayFrame(null);
          }
        }, i * 72);
        replayTimersRef.current.push(id);
      });
    },
    [clearReplayTimers],
  );

  useEffect(() => {
    return () => {
      clearReplayTimers();
    };
  }, [clearReplayTimers]);

  const effectiveOverlay = useMemo<FireOverlayPoint[]>(() => {
    if (streamStatus === "open") return streamedOverlay;
    if (isReplayAnimating && replayFrame) return replayFrame;
    return lastSimulationSnapshot?.overlay ?? [];
  }, [
    streamStatus,
    streamedOverlay,
    isReplayAnimating,
    replayFrame,
    lastSimulationSnapshot,
  ]);

  const effectivePerimeter = useMemo(() => {
    if (streamStatus === "open") return perimeterGeoJSON;
    if (isReplayAnimating) return null;
    return lastSimulationSnapshot?.perimeterGeoJSON ?? null;
  }, [streamStatus, perimeterGeoJSON, isReplayAnimating, lastSimulationSnapshot]);

  useEffect(() => {
    const prev = prevStreamStatusRef.current;
    prevStreamStatusRef.current = streamStatus;
    if (prev !== "open" || streamStatus !== "closed") return;
    if (streamedOverlay.length === 0) return;

    const snap: LastSimulationSnapshot = {
      overlay: streamedOverlay,
      perimeterGeoJSON: perimeterGeoJSON ?? null,
      weatherSource: stats.weatherSource,
      completedAt: new Date().toISOString(),
    };
    setLastSimulationSnapshot(snap);
    runReplayAnimation(streamedOverlay);
  }, [
    streamStatus,
    streamedOverlay,
    perimeterGeoJSON,
    stats.weatherSource,
    runReplayAnimation,
  ]);

  useEffect(() => {
    let cancelled = false;
    skipSaveAfterLoadRef.current = true;
    setHydrated(false);
    setProjectMissing(false);

    (async () => {
      try {
        const res = await fetch(`/api/project/${projectId}`);
        if (res.status === 404) {
          if (!cancelled) {
            setProjectMissing(true);
            setHydrated(true);
          }
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          title?: string;
          plan?: IgnitionPlan;
          weather?: WeatherValues;
          ownerSlug?: string;
          lastSimulation?: LastSimulationSnapshot | null;
        };
        if (cancelled) return;

        if (data.ownerSlug && data.ownerSlug !== userSlug) {
          router.replace(`/${data.ownerSlug}/${projectId}`);
          return;
        }

        skipSaveAfterLoadRef.current = true;
        if (data.title) setProjectTitle(data.title);
        if (data.plan) setProjectConfig(ensurePlanBoundary(data.plan));
        if (data.weather) setWeather({ ...DEFAULT_WEATHER, ...data.weather });
        setLastSimulationSnapshot(data.lastSimulation ?? null);
      } catch {
        /* keep local defaults */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, userSlug, router]);

  useEffect(() => {
    lastMapPositionNavKeyRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (!hydrated || !mapRef) return;
    if (!hasSavedProjectMapPosition(projectConfig)) {
      lastMapPositionNavKeyRef.current = null;
      return;
    }
    const key = projectMapPositionKey(projectId, projectConfig);
    if (lastMapPositionNavKeyRef.current === key) return;
    lastMapPositionNavKeyRef.current = key;
    void navigateMapToProject(mapRef, projectConfig);
  }, [hydrated, mapRef, projectId, projectConfig]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipSaveAfterLoadRef.current) {
      skipSaveAfterLoadRef.current = false;
      return;
    }

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      setSaveStatus("saving");
      void (async () => {
        try {
          const res = await fetch(`/api/project/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: projectTitle,
              plan: projectConfig,
              weather,
              lastSimulation: lastSimulationSnapshot,
            }),
          });
          if (!res.ok) throw new Error("save failed");
          setSaveStatus("saved");
          if (savedClearRef.current) clearTimeout(savedClearRef.current);
          savedClearRef.current = setTimeout(() => setSaveStatus("idle"), 2200);
        } catch {
          setSaveStatus("error");
        }
      })();
    }, 1000);

    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [hydrated, projectConfig, weather, projectTitle, projectId, lastSimulationSnapshot]);

  useEffect(() => {
    return () => {
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
    };
  }, []);

  const handleMapReady = useCallback((map: import("leaflet").Map) => {
    setMapRef((prev) => (prev === map ? prev : map));
  }, []);

  const handleBoundsChange = useCallback((payload: BoundsChangePayload) => {
    setMapBounds((prev) => {
      if (
        prev &&
        prev.lat === payload.lat &&
        prev.lng === payload.lng &&
        prev.bbox[0] === payload.bbox[0] &&
        prev.bbox[1] === payload.bbox[1] &&
        prev.bbox[2] === payload.bbox[2] &&
        prev.bbox[3] === payload.bbox[3]
      ) {
        return prev;
      }
      return payload;
    });
  }, []);

  const isSimulating = streamStatus === "open";

  const panelStats = useMemo(
    () => ({
      ...statsFromOverlay(effectiveOverlay),
      weatherSource:
        streamStatus === "open"
          ? stats.weatherSource
          : lastSimulationSnapshot?.weatherSource ?? stats.weatherSource,
      streamStatus,
      shapes: drawnShapes.length,
    }),
    [
      effectiveOverlay,
      streamStatus,
      stats.weatherSource,
      lastSimulationSnapshot,
      drawnShapes.length,
    ],
  );

  const handleSetupUpdate = useCallback((update: SetupUpdate) => {
    const v = Number(update.value);
    if (Number.isNaN(v)) return;
    const weatherFields: Record<string, keyof WeatherValues> = {
      windSpeed: "windSpeed",
      windDirection: "windDirection",
      temperature: "temperature",
      humidity: "humidity",
    };
    const wf = weatherFields[update.field];
    if (wf) {
      setWeather((prev) => ({ ...prev, [wf]: v }));
    }
  }, []);

  const handleActionConfirm = useCallback((payload: ActionPayload) => {
    setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    if (payload.action === "location") {
      setLocationSearchPreview(null);
    }
  }, []);

  const handleSegmentEdit = useCallback((edit: SegmentEdit) => {
    setProjectConfig((prev) => applySegmentEdit(prev, edit));
  }, []);

  const handleSegmentDelete = useCallback((teamIndex: number, segmentIndex: number) => {
    setProjectConfig((prev) => {
      const teams = prev.team_infos.map((team, ti) => {
        if (ti !== teamIndex) return team;
        const details = team.details.filter((_, si) => si !== segmentIndex);
        return { ...team, details, info_num: details.length };
      });
      return { ...prev, team_infos: teams };
    });
  }, []);

  const handleFuelBreakDelete = useCallback((index: number) => {
    setProjectConfig((prev) => {
      const sup_infos = prev.sup_infos.filter((_, i) => i !== index);
      return { ...prev, sup_infos, sup_num: sup_infos.length };
    });
  }, []);

  const resetProject = useCallback(() => {
    clearReplayTimers();
    setReplayFrame(null);
    setIsReplayAnimating(false);
    const nextTitle = `Untitled project - ${randomSuffix()}`;
    skipSaveAfterLoadRef.current = false;
    setProjectTitle(nextTitle);
    setTitleDraft(nextTitle);
    setInteractionHint(null);
    setProjectConfig(defaultIgnitionPlan());
    setWeather({ ...DEFAULT_WEATHER });
    setTerrainState({ ...INITIAL_TERRAIN, show: new Set() });
    setDrawnShapes([]);
    setLastSimulationSnapshot(null);
    setLocationSearchPreview(null);
    setSimulationId(null);
    setMapInteractionMode(null);
    pendingActionRef.current = null;
    pendingPolygonRef.current = [];

    setSaveStatus("saving");
    void (async () => {
      try {
        const plan = defaultIgnitionPlan();
        plan.windSpeed = DEFAULT_WEATHER.windSpeed;
        plan.windDegree = DEFAULT_WEATHER.windDirection;
        plan.temperature = DEFAULT_WEATHER.temperature;
        plan.humidity = DEFAULT_WEATHER.humidity;
        const res = await fetch(`/api/project/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextTitle,
            plan,
            weather: DEFAULT_WEATHER,
            lastSimulation: null,
          }),
        });
        if (!res.ok) throw new Error("reset save failed");
        setSaveStatus("saved");
        if (savedClearRef.current) clearTimeout(savedClearRef.current);
        savedClearRef.current = setTimeout(() => setSaveStatus("idle"), 2200);
      } catch {
        setSaveStatus("error");
      }
    })();
  }, [projectId, clearReplayTimers]);

  useEffect(() => {
    if (!mapInteractionMode) setInteractionHint(null);
  }, [mapInteractionMode]);

  useEffect(() => {
    return () => {
      if (interactionHintTimerRef.current) clearTimeout(interactionHintTimerRef.current);
    };
  }, []);

  const pushInteractionHint = useCallback(() => {
    setInteractionHint("Outside project area — click inside the orange boundary");
    if (interactionHintTimerRef.current) clearTimeout(interactionHintTimerRef.current);
    interactionHintTimerRef.current = setTimeout(() => {
      setInteractionHint(null);
      interactionHintTimerRef.current = null;
    }, 4500);
  }, []);

  const validateInteractionLatLng = useCallback(
    (latlng: import("leaflet").LatLng) => {
      const mode = mapInteractionMode;
      if (mode === "polygon") return true;
      if (mode === "rect" && pendingActionRef.current === "location") return true;
      const b = projectConfig.boundaryGeoJSON;
      if (!b) return true;
      return pointInBoundary(latlng.lat, latlng.lng, b);
    },
    [mapInteractionMode, projectConfig.boundaryGeoJSON],
  );

  const hasProjectLocation = !!projectConfig.boundaryGeoJSON;

  const handlePin = useCallback((latlng: import("leaflet").LatLng) => {
    const b = projectConfig.boundaryGeoJSON;
    if (b && !pointInBoundary(latlng.lat, latlng.lng, b)) {
      pushInteractionHint();
      setMapInteractionMode(null);
      return;
    }
    const cellRes = projectConfig.cellResolution;
    const cx = projectConfig.proj_center_lng;
    const cy = projectConfig.proj_center_lat;
    const metersPerDeg = 111320;
    const dx = (latlng.lng - cx) * metersPerDeg * Math.cos((cy * Math.PI) / 180);
    const dy = (latlng.lat - cy) * metersPerDeg;
    const gx = Math.round(dx / cellRes + (projectConfig.cellSpaceDimension / 2));
    const gy = Math.round(dy / cellRes + (projectConfig.cellSpaceDimensionLat / 2));
    const payload: ActionPayload = {
      action: "point-ignition",
      points: [{ x: gx, y: gy, speed: 0.6, mode: "continuous_static" }],
    };
    setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    setMapInteractionMode(null);
  }, [projectConfig, pushInteractionHint]);

  const handleLine = useCallback((start: import("leaflet").LatLng, end: import("leaflet").LatLng) => {
    const b = projectConfig.boundaryGeoJSON;
    if (
      b &&
      (!pointInBoundary(start.lat, start.lng, b) || !pointInBoundary(end.lat, end.lng, b))
    ) {
      pushInteractionHint();
      setMapInteractionMode(null);
      return;
    }
    const cellRes = projectConfig.cellResolution;
    const cx = projectConfig.proj_center_lng;
    const cy = projectConfig.proj_center_lat;
    const metersPerDeg = 111320;
    const cosLat = Math.cos((cy * Math.PI) / 180);
    const toGrid = (ll: import("leaflet").LatLng) => ({
      x: Math.round(((ll.lng - cx) * metersPerDeg * cosLat) / cellRes + projectConfig.cellSpaceDimension / 2),
      y: Math.round(((ll.lat - cy) * metersPerDeg) / cellRes + projectConfig.cellSpaceDimensionLat / 2),
    });
    const s = toGrid(start);
    const e = toGrid(end);
    const payload: ActionPayload = {
      action: "line-ignition",
      start_x: s.x,
      start_y: s.y,
      end_x: e.x,
      end_y: e.y,
      speed: 0.6,
      mode: "continuous_static",
    };
    setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    setMapInteractionMode(null);
  }, [projectConfig, pushInteractionHint]);

  const handleRect = useCallback((corner1: import("leaflet").LatLng, corner2: import("leaflet").LatLng) => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;

    if (action === "location") {
      const minLat = Math.min(corner1.lat, corner2.lat);
      const maxLat = Math.max(corner1.lat, corner2.lat);
      const minLng = Math.min(corner1.lng, corner2.lng);
      const maxLng = Math.max(corner1.lng, corner2.lng);
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const boundaryGeoJSON: import("@/types/ignitionPlan").BoundaryGeoJSON = {
        type: "Polygon",
        coordinates: [[
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ]],
      };
      const payload: ActionPayload = {
        action: "location",
        proj_center_lng: centerLng,
        proj_center_lat: centerLat,
        boundaryGeoJSON,
      };
      setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
      setLocationSearchPreview(null);
    } else {
      const b = projectConfig.boundaryGeoJSON;
      if (
        b &&
        (!pointInBoundary(corner1.lat, corner1.lng, b) ||
          !pointInBoundary(corner2.lat, corner2.lng, b))
      ) {
        pushInteractionHint();
        setMapInteractionMode(null);
        return;
      }
      const cellRes = projectConfig.cellResolution;
      const cx = projectConfig.proj_center_lng;
      const cy = projectConfig.proj_center_lat;
      const metersPerDeg = 111320;
      const cosLat = Math.cos((cy * Math.PI) / 180);
      const toGrid = (ll: import("leaflet").LatLng) => ({
        x: Math.round(((ll.lng - cx) * metersPerDeg * cosLat) / cellRes + projectConfig.cellSpaceDimension / 2),
        y: Math.round(((ll.lat - cy) * metersPerDeg) / cellRes + projectConfig.cellSpaceDimensionLat / 2),
      });
      const g1 = toGrid(corner1);
      const g2 = toGrid(corner2);
      const payload: ActionPayload = {
        action: "fuel-break",
        x1: Math.min(g1.x, g2.x),
        y1: Math.min(g1.y, g2.y),
        x2: Math.max(g1.x, g2.x),
        y2: Math.max(g1.y, g2.y),
        splitIntoRectangleEdges: true,
      };
      setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    }
    setMapInteractionMode(null);
  }, [projectConfig, pushInteractionHint]);

  const handlePolyline = useCallback((nodes: import("leaflet").LatLng[]) => {
    pendingActionRef.current = null;
    if (nodes.length < 2) { setMapInteractionMode(null); return; }
    const b = projectConfig.boundaryGeoJSON;
    if (b) {
      for (const p of nodes) {
        if (!pointInBoundary(p.lat, p.lng, b)) {
          pushInteractionHint();
          setMapInteractionMode(null);
          return;
        }
      }
    }
    const cellRes = projectConfig.cellResolution;
    const cx = projectConfig.proj_center_lng;
    const cy = projectConfig.proj_center_lat;
    const metersPerDeg = 111320;
    const cosLat = Math.cos((cy * Math.PI) / 180);
    const toGrid = (ll: import("leaflet").LatLng) => ({
      x: Math.round(((ll.lng - cx) * metersPerDeg * cosLat) / cellRes + projectConfig.cellSpaceDimension / 2),
      y: Math.round(((ll.lat - cy) * metersPerDeg) / cellRes + projectConfig.cellSpaceDimensionLat / 2),
    });
    for (let i = 0; i < nodes.length - 1; i++) {
      const s = toGrid(nodes[i]!);
      const e = toGrid(nodes[i + 1]!);
      const payload: ActionPayload = {
        action: "fuel-break",
        x1: Math.min(s.x, e.x),
        y1: Math.min(s.y, e.y),
        x2: Math.max(s.x, e.x),
        y2: Math.max(s.y, e.y),
      };
      setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    }
    setMapInteractionMode(null);
  }, [projectConfig, pushInteractionHint]);

  const handlePolygon = useCallback((latlngs: import("leaflet").LatLng[]) => {
    pendingActionRef.current = null;
    pendingPolygonRef.current = latlngs;
    const avgLat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
    const avgLng = latlngs.reduce((s, p) => s + p.lng, 0) / latlngs.length;
    const ring = [...latlngs, latlngs[0]!].map((p) => [p.lng, p.lat] as [number, number]);
    const boundaryGeoJSON: import("@/types/ignitionPlan").BoundaryGeoJSON = {
      type: "Polygon",
      coordinates: [ring],
    };
    const payload: ActionPayload = {
      action: "location",
      proj_center_lng: avgLng,
      proj_center_lat: avgLat,
      boundaryGeoJSON,
    };
    setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    setLocationSearchPreview(null);
    setMapInteractionMode(null);
  }, []);

  const handleRequestMapInteraction = useCallback(
    (mode: MapInteractionMode, action?: "location" | "fuel-break") => {
      pendingActionRef.current = action ?? null;
      setMapInteractionMode(mode);
      if (mode === "rect" && action === "location") {
        setInteractionHint(
          locationSearchPreview
            ? "Draw two opposite corners for your project area. Green shows your search—your rectangle sets the simulation boundary."
            : "Draw two opposite corners for your project working area.",
        );
      }
    },
    [locationSearchPreview],
  );

  useEffect(() => {
    setProjectConfig((p) => ({
      ...p,
      windSpeed: weather.windSpeed,
      windDegree: weather.windDirection,
      temperature: weather.temperature,
      humidity: weather.humidity,
    }));
  }, [
    weather.windSpeed,
    weather.windDirection,
    weather.temperature,
    weather.humidity,
  ]);

  useEffect(() => {
    if (!titleEditing) setTitleDraft(projectTitle);
  }, [projectTitle, titleEditing]);

  function commitTitle() {
    const t = titleDraft.trim() || projectTitle;
    setProjectTitle(t);
    setTitleEditing(false);
  }

  if (!hydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0f0f0f] text-sm text-white/40">
        Loading…
      </main>
    );
  }

  if (projectMissing) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f0f] px-4 text-center text-white">
        <p className="text-sm text-white/60">Project not found or you do not have access.</p>
        <Link
          href="/dashboard"
          className="mt-4 text-sm font-medium text-orange-400 hover:text-orange-300"
        >
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#0f0f0f] text-white">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#141414] px-3 sm:h-12 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/20 sm:h-7 sm:w-7 sm:rounded-lg">
            <Flame className="h-3.5 w-3.5 text-orange-400 sm:h-4 sm:w-4" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-white/80 uppercase sm:text-xs">
            <span className="hidden sm:inline">FireMapSim-v2</span>
            <span className="sm:hidden">FMS-v2</span>
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1 sm:gap-3">
          {titleEditing ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setTitleDraft(projectTitle);
                  setTitleEditing(false);
                }
              }}
              className="max-w-[min(100%,280px)] rounded border border-white/15 bg-white/8 px-2 py-1 text-center text-[11px] text-white outline-none focus:border-orange-400/50 sm:max-w-md sm:text-xs"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setTitleEditing(true)}
              className="truncate text-center text-[11px] font-medium text-white/85 hover:text-white sm:text-xs"
              title="Rename project"
            >
              {projectTitle}
            </button>
          )}
          <span className="shrink-0 text-[9px] text-white/35 sm:text-[10px]" aria-live="polite">
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Save failed"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {isSimulating && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium text-emerald-400 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400 sm:h-1.5 sm:w-1.5" />
              <span className="hidden sm:inline">Simulation Running</span>
              <span className="sm:hidden">Running</span>
            </span>
          )}
          <button
            type="button"
            title="Play saved simulation"
            disabled={
              !lastSimulationSnapshot || isReplayAnimating || streamStatus === "open"
            }
            onClick={() => {
              if (lastSimulationSnapshot) {
                runReplayAnimation(lastSimulationSnapshot.overlay);
              }
            }}
            className="flex h-6 items-center gap-1 rounded-md border border-white/10 px-1.5 text-[9px] font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 sm:h-7 sm:gap-1.5 sm:px-2 sm:text-[11px]"
          >
            <Play className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Play simulation</span>
          </button>
          <Link
            href="/dashboard"
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/5 hover:text-white/70 sm:h-7 sm:w-7"
            title="Projects"
          >
            <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <FireMap
          onMapReady={handleMapReady}
          onBoundsChange={handleBoundsChange}
          fireOverlay={effectiveOverlay}
          perimeterGeoJSON={effectivePerimeter}
          mapStyle={mapStyle}
          interactionMode={mapInteractionMode}
          onPin={handlePin}
          onLine={handleLine}
          onPolyline={handlePolyline}
          onPolygon={handlePolygon}
          onRect={handleRect}
          validateLatLng={validateInteractionLatLng}
          onValidationFail={pushInteractionHint}
          boundaryGeoJSON={projectConfig.boundaryGeoJSON}
          locationSearchPreview={locationSearchPreview}
          terrainData={terrainState.data}
          terrainShow={terrainState.show}
          showCellInfo={terrainState.showCellInfo}
          cellResolution={projectConfig.cellResolution}
          cellSpaceDimension={projectConfig.cellSpaceDimension}
          cellSpaceDimensionLat={projectConfig.cellSpaceDimensionLat}
          projCenterLat={projectConfig.proj_center_lat}
          projCenterLng={projectConfig.proj_center_lng}
        />

        <FireOverlay points={effectiveOverlay} />

        <MapOverlayPanels
          stats={panelStats}
          messages={messages}
          planPreview={{
            segments: projectConfig.team_infos[0]?.details.length ?? 0,
            fuelBreaks: projectConfig.sup_num,
            centerSet: hasProjectLocation,
          }}
          hasProjectLocation={hasProjectLocation}
          onStartSimulation={() => {
            clearReplayTimers();
            setReplayFrame(null);
            setIsReplayAnimating(false);
            setSimulationId(toSimulationQuery(mapBounds));
          }}
          onAskAgent={async () => {
            const latest = [...messages].reverse().find((m) => m.role === "assistant");
            const latestText = latest ? messageToText(latest) : "";
            await sendMessage({
              text: latestText
                ? `Run simulation based on this context: ${latestText}`
                : "Run simulation for current map area.",
            });
          }}
          onResetProject={resetProject}
          weather={weather}
          onWeatherOverride={(field, value) => setWeather((prev) => ({ ...prev, [field]: value }))}
          onWeatherFetched={(next) => setWeather(next)}
          onActionConfirm={handleActionConfirm}
          onLocationSearchPreview={setLocationSearchPreview}
          onRequestMapInteraction={handleRequestMapInteraction}
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          mapRef={mapRef}
          projectConfig={projectConfig}
          onSegmentEdit={handleSegmentEdit}
          onSegmentDelete={handleSegmentDelete}
          onFuelBreakDelete={handleFuelBreakDelete}
          terrainState={terrainState}
          onTerrainChange={handleTerrainChange}
        />

        <MapInteractionHUD
          mode={mapInteractionMode}
          hint={interactionHint}
          onCancel={() => setMapInteractionMode(null)}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-500 flex justify-center px-2 sm:bottom-4 sm:px-4">
          <CedarCaptionChat
            showThinking={true}
            userName={user?.firstName ?? user?.username ?? undefined}
            messages={messages}
            status={status}
            sendMessage={sendMessage}
            onSetupUpdate={handleSetupUpdate}
          />
        </div>
      </div>
    </main>
  );
}
