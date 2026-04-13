import { createStep, createWorkflow } from "@mastra/core/workflows";
import z from "zod";

import { runSimulationWithDynamicWeather } from "@/lib/api/devsFireBackend";
import type { IgnitionPlan } from "@/types/ignitionPlan";

import { connectToServer } from "@/mastra/tools/devsFire/connectToServer";
import { runSimulation } from "@/mastra/tools/devsFire/runSimulation";
import { fetchParcelBoundary } from "@/mastra/tools/geo/fetchParcelBoundary";
import { geocodeAddress } from "@/mastra/tools/geo/geocodeAddress";
import { fetchWeather } from "@/mastra/tools/weather/fetchWeather";

import { simulationOperationListSchema } from "../tools/devsFire/_client";

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const scenarioWeatherSchema = z.object({
  windSpeed: z.number(),
  windDirection: z.number(),
  temperature: z.number(),
  humidity: z.number(),
});

const simulateInputSchema = z
  .object({
    address: z.string().min(1).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    simulationHours: z.number().int().positive().default(24),
    radiusMeters: z.number().positive().default(250),
    userToken: z.string().min(1).optional(),
    /** Full project plan + scenario weather — enables DEVS-FIRE setup + ignitions */
    plan: z.unknown().optional(),
    weather: scenarioWeatherSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const p = value.plan as IgnitionPlan | undefined;
    if (
      p &&
      typeof p.proj_center_lat === "number" &&
      typeof p.proj_center_lng === "number" &&
      value.weather
    ) {
      return;
    }
    const hasAddress = Boolean(value.address);
    const hasLatLng = typeof value.lat === "number" && typeof value.lng === "number";
    if (!hasAddress && !hasLatLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either address or lat/lng, or pass plan + weather with project center.",
      });
    }
  });

const areaSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  bbox: bboxSchema,
  addressResolved: z.string().optional(),
});

const weatherDataSchema = z.object({
  source: z.enum(["open-meteo", "nws", "scenario"]),
  current: z.object({
    windSpeed: z.number(),
    windDirection: z.number(),
    temperature: z.number(),
    humidity: z.number(),
  }),
  hourlyCount: z.number().int().nonnegative(),
});

const weatherBranchOutputSchema = z.object({
  area: areaSchema,
  weather: weatherDataSchema,
});

const prepBranchOutputSchema = z.object({
  area: areaSchema,
  prep: z.object({
    ready: z.boolean(),
    devsFireConfigured: z.boolean().optional(),
  }),
});

function isValidationLike(value: unknown): value is { error: true; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (value as { error?: unknown }).error === true
  );
}

async function invokeTool<TOutput>(tool: any, input: any, name: string): Promise<TOutput> {
  const result = await tool.execute(input, {} as any);
  if (isValidationLike(result)) {
    throw new Error(`${name} failed: ${result.message}`);
  }
  return result as TOutput;
}

const resolveAreaStep = createStep({
  id: "resolve-area",
  inputSchema: simulateInputSchema,
  outputSchema: areaSchema,
  execute: async ({ inputData, getInitData, writer }) => {
    const init = getInitData<z.infer<typeof simulateInputSchema>>();
    const plan = init.plan as IgnitionPlan | undefined;

    if (
      plan &&
      typeof plan.proj_center_lat === "number" &&
      typeof plan.proj_center_lng === "number" &&
      init.weather
    ) {
      const lat = plan.proj_center_lat;
      const lng = plan.proj_center_lng;
      const parcel = await invokeTool<{ bbox: [number, number, number, number] }>(
        fetchParcelBoundary,
        { lat, lng, radiusMeters: init.radiusMeters },
        "fetchParcelBoundary",
      );
      await writer?.custom({
        type: "data-simulation-progress",
        data: { stage: "resolve-area", lat, lng, fromPlan: true },
        transient: true,
      });
      return {
        lat,
        lng,
        bbox: parcel.bbox,
        addressResolved: "project-plan",
      };
    }

    let lat = inputData.lat;
    let lng = inputData.lng;
    let addressResolved: string | undefined;

    if (typeof lat !== "number" || typeof lng !== "number") {
      const geocoded = await invokeTool<{ lat: number; lng: number; displayName: string }>(
        geocodeAddress,
        { address: inputData.address },
        "geocodeAddress",
      );
      lat = geocoded.lat;
      lng = geocoded.lng;
      addressResolved = geocoded.displayName;
    }

    const parcel = await invokeTool<{ bbox: [number, number, number, number] }>(
      fetchParcelBoundary,
      { lat, lng, radiusMeters: inputData.radiusMeters },
      "fetchParcelBoundary",
    );

    await writer?.custom({
      type: "data-simulation-progress",
      data: { stage: "resolve-area", lat, lng },
      transient: true,
    });

    return { lat, lng, bbox: parcel.bbox, addressResolved };
  },
});

