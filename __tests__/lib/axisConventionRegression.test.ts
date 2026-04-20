import { describe, expect, test } from "bun:test";

import { planSegmentToDynamicIgnition } from "@/lib/devsFireIgnitionDispatch";
import { gridCellCenterToLatLng } from "@/lib/gridProjection";

describe("axis convention regression guard", () => {
  test("keeps authored ignition coordinates aligned with operation coordinates on map projection", () => {
    const projection = {
      projCenterLat: 37.7749,
      projCenterLng: -122.4194,
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
    };

    const authoredSegment = {
      start_x: 42,
      start_y: 160,
      end_x: 151,
      end_y: 53,
    };

    const dispatched = planSegmentToDynamicIgnition(authoredSegment);

    expect(dispatched).toEqual({
      x1: authoredSegment.start_x,
      y1: authoredSegment.start_y,
      x2: authoredSegment.end_x,
      y2: authoredSegment.end_y,
    });

    // runSimulation operations use the same x/y axis convention we render on the map.
    const opStart = { x: dispatched.x1, y: dispatched.y1 };
    const opEnd = { x: dispatched.x2, y: dispatched.y2 };

    const authoredStartLatLng = gridCellCenterToLatLng(
      authoredSegment.start_x,
      authoredSegment.start_y,
      projection,
    );
    const opStartLatLng = gridCellCenterToLatLng(opStart.x, opStart.y, projection);
    const authoredEndLatLng = gridCellCenterToLatLng(
      authoredSegment.end_x,
      authoredSegment.end_y,
      projection,
    );
    const opEndLatLng = gridCellCenterToLatLng(opEnd.x, opEnd.y, projection);

    expect(Math.abs(authoredStartLatLng.lat - opStartLatLng.lat)).toBeLessThan(1e-12);
    expect(Math.abs(authoredStartLatLng.lng - opStartLatLng.lng)).toBeLessThan(1e-12);
    expect(Math.abs(authoredEndLatLng.lat - opEndLatLng.lat)).toBeLessThan(1e-12);
    expect(Math.abs(authoredEndLatLng.lng - opEndLatLng.lng)).toBeLessThan(1e-12);

    const transposedStartLatLng = gridCellCenterToLatLng(
      authoredSegment.start_y,
      authoredSegment.start_x,
      projection,
    );
    expect(
      Math.abs(authoredStartLatLng.lat - transposedStartLatLng.lat) +
        Math.abs(authoredStartLatLng.lng - transposedStartLatLng.lng),
    ).toBeGreaterThan(1e-6);
  });
});
