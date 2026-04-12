"use client";

/**
 * MapInteractionLayer — Leaflet-native interaction modes for scenario setup.
 *
 * Modes:
 *   pin        — single click places a marker; fires onPin(latlng)
 *   line       — two clicks define start/end; fires onLine(start, end)
 *   polygon    — click to add nodes, double-click to close; fires onPolygon(latlngs)
 */

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLng } from "leaflet";

export type MapInteractionMode = "pin" | "line" | "polyline" | "polygon" | "rect" | null;

export type MapInteractionLayerProps = {
  mode: MapInteractionMode;
  onPin?: (latlng: LatLng) => void;
  onLine?: (start: LatLng, end: LatLng) => void;
  onPolyline?: (nodes: LatLng[]) => void;
  onPolygon?: (latlngs: LatLng[]) => void;
  onRect?: (corner1: LatLng, corner2: LatLng) => void;
  onCancel?: () => void;
  /** If set, clicks are only committed when this returns true (e.g. inside project boundary). */
  validateLatLng?: (latlng: LatLng) => boolean;
  onValidationFail?: () => void;
};

const MARKER_STYLE = `
  width: 22px; height: 22px;
  background: #f97316;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(249,115,22,0.35);
  cursor: crosshair;
`;

const NODE_STYLE = `
  width: 10px; height: 10px;
  background: #f97316;
  border: 2px solid #fff;
  border-radius: 50%;
`;

export function MapInteractionLayer({
  mode,
  onPin,
  onLine,
  onPolyline,
  onPolygon,
  onRect,
  onCancel,
  validateLatLng,
  onValidationFail,
}: MapInteractionLayerProps) {
  const map = useMap();
  const validateRef = useRef(validateLatLng);
  const failRef = useRef(onValidationFail);
  validateRef.current = validateLatLng;
  failRef.current = onValidationFail;

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
          html: `<div style="${MARKER_STYLE}"></div>`,
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
            html: `<div style="${MARKER_STYLE}"></div>`,
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
          L.polyline([start, end], {
            color: "#f97316",
            weight: 2.5,
            dashArray: undefined,
          }).addTo(map);
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
          color: "#f97316",
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
          color: "#f97316",
          fillColor: "#f97316",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
        polygonMarkersRef.current.push(cm);

        // Redraw polyline through all nodes
        polygonPolylineRef.current?.remove();
        polygonPolylineRef.current = L.polyline(polygonNodesRef.current, {
          color: "#f97316",
          weight: 2,
        }).addTo(map);
      }

      function handlePolygonMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (polygonNodesRef.current.length === 0) return;
        const last = polygonNodesRef.current[polygonNodesRef.current.length - 1]!;
        polygonPreviewLineRef.current?.remove();
        polygonPreviewLineRef.current = L.polyline([last, e.latlng], {
          color: "#f97316",
          weight: 1.5,
          dashArray: "4 4",
          opacity: 0.6,
        }).addTo(map);
      }

      function handlePolygonDblClick() {
        const nodes = polygonNodesRef.current;
        if (nodes.length < 3) return;
        // Close the polygon visually
        polygonPolylineRef.current?.remove();
        L.polygon(nodes, {
          color: "#f97316",
          weight: 2,
          fillColor: "#f97316",
          fillOpacity: 0.12,
        }).addTo(map);
        onPolygon?.(nodes);
        // Clear working state (markers stay as visual record)
        polygonNodesRef.current = [];
        polygonMarkersRef.current = [];
        polygonPolylineRef.current = null;
        polygonPreviewLineRef.current?.remove();
        polygonPreviewLineRef.current = null;
      }

      // ── Polyline mode (multi-node open line, dblclick to commit) ─────────
      function handlePolylineClick(e: import("leaflet").LeafletMouseEvent) {
        if (!ok(e.latlng)) return;
        polylineNodesRef.current = [...polylineNodesRef.current, e.latlng];
        const cm = L.circleMarker(e.latlng, {
          radius: 5,
          color: "#f97316",
          fillColor: "#f97316",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
        polylineMarkersRef.current.push(cm);
        polylinePolylineRef.current?.remove();
        polylinePolylineRef.current = L.polyline(polylineNodesRef.current, {
          color: "#f97316",
          weight: 2.5,
        }).addTo(map);
      }

      function handlePolylineMouseMove(e: import("leaflet").LeafletMouseEvent) {
        if (polylineNodesRef.current.length === 0) return;
        const last = polylineNodesRef.current[polylineNodesRef.current.length - 1]!;
        polylinePreviewRef.current?.remove();
        polylinePreviewRef.current = L.polyline([last, e.latlng], {
          color: "#f97316",
          weight: 1.5,
          dashArray: "4 4",
          opacity: 0.6,
        }).addTo(map);
      }

      function handlePolylineDblClick() {
        const nodes = polylineNodesRef.current;
        if (nodes.length < 2) return;
        polylinePolylineRef.current?.remove();
        L.polyline(nodes, { color: "#f97316", weight: 2.5 }).addTo(map);
        onPolyline?.(nodes);
        polylineNodesRef.current = [];
        polylineMarkersRef.current = [];
        polylinePolylineRef.current = null;
        polylinePreviewRef.current?.remove();
        polylinePreviewRef.current = null;
      }

      // ── Rect mode ─────────────────────────────────────────────────────────
      function handleRectClick(e: import("leaflet").LeafletMouseEvent) {
        if (!rectCorner1Ref.current) {
          if (!ok(e.latlng)) return;
          // First click — record corner 1
          rectCorner1Ref.current = e.latlng;
          const icon = L.divIcon({
            html: `<div style="${MARKER_STYLE}"></div>`,
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
          L.rectangle(L.latLngBounds(c1, c2), {
            color: "#38bdf8",
            weight: 2,
            fillColor: "#38bdf8",
            fillOpacity: 0.12,
          }).addTo(map);
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
        map.on("dblclick", handlePolylineDblClick);
        map.doubleClickZoom.disable();
      } else if (mode === "rect") {
        map.on("click", handleRectClick);
        map.on("mousemove", handleRectMouseMove);
      }

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
        map.doubleClickZoom.enable();
        map.off("click", handleRectClick);
        map.off("mousemove", handleRectMouseMove);
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
  }, [mode]);

  return null;
}
