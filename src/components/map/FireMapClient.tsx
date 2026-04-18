"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { BoundaryGeoJSON, IgnitionPlan } from "@/types/ignitionPlan";
import { PlanScenarioLayer } from "./PlanScenarioLayer";
import {
  aspectColorForCell,
  fuelColorForCell,
  fuelLabelForCell,
  slopeColorForCell,
} from "@/lib/terrainLegend";
import type { TerrainData, TerrainLayer } from "./MapOverlayPanels";

import type {
  BoundsChangePayload,
  FireOverlayPoint,
  PerimeterGeoJSON,
} from "./types";
import type { MapStyleId } from "./MapOverlayPanels";
import type { MapInteractionMode, MapInteractionLayerProps } from "./MapInteractionLayer";
import { MapInteractionLayer } from "./MapInteractionLayer";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;

// Restrict panning to the United States (continental + Alaska + Hawaii)
const US_MAX_BOUNDS: [[number, number], [number, number]] = [
  [17.0, -180.0], // SW corner
  [71.5, -65.0],  // NE corner
];
const US_MIN_ZOOM = 4;

const TILE_LAYERS: Record<MapStyleId, { url: string; attribution: string }> = {
  terrain: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  },
};

const SATELLITE_LABELS_LAYER = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Labels &copy; Esri &mdash; Source: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), NOSTRA, and OpenStreetMap contributors",
};

export type FireMapClientProps = {
  onBoundsChange?: (payload: BoundsChangePayload) => void;
  onMapReady?: (map: import("leaflet").Map) => void;
  fireOverlay: FireOverlayPoint[];
  perimeterGeoJSON: PerimeterGeoJSON;
  mapStyle?: MapStyleId;
  interactionMode?: MapInteractionMode;
  onPin?: MapInteractionLayerProps["onPin"];
  onLine?: MapInteractionLayerProps["onLine"];
  onPolyline?: MapInteractionLayerProps["onPolyline"];
  onPolygon?: MapInteractionLayerProps["onPolygon"];
  onRect?: MapInteractionLayerProps["onRect"];
  boundaryGeoJSON?: BoundaryGeoJSON;
  /** Geocoded place preview (green); cleared when the project boundary is committed */
  locationSearchPreview?: {
    lat: number;
    lng: number;
    boundaryGeoJSON: BoundaryGeoJSON | null;
  } | null;
  terrainData?: TerrainData;
  terrainShow?: Set<TerrainLayer>;
  showCellInfo?: boolean;
  /** Grid dimensions and geo-center for coordinate mapping */
  cellResolution?: number;
  cellSpaceDimension?: number;
  cellSpaceDimensionLat?: number;
  projCenterLat?: number;
  projCenterLng?: number;
  validateLatLng?: MapInteractionLayerProps["validateLatLng"];
  onValidationFail?: MapInteractionLayerProps["onValidationFail"];
  /** Persisted scenario geometry (ignition segments, fuel breaks) — read-only overlay */
  scenarioPlan?: IgnitionPlan | null;
  /**
   * Accent for active drawing: fuel-break blue, ignition red, location/orange for area setup.
   * Do not infer from `interactionMode` alone (line mode was shared between ignition and fuel-break).
   */
  interactionPalette?: "fuel-break" | "location" | "ignition";
  /** Width of the place-square boundary in meters (used when interactionMode === 'place-square') */
  squareWidthM?: number;
  /** Height of the place-square boundary in meters. Defaults to squareWidthM. */
  squareHeightM?: number;
};

// ─── Project boundary layer ───────────────────────────────────────────────────

function BoundaryLayer({ geojson }: { geojson: BoundaryGeoJSON }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;

    let L: typeof import("leaflet");
    let layer: import("leaflet").GeoJSON | null = null;

    void import("leaflet").then((mod) => {
      L = mod;
      layer = L.geoJSON(geojson as Parameters<typeof L.geoJSON>[0], {
        style: {
          color: "#f97316",
          weight: 2.5,
          opacity: 0.85,
          fillColor: "#f97316",
          fillOpacity: 0.07,
          dashArray: "6 4",
        },
      }).addTo(map);
    });

    return () => {
      layer?.remove();
    };
  // Re-run whenever the geojson reference changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  return null;
}

