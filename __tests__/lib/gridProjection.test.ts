import { describe, expect, test } from "bun:test";

import {
  clampGridIndex,
  latLngToGridCell,
} from "@/lib/gridProjection";

describe("gridProjection clamping", () => {
  const projection = {
    projCenterLat: 37.7749,
    projCenterLng: -122.4194,
    cellResolution: 30,
    cellSpaceDimension: 200,
    cellSpaceDimensionLat: 200,
  };

  test("clamps exact outer-edge projection to the last valid index", () => {
    const metersPerDeg = 111320;
    const cosLat = Math.cos((projection.projCenterLat * Math.PI) / 180);
    const lngAtRightEdge =
      projection.projCenterLng +
      (projection.cellSpaceDimension / 2) *
        projection.cellResolution /
        (metersPerDeg * cosLat);
    const latAtTopEdge =
      projection.projCenterLat +
      (projection.cellSpaceDimensionLat / 2) *
        projection.cellResolution /
        metersPerDeg;

    const cell = latLngToGridCell(latAtTopEdge, lngAtRightEdge, projection);
    expect(cell).toEqual({ x: 199, y: 199 });
  });

  test("clamps overshoot and undershoot values into valid index bounds", () => {
    expect(clampGridIndex(200, 200)).toBe(199);
    expect(clampGridIndex(205.4, 200)).toBe(199);
    expect(clampGridIndex(-3, 200)).toBe(0);
  });
});
