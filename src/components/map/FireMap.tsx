"use client";

import "leaflet/dist/leaflet.css";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { BoundsChangePayload, FireOverlayPoint, PerimeterGeoJSON } from "./types";
import type { MapStyleId } from "./MapOverlayPanels";
import type { MapInteractionMode, MapInteractionLayerProps } from "./MapInteractionLayer";

import type { FireMapClientProps } from "./FireMapClient";
import type { TerrainData, TerrainLayer } from "./MapOverlayPanels";

const FireMapClient = dynamic<FireMapClientProps>(() => import("./FireMapClient"), {
  ssr: false,
});

export type FireMapProps = {
  onBoundsChange?: (payload: BoundsChangePayload) => void;
  onMapReady?: (map: import("leaflet").Map) => void;
  fireOverlay?: FireOverlayPoint[];
  perimeterGeoJSON?: PerimeterGeoJSON;
  mapStyle?: MapStyleId;
  interactionMode?: MapInteractionMode;
  onPin?: MapInteractionLayerProps["onPin"];
  onLine?: MapInteractionLayerProps["onLine"];
  onPolyline?: MapInteractionLayerProps["onPolyline"];
  onPolygon?: MapInteractionLayerProps["onPolygon"];
  onRect?: MapInteractionLayerProps["onRect"];
  boundaryGeoJSON?: import("@/types/ignitionPlan").BoundaryGeoJSON;
  locationSearchPreview?: {
    lat: number;
    lng: number;
    boundaryGeoJSON: import("@/types/ignitionPlan").BoundaryGeoJSON | null;
  } | null;
  terrainData?: TerrainData;
  terrainShow?: Set<TerrainLayer>;
  showCellInfo?: boolean;
  cellResolution?: number;
  cellSpaceDimension?: number;
  cellSpaceDimensionLat?: number;
  projCenterLat?: number;
  projCenterLng?: number;
  validateLatLng?: MapInteractionLayerProps["validateLatLng"];
  onValidationFail?: MapInteractionLayerProps["onValidationFail"];
};

export default function FireMap({
  onBoundsChange,
  onMapReady,
  fireOverlay,
  perimeterGeoJSON,
  mapStyle,
  interactionMode,
  onPin,
  onLine,
  onPolyline,
  onPolygon,
  onRect,
  boundaryGeoJSON,
  locationSearchPreview,
  terrainData,
  terrainShow,
  showCellInfo,
  cellResolution,
  cellSpaceDimension,
  cellSpaceDimensionLat,
  projCenterLat,
  projCenterLng,
  validateLatLng,
  onValidationFail,
}: FireMapProps) {
  const points = useMemo(() => fireOverlay ?? [], [fireOverlay]);

  return (
    <FireMapClient
      onBoundsChange={onBoundsChange}
      onMapReady={onMapReady}
      fireOverlay={points}
      perimeterGeoJSON={perimeterGeoJSON ?? null}
      mapStyle={mapStyle}
      interactionMode={interactionMode}
      onPin={onPin}
      onLine={onLine}
      onPolyline={onPolyline}
      onPolygon={onPolygon}
      onRect={onRect}
      boundaryGeoJSON={boundaryGeoJSON}
      locationSearchPreview={locationSearchPreview}
      terrainData={terrainData}
      terrainShow={terrainShow}
      showCellInfo={showCellInfo}
      cellResolution={cellResolution}
      cellSpaceDimension={cellSpaceDimension}
      cellSpaceDimensionLat={cellSpaceDimensionLat}
      projCenterLat={projCenterLat}
      projCenterLng={projCenterLng}
      validateLatLng={validateLatLng}
      onValidationFail={onValidationFail}
    />
  );
}