/** Geocoded search preview (emerald) — not the committed project boundary (orange). */
function LocationSearchPreviewLayer({
  preview,
}: {
  preview: {
    lat: number;
    lng: number;
    boundaryGeoJSON: BoundaryGeoJSON | null;
  };
}) {
  const map = useMap();

  useEffect(() => {
    let L: typeof import("leaflet");
    let layer: import("leaflet").Layer | null = null;

    void import("leaflet").then((mod) => {
      L = mod;
      if (preview.boundaryGeoJSON) {
        layer = L.geoJSON(preview.boundaryGeoJSON as Parameters<typeof L.geoJSON>[0], {
          style: {
            color: "#34d399",
            weight: 2,
            opacity: 0.95,
            fillColor: "#34d399",
            fillOpacity: 0.1,
            dashArray: "5 5",
          },
        }).addTo(map);
      } else {
        layer = L.circleMarker([preview.lat, preview.lng], {
          radius: 9,
          color: "#34d399",
          weight: 2,
          fillColor: "#34d399",
          fillOpacity: 0.22,
        }).addTo(map);
      }
    });

    return () => {
      layer?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  return null;
}

function toBoundsPayload(map: import("leaflet").Map): BoundsChangePayload {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    lat: center.lat,
    lng: center.lng,
    bbox: [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ],
  };
}

function MapEventsBridge({
  onBoundsChange,
  onMapReady,
}: {
  onBoundsChange?: (payload: BoundsChangePayload) => void;
  onMapReady?: (map: import("leaflet").Map) => void;
}) {
  const map = useMapEvents({
    moveend: () => onBoundsChange?.(toBoundsPayload(map)),
    zoomend: () => onBoundsChange?.(toBoundsPayload(map)),
  });

  useEffect(() => {
    onMapReady?.(map);
    onBoundsChange?.(toBoundsPayload(map));
  }, [map, onBoundsChange, onMapReady]);

  return null;
}

function FireCellOverlayLayer({
  points,
  cellResolution,
  cellSpaceDimension,
  cellSpaceDimensionLat,
  projCenterLat,
  projCenterLng,
}: {
  points: FireOverlayPoint[];
  cellResolution?: number;
  cellSpaceDimension?: number;
  cellSpaceDimensionLat?: number;
  projCenterLat?: number;
  projCenterLng?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (
      typeof cellResolution !== "number" ||
      cellResolution <= 0 ||
      typeof cellSpaceDimension !== "number" ||
      cellSpaceDimension <= 0 ||
      typeof cellSpaceDimensionLat !== "number" ||
      cellSpaceDimensionLat <= 0 ||
      typeof projCenterLat !== "number" ||
      typeof projCenterLng !== "number"
    ) {
      return;
    }

    let L: typeof import("leaflet");
    const layers: import("leaflet").Rectangle[] = [];

    void import("leaflet").then((mod) => {
      L = mod;
      const cellRes = cellResolution;
      const cellCols = cellSpaceDimension;
      const cellRows = cellSpaceDimensionLat;
      const centerLat = projCenterLat;
      const centerLng = projCenterLng;
      const metersPerDeg = 111320;
      const cosLat = Math.cos((centerLat * Math.PI) / 180);

      function cellBounds(gx: number, gy: number): [[number, number], [number, number]] {
        const dxMeters = (gx - cellCols / 2) * cellRes;
        const dyMeters = (gy - cellRows / 2) * cellRes;
        const lat = centerLat + dyMeters / metersPerDeg;
        const lng = centerLng + dxMeters / (metersPerDeg * Math.max(cosLat, 1e-9));
        const dLat = cellRes / metersPerDeg;
        const dLng = cellRes / (metersPerDeg * Math.max(cosLat, 1e-9));
        return [
          [lat, lng],
          [lat + dLat, lng + dLng],
        ];
      }

      for (const point of points) {
        if (point.state === "unburned") continue;
        const fillColor = point.state === "burning" ? "#ef4444" : "#6b7280";
        const rect = L.rectangle(cellBounds(point.x, point.y), {
          color: "transparent",
          fillColor,
          fillOpacity: point.state === "burning" ? 0.92 : 0.72,
          weight: 0,
          interactive: false,
          bubblingMouseEvents: false,
        }).addTo(map);
        layers.push(rect);
      }
    });

    return () => {
      layers.forEach((l) => l.remove());
    };
  }, [points, map, cellResolution, cellSpaceDimension, cellSpaceDimensionLat, projCenterLat, projCenterLng]);

  return null;
}

// ─── Terrain overlay (colors from @/lib/terrainLegend) ───────────────────────

type TerrainOverlayLayerProps = {
  data: TerrainData;
  show: Set<TerrainLayer>;
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
  projCenterLat: number;
  projCenterLng: number;
};

function TerrainOverlayLayer({
  data,
  show,
  cellResolution,
  cellSpaceDimension,
  cellSpaceDimensionLat,
  projCenterLat,
  projCenterLng,
}: TerrainOverlayLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!projCenterLat && !projCenterLng) return;

    let L: typeof import("leaflet");
    const layers: import("leaflet").Rectangle[] = [];

    void import("leaflet").then((mod) => {
      L = mod;
      const metersPerDeg = 111320;
      const cosLat = Math.cos((projCenterLat * Math.PI) / 180);

      // Helper: grid cell (gx, gy) → lat/lng bounds
      function cellBounds(gx: number, gy: number): [[number, number], [number, number]] {
        const dxMeters = (gx - cellSpaceDimension / 2) * cellResolution;
        const dyMeters = (gy - cellSpaceDimensionLat / 2) * cellResolution;
        const lat = projCenterLat + dyMeters / metersPerDeg;
        const lng = projCenterLng + dxMeters / (metersPerDeg * cosLat);
        const dLat = cellResolution / metersPerDeg;
        const dLng = cellResolution / (metersPerDeg * cosLat);
        return [
          [lat, lng],
          [lat + dLat, lng + dLng],
        ];
      }

      // Pick which matrix to render (priority: fuel > slope > aspect)
      const matrix =
        (show.has("fuel") && data.fuel) ||
        (show.has("slope") && data.slope) ||
        (show.has("aspect") && data.aspect);

      if (!matrix) return;

      const colorFn =
        show.has("fuel") && data.fuel ? fuelColorForCell :
        show.has("slope") && data.slope ? slopeColorForCell :
        aspectColorForCell;

      const rows = matrix.length;
      const cols = matrix[0]?.length ?? 0;

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const v = matrix[gy]?.[gx] ?? 0;
          const color = colorFn(v);
          if (color === "transparent") continue;
          const rect = L.rectangle(cellBounds(gx, gy), {
            color: "transparent",
            fillColor: color,
            fillOpacity: 1,
            weight: 0,
          }).addTo(map);
          layers.push(rect);
        }
      }
    });

    return () => {
      layers.forEach((l) => l.remove());
    };
  // Re-render whenever data or visibility changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, show, projCenterLat, projCenterLng, cellResolution, cellSpaceDimension, cellSpaceDimensionLat]);

  return null;
}

