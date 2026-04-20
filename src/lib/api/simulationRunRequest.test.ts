import { describe, expect, test } from "bun:test";

import { defaultIgnitionPlan } from "@/types/ignitionPlan";
import { buildSimulationRunRequestBody } from "./simulationRunRequest";

describe("buildSimulationRunRequestBody", () => {
  test("maps frontend weather + timesteps into route payload contract", () => {
    const plan = {
      ...defaultIgnitionPlan(),
      windSpeed: 1,
      windDegree: 2,
      temperature: 3,
      humidity: 4,
      total_sim_time: 500,
    };

    const payload = buildSimulationRunRequestBody({
      projectId: "d2657f84-6fca-40ca-9f6c-40f2516b4f5c",
      plan,
      weather: {
        windSpeed: 12,
        windDirection: 245,
        temperature: 71,
        humidity: 30,
      },
      weatherOverrides: { humidity: 42 },
      simulationTimesteps: 12000,
    });

    expect(payload.projectId).toBe("d2657f84-6fca-40ca-9f6c-40f2516b4f5c");
    expect(payload.simulationHours).toBe(12000);
    expect(payload.plan.total_sim_time).toBe(12000);
    expect(payload.plan.windSpeed).toBe(12);
    expect(payload.plan.windDegree).toBe(245);
    expect(payload.plan.temperature).toBe(71);
    expect(payload.plan.humidity).toBe(30);
    expect(payload.weatherOverrides.humidity).toBe(42);
  });
});
