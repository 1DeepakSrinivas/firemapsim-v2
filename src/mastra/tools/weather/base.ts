import z from "zod";

export const hourlyWeatherPointSchema = z.object({
  hour: z.number().int(),
  windSpeed: z.number(),
  windDirection: z.number(),
  temperature: z.number(),
  humidity: z.number(),
});

export const weatherCurrentSchema = z.object({
  windSpeed: z.number(),
  windDirection: z.number(),
  temperature: z.number(),
  humidity: z.number(),
});

export const weatherResponseSchema = z.object({
  current: weatherCurrentSchema,
  hourly: z.array(hourlyWeatherPointSchema),
  source: z.enum(["open-meteo", "nws"]),
});

export type HourlyWeatherPoint = z.infer<typeof hourlyWeatherPointSchema>;