const weatherBranchStep = createStep({
  id: "weather-branch",
  inputSchema: areaSchema,
  outputSchema: weatherBranchOutputSchema,
  execute: async ({ inputData, getInitData, writer }) => {
    const init = getInitData<z.infer<typeof simulateInputSchema>>();
    const plan = init.plan as IgnitionPlan | undefined;

    if (
      plan &&
      typeof plan.proj_center_lat === "number" &&
      init.weather
    ) {
      const w = init.weather;
      await writer?.custom({
        type: "data-simulation-progress",
        data: { stage: "weather", source: "scenario" },
        transient: true,
      });
      return {
        area: inputData,
        weather: {
          source: "scenario" as const,
          current: {
            windSpeed: w.windSpeed,
            windDirection: w.windDirection,
            temperature: w.temperature,
            humidity: w.humidity,
          },
          hourlyCount: 0,
        },
      };
    }

    const weather = await invokeTool<{
      source: "open-meteo" | "nws";
      current: { windSpeed: number; windDirection: number; temperature: number; humidity: number };
      hourly: unknown[];
    }>(
      fetchWeather,
      { lat: inputData.lat, lng: inputData.lng, hours: init.simulationHours },
      "fetchWeather",
    );

    await writer?.custom({
      type: "data-simulation-progress",
      data: { stage: "weather", source: weather.source },
      transient: true,
    });

    return {
      area: inputData,
      weather: {
        source: weather.source,
        current: weather.current,
        hourlyCount: weather.hourly.length,
      },
    };
  },
});

const prepBranchStep = createStep({
  id: "prep-branch",
  inputSchema: areaSchema,
  outputSchema: prepBranchOutputSchema,
  execute: async ({ inputData, getInitData, writer }) => {
    const init = getInitData<z.infer<typeof simulateInputSchema>>();
    const fromPlan = Boolean(
      init.plan &&
        init.weather &&
        typeof (init.plan as IgnitionPlan).proj_center_lat === "number",
    );

    await writer?.custom({
      type: "data-simulation-progress",
      data: {
        stage: "prep",
        ready: true,
        devsFireNext: fromPlan ? "runSimulationWithDynamicWeather" : "legacy-connect-run",
      },
      transient: true,
    });
    return {
      area: inputData,
      prep: { ready: true as const, devsFireConfigured: fromPlan },
    };
  },
});

const runStep = createStep({
  id: "run-simulation",
  inputSchema: z.any(),
  outputSchema: z.object({
    userToken: z.string(),
    operations: simulationOperationListSchema,
    bbox: bboxSchema,
    weatherSource: z.enum(["open-meteo", "nws", "scenario", "dynamic"]),
  }),
  execute: async ({ inputData, getInitData, writer }) => {
    const branches = inputData as Record<string, unknown>;
    const weatherBranch = weatherBranchOutputSchema.parse(branches["weather-branch"]);
    const prepBranch = prepBranchOutputSchema.parse(branches["prep-branch"]);
    const init = getInitData<z.infer<typeof simulateInputSchema>>();
    const plan = init.plan as IgnitionPlan | undefined;

    if (
      plan &&
      init.weather &&
      prepBranch.prep.devsFireConfigured &&
      plan.team_infos?.some((t) => t.details.length > 0)
    ) {
      const output = await runSimulationWithDynamicWeather({
        plan,
        simulationHours: init.simulationHours,
        weatherOverrides: init.weather,
      });
      const { result } = output;

      await writer?.custom({
        type: "data-simulation-progress",
        data: { stage: "run", operationCount: result.operations.length },
        transient: true,
      });

      return {
        userToken: result.userToken,
        operations: result.operations,
        bbox: result.bbox,
        weatherSource: result.weatherSource,
      };
    }

    const token =
      init.userToken ??
      (await invokeTool<{ token: string }>(connectToServer, {}, "connectToServer")).token;

    const operations = await invokeTool<z.infer<typeof simulationOperationListSchema>>(
      runSimulation,
      { userToken: token, time: init.simulationHours },
      "runSimulation",
    );

    await writer?.custom({
      type: "data-simulation-progress",
      data: { stage: "run", operationCount: operations.length },
      transient: true,
    });

    return {
      userToken: token,
      operations,
      bbox: prepBranch.area.bbox,
      weatherSource: weatherBranch.weather.source,
    };
  },
});

export const simulateWorkflow = createWorkflow({
  id: "simulate-fire-workflow",
  description: "Resolve area, gather weather, and run DEVS-FIRE simulation.",
  inputSchema: simulateInputSchema,
  outputSchema: runStep.outputSchema,
})
  .then(resolveAreaStep)
  .parallel([weatherBranchStep, prepBranchStep])
  .then(runStep)
  .commit();

export type SimulateWorkflowInput = z.infer<typeof simulateInputSchema>;