// ─── Cell info cursor ─────────────────────────────────────────────────────────

type CellInfoCursorProps = {
  data: TerrainData;
  show: Set<TerrainLayer>;
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
  projCenterLat: number;
  projCenterLng: number;
};

function CellInfoCursor({
  data,
  show,
  cellResolution,
  cellSpaceDimension,
  cellSpaceDimensionLat,
  projCenterLat,
  projCenterLng,
}: CellInfoCursorProps) {
  const map = useMap();
  const [info, setInfo] = useState<{ fuel?: number; slope?: number; aspect?: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const container = map.getContainer();

    function onMouseMove(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
      setPos({ x: clientX + 16, y: clientY + 16 });

      // Convert pixel to latlng
      const latlng = map.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
      const metersPerDeg = 111320;
      const cosLat = Math.cos((projCenterLat * Math.PI) / 180);
      const gx = Math.round(
        ((latlng.lng - projCenterLng) * metersPerDeg * cosLat) / cellResolution + cellSpaceDimension / 2,
      );
      const gy = Math.round(
        ((latlng.lat - projCenterLat) * metersPerDeg) / cellResolution + cellSpaceDimensionLat / 2,
      );

      const cell: { fuel?: number; slope?: number; aspect?: number } = {};
      if (show.has("fuel") && data.fuel) cell.fuel = data.fuel[gy]?.[gx];
      if (show.has("slope") && data.slope) cell.slope = data.slope[gy]?.[gx];
      if (show.has("aspect") && data.aspect) cell.aspect = data.aspect[gy]?.[gx];

      setInfo(Object.keys(cell).length ? cell : null);
    }

    function onMouseLeave() { setInfo(null); }

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [map, data, show, cellResolution, cellSpaceDimension, cellSpaceDimensionLat, projCenterLat, projCenterLng]);

  if (!mounted || !info) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-9999 min-w-[120px] rounded-xl border border-white/15 bg-[#141414]/95 px-3 py-2 shadow-2xl backdrop-blur-sm"
      style={{ left: pos.x, top: pos.y }}
    >
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">Cell Info</p>
      {info.fuel !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-white/50">Fuel model</span>
          <span className="text-[10px] font-semibold text-orange-300">{fuelLabelForCell(info.fuel)}</span>
        </div>
      )}
      {info.slope !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-white/50">Slope</span>
          <span className="text-[10px] font-semibold text-sky-300">{info.slope?.toFixed(1)}°</span>
        </div>
      )}
      {info.aspect !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-white/50">Aspect</span>
          <span className="text-[10px] font-semibold text-emerald-300">{info.aspect?.toFixed(1)}°</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

function toPolylinePositions(perimeterGeoJSON: PerimeterGeoJSON): [number, number][] {
  if (!perimeterGeoJSON) return [];
  const geometry =
    perimeterGeoJSON.type === "Feature" ? perimeterGeoJSON.geometry : perimeterGeoJSON;
  if (geometry.type === "LineString") return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    return ring.map(([lng, lat]) => [lat, lng]);
  }
  return [];
}

