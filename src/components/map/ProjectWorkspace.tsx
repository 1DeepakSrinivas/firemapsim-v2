"use client";

import type { UIMessage } from "ai";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Home, Play } from "lucide-react";

import {
  CedarCaptionChat,
  type RunTrigger,
  type SetupUpdate,
} from "@/chatComponents/CedarCaptionChat";
import { ProjectAgentChatHost } from "@/components/map/ProjectAgentChatHost";
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

import { normalizeOverlay } from "@/lib/simulationOverlay";
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

const DEFAULT_SIMULATION_TIMESTEPS = 12000;
const MAX_SIMULATION_TIMESTEPS = 100000;
const TIMESTEPS_PER_HOUR = 500;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clampSimulationTimesteps(value: number): number {
  return Math.max(1, Math.min(MAX_SIMULATION_TIMESTEPS, Math.round(value)));
}

function legacyHoursToTimesteps(hours: number): number {
  return clampSimulationTimesteps(hours * TIMESTEPS_PER_HOUR);
}

function messageToText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function dedupeMessagesById(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const out: UIMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || seen.has(msg.id)) continue;
    seen.add(msg.id);
    out.unshift(msg);
  }

  return out;
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

type WeatherOverrideState = Partial<WeatherValues>;

function mergeWeather(
  fetched: WeatherValues,
  overrides: WeatherOverrideState,
): WeatherValues {
  return {
    windSpeed: overrides.windSpeed ?? fetched.windSpeed,
    windDirection: overrides.windDirection ?? fetched.windDirection,
    temperature: overrides.temperature ?? fetched.temperature,
    humidity: overrides.humidity ?? fetched.humidity,
  };
}

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
  const [lastSimulationSnapshot, setLastSimulationSnapshot] =
    useState<LastSimulationSnapshot | null>(null);
  const [replayFrame, setReplayFrame] = useState<FireOverlayPoint[] | null>(null);
  const [isReplayAnimating, setIsReplayAnimating] = useState(false);
  const [simulationRun, setSimulationRun] = useState<{
    status: "idle" | "running" | "ready" | "error";
    error: string | null;
    weatherSource?: string;
  }>({ status: "idle", error: null });
  const replayTimersRef = useRef<number[]>([]);
  const [drawnShapes, setDrawnShapes] = useState<PolygonFeature[]>([]);
  const [mapStyle, setMapStyle] = useState<MapStyleId>("terrain");

  const [weather, setWeather] = useState<WeatherValues>({ ...DEFAULT_WEATHER });
  const [weatherOverrides, setWeatherOverrides] =
    useState<WeatherOverrideState>({});

  const weatherOverridesRef = useRef<WeatherOverrideState>({});

  const [projectConfig, setProjectConfig] = useState<IgnitionPlan>(() => defaultIgnitionPlan());

  const [terrainState, setTerrainState] = useState<TerrainOverlayState>({ ...INITIAL_TERRAIN });

  /** Geocode preview in the location modal (green); cleared when the project boundary is set */
  const [locationSearchPreview, setLocationSearchPreview] = useState<{
    lat: number;
    lng: number;
    boundaryGeoJSON: BoundaryGeoJSON;
  } | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<string | null>(null);

  const [projectTitle, setProjectTitle] = useState(`Untitled project - ${randomSuffix()}`);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [titleEditing, setTitleEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [projectMissing, setProjectMissing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectTitle);

  const skipSaveAfterLoadRef = useRef(true);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTerrainChange = useCallback((next: Partial<TerrainOverlayState>) => {
    setTerrainState((prev) => ({ ...prev, ...next }));
  }, []);

  const [mapInteractionMode, setMapInteractionMode] = useState<MapInteractionMode>(null);
  const [interactionPalette, setInteractionPalette] = useState<
    "fuel-break" | "location" | "ignition"
  >("ignition");
  const [interactionHint, setInteractionHint] = useState<string | null>(null);
  const pendingActionRef = useRef<"location" | "fuel-break" | null>(null);
  const pendingPolygonRef = useRef<import("leaflet").LatLng[]>([]);
  const interactionHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMapPositionNavKeyRef = useRef<string | null>(null);
  const readyBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [agentChatSnapshot, setAgentChatSnapshot] = useState<{
    messages: UIMessage[];
    introDone: boolean;
  } | null>(null);
  const [chatMountKey, setChatMountKey] = useState(0);

  useEffect(() => {
    weatherOverridesRef.current = weatherOverrides;
  }, [weatherOverrides]);

  const handleAgentChatPersist = useCallback((messages: UIMessage[], introDone: boolean) => {
    const deduped = dedupeMessagesById(messages);
    setAgentChatSnapshot((prev) => ({
      messages: deduped,
      introDone,
    }));
  }, []);

  const handleAgentIntroClaimed = useCallback(() => {
    setAgentChatSnapshot((p) => (p ? { ...p, introDone: true } : p));
  }, []);

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
        }, (i * 72) / playbackRate);
        replayTimersRef.current.push(id);
      });
    },
    [clearReplayTimers, playbackRate],
  );

  useEffect(() => {
    return () => {
      clearReplayTimers();
    };
  }, [clearReplayTimers]);

  const effectiveOverlay = useMemo<FireOverlayPoint[]>(() => {
    if (isReplayAnimating && replayFrame) return replayFrame;
    return lastSimulationSnapshot?.overlay ?? [];
  }, [isReplayAnimating, replayFrame, lastSimulationSnapshot]);

  const effectivePerimeter = useMemo(() => {
    if (isReplayAnimating) return null;
    return lastSimulationSnapshot?.perimeterGeoJSON ?? null;
  }, [isReplayAnimating, lastSimulationSnapshot]);

  const handleStartSimulation = useCallback(
    async (simulationTimesteps: number) => {
      if (simulationRun.status === "running") return;
      const requestedTimesteps = clampSimulationTimesteps(simulationTimesteps);
      clearReplayTimers();
      setReplayFrame(null);
      setIsReplayAnimating(false);
      setLastSimulationSnapshot(null); // Reset stats modal immediately
      if (readyBadgeTimerRef.current) {
        clearTimeout(readyBadgeTimerRef.current);
        readyBadgeTimerRef.current = null;
      }
      setSimulationRun({ status: "running", error: null });

      const planPayload: IgnitionPlan = {
        ...projectConfig,
        windSpeed: weather.windSpeed,
        windDegree: weather.windDirection,
        temperature: weather.temperature,
        humidity: weather.humidity,
        total_sim_time: requestedTimesteps,
      };

      try {
        const res = await fetch("/api/simulation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: planPayload,
            // Legacy request key expected by the route schema; value is timesteps.
            simulationHours: requestedTimesteps,
            weatherOverrides,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          operations?: unknown;
          weatherSource?: string;
          weatherUsed?: WeatherValues;
          cellResolution?: number;
          cellSpaceDimension?: number;
          cellSpaceDimensionLat?: number;
          projCenterLat?: number;
          projCenterLng?: number;
        };
        if (!res.ok) {
          throw new Error(json.error ?? `Simulation failed (${res.status})`);
        }
        if (json.weatherUsed) {
          setWeather(mergeWeather(json.weatherUsed, weatherOverridesRef.current));
        }
        const overlay = normalizeOverlay(json.operations);
        const snap: LastSimulationSnapshot = {
          overlay,
          perimeterGeoJSON: null,
          gridMeta:
            typeof json.cellResolution === "number" &&
            typeof json.cellSpaceDimension === "number" &&
            typeof json.cellSpaceDimensionLat === "number" &&
            typeof json.projCenterLat === "number" &&
            typeof json.projCenterLng === "number"
              ? {
                  cellResolution: json.cellResolution,
                  cellSpaceDimension: json.cellSpaceDimension,
                  cellSpaceDimensionLat: json.cellSpaceDimensionLat,
                  projCenterLat: json.projCenterLat,
                  projCenterLng: json.projCenterLng,
                }
              : undefined,
          weatherSource: json.weatherSource ?? "dynamic",
          completedAt: new Date().toISOString(),
        };
        setLastSimulationSnapshot(snap);
        setSimulationRun({
          status: "ready",
          error: null,
          weatherSource: json.weatherSource,
        });
        readyBadgeTimerRef.current = setTimeout(() => {
          setSimulationRun((prev) =>
            prev.status === "ready" ? { ...prev, status: "idle" } : prev,
          );
          readyBadgeTimerRef.current = null;
        }, 5000);
        runReplayAnimation(overlay);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSimulationRun({ status: "error", error: msg });
      }
    },
    [
      projectConfig,
      weather,
      weatherOverrides,
      simulationRun.status,
      clearReplayTimers,
      runReplayAnimation,
    ],
  );

  const handleReplay = useCallback(() => {
    if (!lastSimulationSnapshot) return;
    runReplayAnimation(lastSimulationSnapshot.overlay);
  }, [lastSimulationSnapshot, runReplayAnimation]);

  useEffect(() => {
    let cancelled = false;
    skipSaveAfterLoadRef.current = true;
    setHydrated(false);
    setProjectMissing(false);
    setAgentChatSnapshot(null);

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
        if (!res.ok) {
          if (!cancelled) {
            setAgentChatSnapshot({ messages: [], introDone: false });
          }
          return;
        }
        const data = (await res.json()) as {
          title?: string;
          plan?: IgnitionPlan;
          weather?: WeatherValues;
          ownerSlug?: string;
          lastSimulation?: LastSimulationSnapshot | null;
          agentChatMessages?: unknown;
          agentChatIntroDone?: boolean;
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

        const rawChat = data.agentChatMessages;
        const loadedMessages = Array.isArray(rawChat)
          ? dedupeMessagesById(rawChat as UIMessage[])
          : [];
        if (!cancelled) {
          setAgentChatSnapshot({
            messages: loadedMessages,
            introDone: Boolean(data.agentChatIntroDone),
          });
          const initialPayload = JSON.stringify({
            title: data.title ?? projectTitle,
            plan: data.plan ? ensurePlanBoundary(data.plan) : projectConfig,
            weather: data.weather
              ? mergeWeather(
                  { ...DEFAULT_WEATHER, ...data.weather },
                  weatherOverridesRef.current,
                )
              : weather,
            lastSimulation: data.lastSimulation ?? null,
            agentChatMessages: loadedMessages,
            agentChatIntroDone: Boolean(data.agentChatIntroDone),
          });
          lastSavedPayloadRef.current = initialPayload;
        }
      } catch {
        if (!cancelled) {
          setAgentChatSnapshot({ messages: [], introDone: false });
        }
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
    setChatMountKey(0);
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
    if (agentChatSnapshot === null) return;
    if (skipSaveAfterLoadRef.current) {
      skipSaveAfterLoadRef.current = false;
      return;
    }

    const payloadObj = {
      title: projectTitle,
      plan: projectConfig,
      weather,
      lastSimulation: lastSimulationSnapshot,
      agentChatMessages: agentChatSnapshot.messages,
      agentChatIntroDone: agentChatSnapshot.introDone,
    };
    const payloadHash = JSON.stringify(payloadObj);
    if (lastSavedPayloadRef.current === payloadHash) {
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
            body: payloadHash,
          });
          if (!res.ok) throw new Error("save failed");
          lastSavedPayloadRef.current = payloadHash;
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
  }, [
    hydrated,
    projectConfig,
    weather,
    projectTitle,
    projectId,
    lastSimulationSnapshot,
    agentChatSnapshot,
  ]);

  useEffect(() => {
    return () => {
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
      if (readyBadgeTimerRef.current) clearTimeout(readyBadgeTimerRef.current);
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

  const streamStatusForPanel =
    simulationRun.status === "running"
      ? "open"
      : simulationRun.status === "error"
        ? "error"
        : "closed";

  const isSimulating = simulationRun.status === "running";
  const isSimulationReady = simulationRun.status === "ready";
  const activeTerrainLayer =
    terrainState.show.has("fuel")
      ? "fuel"
      : terrainState.show.has("slope")
        ? "slope"
        : terrainState.show.has("aspect")
          ? "aspect"
          : null;

  const panelStats = useMemo(
    () => ({
      ...statsFromOverlay(effectiveOverlay),
      weatherSource:
        lastSimulationSnapshot?.weatherSource ?? simulationRun.weatherSource,
      streamStatus: streamStatusForPanel,
      shapes: drawnShapes.length,
      simulationError: simulationRun.error,
    }),
    [
      effectiveOverlay,
      lastSimulationSnapshot?.weatherSource,
      simulationRun.weatherSource,
      simulationRun.error,
      streamStatusForPanel,
      drawnShapes.length,
    ],
  );

  const handleSetupUpdate = useCallback((update: SetupUpdate) => {
    if (
      update.field === "cellResolution" ||
      update.field === "cellSpaceDimension" ||
      update.field === "cellSpaceDimensionLat"
    ) {
      const v = Number(update.value);
      if (Number.isNaN(v)) return;
      const key = update.field;
      setProjectConfig((prev) => ({
        ...prev,
        [key]: Math.max(1, Math.round(v)),
      }));
      return;
    }

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

  const handleRunTrigger = useCallback(
    (trigger: RunTrigger) => {
      if (trigger.action !== "run-simulation") return;
      const requested =
        typeof trigger.simulationTimesteps === "number" &&
        Number.isFinite(trigger.simulationTimesteps)
          ? clampSimulationTimesteps(trigger.simulationTimesteps)
          : typeof trigger.simulationHours === "number" &&
              Number.isFinite(trigger.simulationHours)
            ? legacyHoursToTimesteps(trigger.simulationHours)
            : DEFAULT_SIMULATION_TIMESTEPS;
      void handleStartSimulation(requested);
    },
    [handleStartSimulation],
  );

  const fetchWeatherForCoords = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/weather/zip?lat=${lat}&lng=${lng}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.weather) {
        setWeather(mergeWeather(json.weather, weatherOverridesRef.current));
        if (json.placeLabel) {
          setWeatherStatus(`Weather for ${json.placeLabel} fetched`);
        }
      }
    } catch (e) {
      console.error("Auto weather fetch failed", e);
    }
  }, []);

  const handleActionConfirm = useCallback((payload: ActionPayload) => {
    if (payload.action === "location") {
      // When re-setting location, wipe all project data except chat.
      // Start from a fresh plan, then merge the new location in.
      const fresh = defaultIgnitionPlan();
      // Preserve cell grid settings the user may have configured:
      fresh.cellResolution = projectConfig.cellResolution;
      fresh.cellSpaceDimension = projectConfig.cellSpaceDimension;
      fresh.cellSpaceDimensionLat = projectConfig.cellSpaceDimensionLat;
      // Preserve weather:
      fresh.windSpeed = weather.windSpeed;
      fresh.windDegree = weather.windDirection;
      fresh.temperature = weather.temperature;
      fresh.humidity = weather.humidity;

      const merged = mergeActionIntoPlan(fresh, payload);
      setProjectConfig(merged);
      setLocationSearchPreview(null);
      // Clear terrain, simulation results, and replay state
      setTerrainState({ ...INITIAL_TERRAIN, show: new Set() });
      setLastSimulationSnapshot(null);
      clearReplayTimers();
      setReplayFrame(null);
      setIsReplayAnimating(false);
      setSimulationRun({ status: "idle", error: null });
      
      // Automatic weather fetch for the new project center
      void fetchWeatherForCoords(payload.proj_center_lat, payload.proj_center_lng);
    } else {
      setProjectConfig((prev) => mergeActionIntoPlan(prev, payload));
    }
  }, [projectConfig.cellResolution, projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat, weather, clearReplayTimers, fetchWeatherForCoords]);

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

  const handlePointIgnitionEdit = useCallback(
    (input: { teamIndex: number; segmentIndex: number; x: number; y: number }) => {
      const x = Number.isFinite(input.x) ? Math.max(0, Math.round(input.x)) : 0;
      const y = Number.isFinite(input.y) ? Math.max(0, Math.round(input.y)) : 0;
      setProjectConfig((prev) => {
        const team = prev.team_infos[input.teamIndex];
        if (!team) return prev;
        const seg = team.details[input.segmentIndex];
        if (!seg) return prev;
        const details = team.details.map((s, idx) => {
          if (idx !== input.segmentIndex) return s;
          return {
            ...s,
            start_x: x,
            start_y: y,
            end_x: x,
            end_y: y,
          };
        });
        const teams = prev.team_infos.map((t, ti) =>
          ti === input.teamIndex ? { ...t, details } : t,
        );
        return { ...prev, team_infos: teams };
      });
    },
    [],
  );

  const resetProject = useCallback(() => {
    const nextIntroDone = agentChatSnapshot?.introDone ?? false;
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
    setWeatherOverrides({});
    setTerrainState({ ...INITIAL_TERRAIN, show: new Set() });
    setDrawnShapes([]);
    setLastSimulationSnapshot(null);
    setLocationSearchPreview(null);
    setSimulationRun({ status: "idle", error: null });
    setMapInteractionMode(null);
    pendingActionRef.current = null;
    pendingPolygonRef.current = [];

    setChatMountKey((k) => k + 1);
    setAgentChatSnapshot({ messages: [], introDone: nextIntroDone });

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
            agentChatMessages: [],
            agentChatIntroDone: nextIntroDone,
          }),
        });
        if (!res.ok) throw new Error("reset save failed");
        lastSavedPayloadRef.current = JSON.stringify({
          title: nextTitle,
          plan,
          weather: DEFAULT_WEATHER,
          lastSimulation: null,
          agentChatMessages: [],
          agentChatIntroDone: nextIntroDone,
        });
        setSaveStatus("saved");
        if (savedClearRef.current) clearTimeout(savedClearRef.current);
        savedClearRef.current = setTimeout(() => setSaveStatus("idle"), 2200);
      } catch {
        setSaveStatus("error");
      }
    })();
  }, [projectId, clearReplayTimers, agentChatSnapshot]);

  useEffect(() => {
    if (!mapInteractionMode) setInteractionHint(null);
  }, [mapInteractionMode]);

  useEffect(() => {
    if (!mapInteractionMode) {
      setInteractionPalette("ignition");
    }
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
      if (mode === "polyline" && pendingActionRef.current === "fuel-break") return true;
      if (
        (mode === "rect" || mode === "place-square") &&
        pendingActionRef.current === "location"
      ) {
        return true;
      }
      const b = projectConfig.boundaryGeoJSON;
      if (!b) return true;
      return pointInBoundary(latlng.lat, latlng.lng, b);
    },
    [mapInteractionMode, projectConfig.boundaryGeoJSON],
  );

  const hasProjectLocation = !!projectConfig.boundaryGeoJSON;
  const hasSimulationResults = lastSimulationSnapshot !== null;
  const totalSegmentCount = projectConfig.team_infos.reduce(
    (n, team) => n + team.details.length,
    0,
  );
  const runActionsEnabled = hasProjectLocation && totalSegmentCount > 0;

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
    const maxDim = Math.max(projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat);
    const gx = Math.round(dx / cellRes + maxDim / 2);
    const gy = Math.round(dy / cellRes + maxDim / 2);
    const payload: ActionPayload = {
      action: "point-ignition",
      points: [{ x: gx, y: gy, speed: 0.6, mode: "point_static" }],
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
    const maxDim = Math.max(projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat);
    const toGrid = (ll: import("leaflet").LatLng) => ({
      x: Math.round(((ll.lng - cx) * metersPerDeg * cosLat) / cellRes + maxDim / 2),
      y: Math.round(((ll.lat - cy) * metersPerDeg) / cellRes + maxDim / 2),
    });
    const s = toGrid(start);
    const e = toGrid(end);
    const payload: ActionPayload =
      pendingActionRef.current === "fuel-break"
        ? {
            action: "fuel-break",
            x1: s.x,
            y1: s.y,
            x2: e.x,
            y2: e.y,
          }
        : {
            action: "line-ignition",
            start_x: s.x,
            start_y: s.y,
            end_x: e.x,
            end_y: e.y,
            speed: 0.6,
            mode: "continuous_static",
          };
    pendingActionRef.current = null;
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
      // Wipe all scenario data (same as handleActionConfirm for location)
      const fresh = defaultIgnitionPlan();
      fresh.cellResolution = projectConfig.cellResolution;
      fresh.cellSpaceDimension = projectConfig.cellSpaceDimension;
      fresh.cellSpaceDimensionLat = projectConfig.cellSpaceDimensionLat;
      fresh.windSpeed = weather.windSpeed;
      fresh.windDegree = weather.windDirection;
      fresh.temperature = weather.temperature;
      fresh.humidity = weather.humidity;
      setProjectConfig(mergeActionIntoPlan(fresh, payload));
      setLocationSearchPreview(null);
      setTerrainState({ ...INITIAL_TERRAIN, show: new Set() });
      setLastSimulationSnapshot(null);
      clearReplayTimers();
      setReplayFrame(null);
      setIsReplayAnimating(false);
      setSimulationRun({ status: "idle", error: null });
    }
    setMapInteractionMode(null);
  }, [projectConfig.cellResolution, projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat, weather, clearReplayTimers, pushInteractionHint]);

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
    const maxDim = Math.max(projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat);
    const toGrid = (ll: import("leaflet").LatLng) => {
      const dx = (ll.lng - cx) * metersPerDeg * cosLat;
      const dy = (ll.lat - cy) * metersPerDeg;
      return {
        x: Math.round(dx / cellRes + maxDim / 2),
        y: Math.round(dy / cellRes + maxDim / 2),
      };
    };
    for (let i = 0; i < nodes.length - 1; i++) {
      const s = toGrid(nodes[i]!);
      const e = toGrid(nodes[i + 1]!);
      const payload: ActionPayload = {
        action: "fuel-break",
        x1: s.x,
        y1: s.y,
        x2: e.x,
        y2: e.y,
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
    // Wipe all scenario data (same as handleRect / handleActionConfirm for location)
    const fresh = defaultIgnitionPlan();
    fresh.cellResolution = projectConfig.cellResolution;
    fresh.cellSpaceDimension = projectConfig.cellSpaceDimension;
    fresh.cellSpaceDimensionLat = projectConfig.cellSpaceDimensionLat;
    fresh.windSpeed = weather.windSpeed;
    fresh.windDegree = weather.windDirection;
    fresh.temperature = weather.temperature;
    fresh.humidity = weather.humidity;
    setProjectConfig(mergeActionIntoPlan(fresh, payload));
    setLocationSearchPreview(null);
    setTerrainState({ ...INITIAL_TERRAIN, show: new Set() });
    setLastSimulationSnapshot(null);
    clearReplayTimers();
    setReplayFrame(null);
    setIsReplayAnimating(false);
    setSimulationRun({ status: "idle", error: null });
    setMapInteractionMode(null);
  }, [projectConfig.cellResolution, projectConfig.cellSpaceDimension, projectConfig.cellSpaceDimensionLat, weather, clearReplayTimers]);

  const handleRequestMapInteraction = useCallback(
    (mode: MapInteractionMode, action?: "location" | "fuel-break") => {
      pendingActionRef.current = action ?? null;
      if (action === "fuel-break") setInteractionPalette("fuel-break");
      else if (action === "location") setInteractionPalette("location");
      else setInteractionPalette("ignition");

      // For location, always use place-square so the user clicks once to drop
      // a pre-sized grid square rather than free-hand drawing a rectangle.
      const resolvedMode: MapInteractionMode =
        action === "location" ? "place-square" : mode;

      setMapInteractionMode(resolvedMode);

      if (resolvedMode === "place-square" && action === "location") {
        const cellSide = projectConfig.cellSpaceDimension;
        const res = projectConfig.cellResolution;
        const km = Math.round((cellSide * res) / 1000);
        setInteractionHint(
          `Move the cursor to position your ${cellSide}×${cellSide}-cell boundary square (${km} km side), then click to place it.`,
        );
      } else if (mode === "polyline" && action === "fuel-break") {
        setInteractionHint("Click nodes for the fuel-break path, then press Escape to finish.");
      } else if (mode === "line" && action === "fuel-break") {
        setInteractionHint("Click start point, then end point to place a fuel-break segment.");
      }
    },
    [locationSearchPreview, projectConfig.cellSpaceDimension, projectConfig.cellResolution],
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

  if (agentChatSnapshot === null) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0f0f0f] text-sm text-white/40">
        Loading…
      </main>
    );
  }

  return (
    <ProjectAgentChatHost
      key={`${projectId}-${chatMountKey}`}
      projectId={projectId}
      initialMessages={agentChatSnapshot.messages}
      introDoneServer={agentChatSnapshot.introDone}
      onPersist={handleAgentChatPersist}
      onIntroClaimed={handleAgentIntroClaimed}
    >
      {({
        messages,
        sendMessage,
        status,
        showStarterPrompt,
        starterPromptText,
        sendStarterPrompt,
        dismissStarterPrompt,
      }) => (
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
          {weatherStatus && (
            <span className="shrink-0 hidden md:inline text-[9px] text-orange-400/80 sm:text-[10px]">
              • {weatherStatus}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {terrainState.loading && (
            <span className="flex items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[9px] font-medium text-sky-300 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <span className="h-1 w-1 animate-pulse rounded-full bg-sky-300 sm:h-1.5 sm:w-1.5" />
              <span className="hidden sm:inline">
                Fetching terrain{activeTerrainLayer ? ` (${activeTerrainLayer})` : ""}
              </span>
              <span className="sm:hidden">Terrain</span>
            </span>
          )}
          {!terrainState.loading && activeTerrainLayer && terrainState.data[activeTerrainLayer] && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium text-emerald-300 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <span className="h-1 w-1 rounded-full bg-emerald-300 sm:h-1.5 sm:w-1.5" />
              <span className="hidden sm:inline">Terrain ready ({activeTerrainLayer})</span>
              <span className="sm:hidden">T ready</span>
            </span>
          )}
          {isSimulating && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-medium text-amber-300 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <span className="h-1 w-1 animate-pulse rounded-full bg-amber-300 sm:h-1.5 sm:w-1.5" />
              <span className="hidden sm:inline">Processing simulation</span>
              <span className="sm:hidden">Processing</span>
            </span>
          )}
          {isSimulationReady && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium text-emerald-400 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <span className="h-1 w-1 rounded-full bg-emerald-400 sm:h-1.5 sm:w-1.5" />
              <span className="hidden sm:inline">Simulation Ready</span>
              <span className="sm:hidden">Ready</span>
            </span>
          )}
          <button
            type="button"
            title="Play saved simulation"
            disabled={
              !lastSimulationSnapshot ||
              isReplayAnimating ||
              simulationRun.status === "running"
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
          cellResolution={
            lastSimulationSnapshot?.gridMeta?.cellResolution ?? projectConfig.cellResolution
          }
          cellSpaceDimension={
            lastSimulationSnapshot?.gridMeta?.cellSpaceDimension ??
            projectConfig.cellSpaceDimension
          }
          cellSpaceDimensionLat={
            lastSimulationSnapshot?.gridMeta?.cellSpaceDimensionLat ??
            projectConfig.cellSpaceDimensionLat
          }
          projCenterLat={
            lastSimulationSnapshot?.gridMeta?.projCenterLat ??
            projectConfig.proj_center_lat
          }
          projCenterLng={
            lastSimulationSnapshot?.gridMeta?.projCenterLng ??
            projectConfig.proj_center_lng
          }
          scenarioPlan={projectConfig}
          interactionPalette={interactionPalette}
          squareWidthM={projectConfig.cellSpaceDimension * projectConfig.cellResolution}
          squareHeightM={projectConfig.cellSpaceDimensionLat * projectConfig.cellResolution}
        />

        <FireOverlay points={effectiveOverlay} />

        <MapOverlayPanels
          stats={panelStats}
          messages={messages}
          planPreview={{
            segments: totalSegmentCount,
            fuelBreaks: projectConfig.sup_num,
            centerSet: hasProjectLocation,
          }}
          hasProjectLocation={hasProjectLocation}
          hasSimulationResults={!!lastSimulationSnapshot}
          runActionsEnabled={runActionsEnabled}
          onStartSimulation={(timesteps) => {
            void handleStartSimulation(timesteps);
          }}
          onReplay={handleReplay}
          onCommitPlanGridField={(field, value) => {
            setProjectConfig((prev) => ({ ...prev, [field]: value }));
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
          onWeatherOverride={(field, value) => {
            setWeather((prev) => ({ ...prev, [field]: value }));
            setWeatherOverrides((prev) => ({ ...prev, [field]: value }));
          }}
          onWeatherFetched={(next) => {
            setWeather(mergeWeather(next, weatherOverridesRef.current));
            // Setting a generic status if we don't have the place label here
            // Note: MapOverlayPanels will provide more specific hints locally
          }}
          onWeatherFetchedAtCoords={(next, coords, label) => {
            setWeather(mergeWeather(next, weatherOverridesRef.current));
            if (label) {
              setWeatherStatus(`Weather for ${label} fetched`);
            }
          }}
          onActionConfirm={handleActionConfirm}
          onLocationSearchPreview={setLocationSearchPreview}
          onRequestMapInteraction={handleRequestMapInteraction}
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          mapRef={mapRef}
          projectConfig={projectConfig}
          onSegmentEdit={handleSegmentEdit}
          onSegmentDelete={handleSegmentDelete}
          onPointIgnitionEdit={handlePointIgnitionEdit}
          onFuelBreakDelete={handleFuelBreakDelete}
          terrainState={terrainState}
          onTerrainChange={handleTerrainChange}
          simulationRunning={simulationRun.status === "running"}
          playbackRate={playbackRate}
          onPlaybackRateChange={setPlaybackRate}
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
            onRunTrigger={handleRunTrigger}
            showStarterPrompt={showStarterPrompt}
            starterPromptText={starterPromptText}
            onSendStarterPrompt={sendStarterPrompt}
            onDismissStarterPrompt={dismissStarterPrompt}
          />
        </div>
      </div>
    </main>
      )}
    </ProjectAgentChatHost>
  );
}
