import { describe, expect, test } from "bun:test";

import { parseSimulationOperationsResponse } from "./simulationOperations";

describe("parseSimulationOperationsResponse", () => {
  test("parses GSU API sample with string numeric fields", () => {
    const raw = [
      { x: "80", y: "80", Operation: "BurnTeam", time: "0.0" },
    ];
    const out = parseSimulationOperationsResponse(raw, "/runSimulation/");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      x: 80,
      y: 80,
      Operation: "BurnTeam",
      time: 0,
    });
  });

  test("parses nested envelope", () => {
    const raw = { data: [{ x: 1, y: 2, Operation: "X", time: 1.5 }] };
    const out = parseSimulationOperationsResponse(raw, "/runSimulation/");
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(1);
  });
});
