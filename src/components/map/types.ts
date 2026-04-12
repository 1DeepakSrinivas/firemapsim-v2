export type FireCellState = "burning" | "burned" | "unburned";

export type FireOverlayPoint = {
  x: number;
  y: number;
  state: FireCellState;
  time: number;
};

export type BoundsChangePayload = {
  lat: number;
  lng: number;
  bbox: [number, number, number, number];
};

export type LineGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type FeatureGeometry = {
  type: "Feature";
  geometry: LineGeometry | PolygonGeometry;
  properties?: Record<string, unknown> | null;
};

export type PerimeterGeoJSON = LineGeometry | PolygonGeometry | FeatureGeometry | null;

export type PolygonFeature = {
  type: "Feature";
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  properties?: Record<string, unknown>;
};
