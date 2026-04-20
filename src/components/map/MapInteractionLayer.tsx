"use client";

/**
 * MapInteractionLayer — Leaflet-native interaction modes for scenario setup.
 *
 * Modes:
 *   pin          — single click places a marker; fires onPin(latlng)
 *   line         — two clicks define start/end; fires onLine(start, end)
 *   polygon      — click to add nodes, double-click to close; fires onPolygon(latlngs)
 *   polyline     — click to add nodes, press Escape to commit; fires onPolyline(latlngs)
 *   rect         — two clicks define opposite corners; fires onRect(corner1, corner2)
 *   place-square — square of fixed size follows cursor, single click places it;
 *                  fires onRect(corner1, corner2) with computed corners
 */

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLng } from "leaflet";

export type MapInteractionMode = "pin" | "line" | "polyline" | "polygon" | "rect" | "place-square" | null;

export type MapInteractionLayerProps = {
  mode: MapInteractionMode;
  accentColor?: string;
  onPin?: (latlng: LatLng) => void;
  onLine?: (start: LatLng, end: LatLng) => void;
  onPolyline?: (nodes: LatLng[]) => void;
  onPolygon?: (latlngs: LatLng[]) => void;
  onRect?: (corner1: LatLng, corner2: LatLng) => void;
  onCancel?: () => void;
  /** If set, clicks are only committed when this returns true (e.g. inside project boundary). */
  validateLatLng?: (latlng: LatLng) => boolean;
  onValidationFail?: () => void;
  /**
   * For place-square mode: the physical width of the square in meters (E-W).
   * Defaults to 6000 m (200 cells × 30 m).
   */
  squareWidthM?: number;
  /**
   * For place-square mode: the physical height of the square in meters (N-S).
   * Defaults to squareWidthM if not provided.
   */
  squareHeightM?: number;
};

function markerStyle(accentColor: string): string {
  return `
  width: 22px; height: 22px;
  background: ${accentColor};
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(255,255,255,0.25);
  cursor: crosshair;
`;
}

const METERS_PER_DEG = 111320;

/** Convert meters offset to lat/lng delta from a center. */
function metersToDeg(
  centerLat: number,
  halfWidthM: number,
  halfHeightM: number,
): { dLat: number; dLng: number } {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  return {
    dLat: halfHeightM / METERS_PER_DEG,
    dLng: halfWidthM / (METERS_PER_DEG * Math.max(cosLat, 1e-9)),
  };
}