export default function FireMapClient({
  onBoundsChange,
  onMapReady,
  fireOverlay,
  perimeterGeoJSON,
  mapStyle = "terrain",
  interactionMode,
  onPin,
  onLine,
  onPolyline,
  onPolygon,
  onRect,
  boundaryGeoJSON,
  locationSearchPreview = null,
  terrainData,
  terrainShow,
  showCellInfo,
  cellResolution = 30,
  cellSpaceDimension = 200,
  cellSpaceDimensionLat = 200,
  projCenterLat = 0,
  projCenterLng = 0,
  validateLatLng,
  onValidationFail,
  scenarioPlan = null,
  interactionPalette = "ignition",
  squareWidthM,
  squareHeightM,
}: FireMapClientProps) {
  const perimeter = useMemo(() => toPolylinePositions(perimeterGeoJSON), [perimeterGeoJSON]);
  const tile = TILE_LAYERS[mapStyle];

  const interactionAccentColor =
    interactionPalette === "fuel-break"
      ? "#2563eb"
      : interactionPalette === "location"
        ? "#f97316"
        : "#dc2626";

  return (
    <div className="h-full w-full overflow-hidden">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        maxBounds={US_MAX_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={US_MIN_ZOOM}
        className="h-full w-full"
      >
        <TileLayer key={mapStyle} url={tile.url} attribution={tile.attribution} />
        {mapStyle === "satellite" && (
          <TileLayer
            key="satellite-labels"
            url={SATELLITE_LABELS_LAYER.url}
            attribution={SATELLITE_LABELS_LAYER.attribution}
          />
        )}

        <MapEventsBridge onBoundsChange={onBoundsChange} onMapReady={onMapReady} />
        {boundaryGeoJSON && <BoundaryLayer geojson={boundaryGeoJSON} />}
        {locationSearchPreview && !boundaryGeoJSON && (
          <LocationSearchPreviewLayer preview={locationSearchPreview} />
        )}
        {terrainData && terrainShow && terrainShow.size > 0 && (
          <TerrainOverlayLayer
            data={terrainData}
            show={terrainShow}
            cellResolution={cellResolution}
            cellSpaceDimension={cellSpaceDimension}
            cellSpaceDimensionLat={cellSpaceDimensionLat}
            projCenterLat={projCenterLat}
            projCenterLng={projCenterLng}
          />
        )}
        {showCellInfo && terrainData && terrainShow && terrainShow.size > 0 && (
          <CellInfoCursor
            data={terrainData}
            show={terrainShow}
            cellResolution={cellResolution}
            cellSpaceDimension={cellSpaceDimension}
            cellSpaceDimensionLat={cellSpaceDimensionLat}
            projCenterLat={projCenterLat}
            projCenterLng={projCenterLng}
          />
        )}
        <FireCellOverlayLayer
          points={fireOverlay}
          cellResolution={cellResolution}
          cellSpaceDimension={cellSpaceDimension}
          cellSpaceDimensionLat={cellSpaceDimensionLat}
          projCenterLat={projCenterLat}
          projCenterLng={projCenterLng}
        />
        {scenarioPlan && <PlanScenarioLayer plan={scenarioPlan} />}
        <MapInteractionLayer
          mode={interactionMode ?? null}
          accentColor={interactionAccentColor}
          onPin={onPin}
          onLine={onLine}
          onPolyline={onPolyline}
          onPolygon={onPolygon}
          onRect={onRect}
          validateLatLng={validateLatLng}
          onValidationFail={onValidationFail}
          squareWidthM={squareWidthM}
          squareHeightM={squareHeightM}
        />

        {perimeter.length > 1 && (
          <Polyline
            positions={perimeter}
            pathOptions={{ color: "#f97316", weight: 3, opacity: 0.95 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
