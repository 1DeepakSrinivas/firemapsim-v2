import { createTool } from "@mastra/core/tools";
import z from "zod";

import { hourlyWeatherPointSchema } from "./base";

const inputSchema = z.object({
  hourlyWeather: z.array(hourlyWeatherPointSchema),
  durationHours: z.number().int().positive(),
});

const outputSchema = z.object({
  fileContent: z.string(),
  rowCount: z.number().int().nonnegative(),
});

function toDevsFireWindDirection(meteoDirection: number): number {
  return (meteoDirection + 180) % 360;
}

export const buildWindflowFile = createTool({
  id: "weather-build-windflow-file",
  description:
    "Convert hourly weather into DEVS-FIRE windflow text format with direction conversion.",
  inputSchema,
  outputSchema,
  execute: async ({ hourlyWeather, durationHours }) => {
    const rowCount = Math.min(durationHours, hourlyWeather.length);
    const rows = hourlyWeather.slice(0, rowCount).map((point, hour) => {
      const minute = 0;
      const temperature = Number(point.temperature.toFixed(2));
      const windSpeed = Number(point.windSpeed.toFixed(2));
      const windDirection = Number(
        toDevsFireWindDirection(point.windDirection).toFixed(2),
      );

      return `${hour}\t${minute}\t${temperature}\t${windSpeed}\t${windDirection}`;
    });

    const lines = [
      "5",
      String(rowCount),
      "hour\tminute\ttemperature\twind_speed\twind_direction",
      ...rows,
    ];

    return {
      fileContent: lines.join("\n"),
      rowCount,
    };
  },
});