export function MapInteractionLayer({
  mode,
  accentColor = "#f97316",
  onPin,
  onLine,
  onPolyline,
  onPolygon,
  onRect,
  onCancel,
  validateLatLng,
  onValidationFail,
  squareWidthM = 6000,
  squareHeightM,
}: MapInteractionLayerProps) {
  const map = useMap();
  const validateRef = useRef(validateLatLng);
  const failRef = useRef(onValidationFail);
  validateRef.current = validateLatLng;
  failRef.current = onValidationFail;

  // Keep latest square dimensions accessible inside the effect closure
  const squareWidthRef = useRef(squareWidthM);
  const squareHeightRef = useRef(squareHeightM ?? squareWidthM);
  squareWidthRef.current = squareWidthM;
  squareHeightRef.current = squareHeightM ?? squareWidthM;

  function ok(ll: LatLng): boolean {
    const v = validateRef.current;
    if (!v) return true;
    if (v(ll)) return true;
    failRef.current?.();
    return false;
  }

  // Refs to hold mutable state without re-renders
  const lineStartRef = useRef<LatLng | null>(null);
  const lineStartMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const linePreviewRef = useRef<import("leaflet").Polyline | null>(null);
  const polygonNodesRef = useRef<LatLng[]>([]);
  const polygonMarkersRef = useRef<import("leaflet").CircleMarker[]>([]);
  const polygonPolylineRef = useRef<import("leaflet").Polyline | null>(null);
  const polygonPreviewLineRef = useRef<import("leaflet").Polyline | null>(null);
  const rectCorner1Ref = useRef<LatLng | null>(null);
  const rectCorner1MarkerRef = useRef<import("leaflet").Marker | null>(null);
  const rectPreviewRef = useRef<import("leaflet").Rectangle | null>(null);
  const polylineNodesRef = useRef<LatLng[]>([]);
  const polylineMarkersRef = useRef<import("leaflet").CircleMarker[]>([]);
  const polylinePolylineRef = useRef<import("leaflet").Polyline | null>(null);
  const polylinePreviewRef = useRef<import("leaflet").Polyline | null>(null);

  // Cleanup helper
  function clearAll() {
    lineStartRef.current = null;
    lineStartMarkerRef.current?.remove();
    lineStartMarkerRef.current = null;
    linePreviewRef.current?.remove();
    linePreviewRef.current = null;
    polygonNodesRef.current = [];
    polygonMarkersRef.current.forEach((m) => m.remove());
    polygonMarkersRef.current = [];
    polygonPolylineRef.current?.remove();
    polygonPolylineRef.current = null;
    polygonPreviewLineRef.current?.remove();
    polygonPreviewLineRef.current = null;
    rectCorner1Ref.current = null;
    rectCorner1MarkerRef.current?.remove();
    rectCorner1MarkerRef.current = null;
    rectPreviewRef.current?.remove();
    rectPreviewRef.current = null;
    polylineNodesRef.current = [];
    polylineMarkersRef.current.forEach((m) => m.remove());
    polylineMarkersRef.current = [];
    polylinePolylineRef.current?.remove();
    polylinePolylineRef.current = null;
    polylinePreviewRef.current?.remove();
    polylinePreviewRef.current = null;
  }

  useEffect(() => {
    if (!mode) {
      clearAll();
      map.getContainer().style.cursor = "";
      return;
    }

    // Import leaflet lazily (it's client-only)
    let L: typeof import("leaflet");
    let cleanedUp = false;

    async function setup() {
      L = await import("leaflet");
      if (cleanedUp) return;

      map.getContainer().style.cursor = "crosshair";

      // ── Pin mode ──────────────────────────────────────────────────────────
      function handlePinClick(e: import("leaflet").LeafletMouseEvent) {
        if (!onPin) return;
        if (!ok(e.latlng)) return;
        // Place a visual marker
        const icon = L.divIcon({
          html: `<div style="${markerStyle(accentColor)}"></div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker(e.latlng, { icon }).addTo(map);
        onPin(e.latlng);
      }

      // ── Line mode ─────────────────────────────────────────────────────────
      function handleLineClick(e: import("leaflet").LeafletMouseEvent) {
        if (!lineStartRef.current) {
          if (!ok(e.latlng)) return;
          // First click — record start
          lineStartRef.current = e.latlng;
          const icon = L.divIcon({
            html: `<div style="${markerStyle(accentColor)}"></div>`,
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          lineStartMarkerRef.current = L.marker(e.latlng, { icon }).addTo(map);
        } else {
          // Second click — commit
          const start = lineStartRef.current;
          const end = e.latlng;
          if (!ok(end)) return;
          linePreviewRef.current?.remove();
          linePreviewRef.current = null;
          onLine?.(start, end);
          lineStartRef.current = null;
          lineStartMarkerRef.current?.remove();
          lineStartMarkerRef.current = null;
        }
      }

      function handleLineMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (!lineStartRef.current) return;
        linePreviewRef.current?.remove();
        linePreviewRef.current = L.polyline([lineStartRef.current, e.latlng], {
          color: accentColor,
          weight: 2,
          dashArray: "6 4",
          opacity: 0.7,
        }).addTo(map);
      }

      // ── Polygon mode ──────────────────────────────────────────────────────
      function handlePolygonClick(e: import("leaflet").LeafletMouseEvent) {
        polygonNodesRef.current = [...polygonNodesRef.current, e.latlng];
        const cm = L.circleMarker(e.latlng, {
          radius: 5,
          color: accentColor,
          fillColor: accentColor,
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
        polygonMarkersRef.current.push(cm);

        // Redraw polyline through all nodes
        polygonPolylineRef.current?.remove();
        polygonPolylineRef.current = L.polyline(polygonNodesRef.current, {
          color: accentColor,
          weight: 2,
        }).addTo(map);
      }

      function handlePolygonMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (polygonNodesRef.current.length === 0) return;
        const last = polygonNodesRef.current[polygonNodesRef.current.length - 1]!;
        polygonPreviewLineRef.current?.remove();
        polygonPreviewLineRef.current = L.polyline([last, e.latlng], {
          color: accentColor,
          weight: 1.5,
          dashArray: "4 4",
          opacity: 0.6,
        }).addTo(map);
      }

      function handlePolygonDblClick() {
        const nodes = polygonNodesRef.current;
        if (nodes.length < 3) return;
        onPolygon?.(nodes);
        // Clear working state; committed geometry should be rendered by stateful layers.
        polygonPolylineRef.current?.remove();
        polygonPolylineRef.current = null;
        polygonMarkersRef.current.forEach((m) => m.remove());
        polygonNodesRef.current = [];
        polygonMarkersRef.current = [];
        polygonPreviewLineRef.current?.remove();
        polygonPreviewLineRef.current = null;
      }

      // ── Polyline mode (multi-node open line, dblclick to commit) ─────────
      function handlePolylineClick(e: import("leaflet").LeafletMouseEvent) {
        if (!ok(e.latlng)) return;
        polylineNodesRef.current = [...polylineNodesRef.current, e.latlng];
        const cm = L.circleMarker(e.latlng, {
          radius: 5,
          color: accentColor,
          fillColor: accentColor,
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
        polylineMarkersRef.current.push(cm);
        polylinePolylineRef.current?.remove();
        polylinePolylineRef.current = L.polyline(polylineNodesRef.current, {
          color: accentColor,
          weight: 2.5,
        }).addTo(map);
      }

      function handlePolylineMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (polylineNodesRef.current.length === 0) return;
        const last = polylineNodesRef.current[polylineNodesRef.current.length - 1]!;
        polylinePreviewRef.current?.remove();
        polylinePreviewRef.current = L.polyline([last, e.latlng], {
          color: accentColor,
          weight: 1.5,
          dashArray: "4 4",
          opacity: 0.6,
        }).addTo(map);
      }

      function handlePolylineDblClick() {
        const nodes = polylineNodesRef.current;
        if (nodes.length < 2) return;
        // Do NOT draw a permanent layer here.
        // PlanScenarioLayer owns all committed geometry rendering.
        polylinePolylineRef.current?.remove();
        polylinePolylineRef.current = null;
        onPolyline?.(nodes);
        polylineNodesRef.current = [];
        polylineMarkersRef.current.forEach((m) => m.remove());
        polylineMarkersRef.current = [];
        polylinePreviewRef.current?.remove();
        polylinePreviewRef.current = null;
      }

      function handleEscape(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        e.preventDefault();
        if (mode === "polyline") {
          const nodes = polylineNodesRef.current;
          if (nodes.length >= 2) {
            handlePolylineDblClick();
            return;
          }
        }
        clearAll();
        onCancel?.();
      }

      // ── Rect mode ─────────────────────────────────────────────────────────
      function handleRectClick(e: import("leaflet").LeafletMouseEvent) {
        if (!rectCorner1Ref.current) {
          if (!ok(e.latlng)) return;
          // First click — record corner 1
          rectCorner1Ref.current = e.latlng;
          const icon = L.divIcon({
            html: `<div style="${markerStyle(accentColor)}"></div>`,
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          rectCorner1MarkerRef.current = L.marker(e.latlng, { icon }).addTo(map);
        } else {
          // Second click — commit rectangle
          const c1 = rectCorner1Ref.current;
          const c2 = e.latlng;
          if (!ok(c2)) return;
          rectPreviewRef.current?.remove();
          rectPreviewRef.current = null;
          onRect?.(c1, c2);
          rectCorner1Ref.current = null;
          rectCorner1MarkerRef.current?.remove();
          rectCorner1MarkerRef.current = null;
        }
      }

      function handleRectMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (!rectCorner1Ref.current) return;
        rectPreviewRef.current?.remove();
        rectPreviewRef.current = L.rectangle(L.latLngBounds(rectCorner1Ref.current, e.latlng), {
          color: "#38bdf8",
          weight: 1.5,
          dashArray: "6 4",
          fillColor: "#38bdf8",
          fillOpacity: 0.07,
          opacity: 0.7,
        }).addTo(map);
      }

      // ── Place-square mode ─────────────────────────────────────────────────
      // A fixed-size square follows the cursor; single click commits the boundary.

      function squareBoundsFromCenter(center: LatLng): import("leaflet").LatLngBounds {
        const { dLat, dLng } = metersToDeg(
          center.lat,
          squareWidthRef.current / 2,
          squareHeightRef.current / 2,
        );
        const sw = L.latLng(center.lat - dLat, center.lng - dLng);
        const ne = L.latLng(center.lat + dLat, center.lng + dLng);
        return L.latLngBounds(sw, ne);
      }

      function handlePlaceSquareMouseMove(e: import("leaflet").LeafletMouseEvent) {
        rectPreviewRef.current?.remove();
        const bounds = squareBoundsFromCenter(e.latlng);
        rectPreviewRef.current = L.rectangle(bounds, {
          color: "#f97316",
          weight: 2,
          dashArray: "7 4",
          fillColor: "#f97316",
          fillOpacity: 0.1,
          opacity: 0.85,
        }).addTo(map);
      }

      function handlePlaceSquareClick(e: import("leaflet").LeafletMouseEvent) {
        const bounds = squareBoundsFromCenter(e.latlng);
        rectPreviewRef.current?.remove();
        rectPreviewRef.current = null;
        onRect?.(bounds.getSouthWest(), bounds.getNorthEast());
      }

      // Attach listeners based on mode
      if (mode === "pin") {
        map.on("click", handlePinClick);
      } else if (mode === "line") {
        map.on("click", handleLineClick);
        map.on("mousemove", handleLineMouseMove);
      } else if (mode === "polygon") {
        map.on("click", handlePolygonClick);
        map.on("mousemove", handlePolygonMouseMove);
        map.on("dblclick", handlePolygonDblClick);
        // Prevent default zoom on dblclick
        map.doubleClickZoom.disable();
      } else if (mode === "polyline") {
        map.on("click", handlePolylineClick);
        map.on("mousemove", handlePolylineMouseMove);
        map.doubleClickZoom.disable();
      } else if (mode === "rect") {
        map.on("click", handleRectClick);
        map.on("mousemove", handleRectMouseMove);
      } else if (mode === "place-square") {
        map.on("mousemove", handlePlaceSquareMouseMove);
        map.on("click", handlePlaceSquareClick);
      }
      window.addEventListener("keydown", handleEscape);

      return () => {
        map.off("click", handlePinClick);
        map.off("click", handleLineClick);
        map.off("mousemove", handleLineMouseMove);
        map.off("click", handlePolygonClick);
        map.off("mousemove", handlePolygonMouseMove);
        map.off("dblclick", handlePolygonDblClick);
        map.off("click", handlePolylineClick);
        map.off("mousemove", handlePolylineMouseMove);
        map.off("dblclick", handlePolylineDblClick);
        window.removeEventListener("keydown", handleEscape);
        map.doubleClickZoom.enable();
        map.off("click", handleRectClick);
        map.off("mousemove", handleRectMouseMove);
        map.off("mousemove", handlePlaceSquareMouseMove);
        map.off("click", handlePlaceSquareClick);
        clearAll();
        map.getContainer().style.cursor = "";
      };
    }

    const cleanup = setup();

    return () => {
      cleanedUp = true;
      cleanup.then((fn) => fn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentColor, mode]);

  return null;
}
