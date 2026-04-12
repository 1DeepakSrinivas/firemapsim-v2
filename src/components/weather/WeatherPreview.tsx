"use client";

import { motion } from "motion/react";
import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";

import { slideFromBottom } from "@/lib/transitions";

type WeatherField = "windSpeed" | "windDirection" | "temperature" | "humidity";

export type WeatherValues = {
  windSpeed: number;
  windDirection: number;
  temperature: number;
  humidity: number;
};

type WeatherPreviewProps = {
  weather: WeatherValues;
  onWeatherOverride: (field: WeatherField, value: number) => void;
};

function toCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return dirs[idx] ?? "N";
}

function WeatherRow({
  label,
  field,
  value,
  suffix,
  onCommit,
}: {
  label: string;
  field: WeatherField;
  value: number;
  suffix?: string;
  onCommit: (field: WeatherField, value: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 text-sm text-foreground">
        {isEditing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              const parsed = Number(draft);
              if (!Number.isNaN(parsed)) {
                onCommit(field, parsed);
              }
              setIsEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const parsed = Number(draft);
                if (!Number.isNaN(parsed)) {
                  onCommit(field, parsed);
                }
                setIsEditing(false);
              }
              if (event.key === "Escape") {
                setDraft(String(value));
                setIsEditing(false);
              }
            }}
            className="w-20 rounded border border-input bg-background px-2 py-1 text-right text-sm"
          />
        ) : (
          <span>
            {value}
            {suffix ? ` ${suffix}` : ""}
          </span>
        )}

        <button
          type="button"
          aria-label={`Edit ${label}`}
          onClick={() => {
            setDraft(String(value));
            setIsEditing(true);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}

export default function WeatherPreview({
  weather,
  onWeatherOverride,
}: WeatherPreviewProps) {
  const windDirectionSuffix = useMemo(
    () => `\u00b0 ${toCompass(weather.windDirection)}`,
    [weather.windDirection],
  );

  return (
    <motion.section
      className="rounded-xl border border-border bg-card p-3"
      initial={slideFromBottom.initial}
      animate={slideFromBottom.animate}
      transition={slideFromBottom.transition}
    >
      <h3 className="text-sm font-semibold text-foreground">Weather Preview</h3>
      <div className="mt-3 space-y-2">
        <WeatherRow
          label="Wind"
          field="windSpeed"
          value={weather.windSpeed}
          suffix="mph"
          onCommit={onWeatherOverride}
        />

        <WeatherRow
          label="Direction"
          field="windDirection"
          value={weather.windDirection}
          suffix={windDirectionSuffix}
          onCommit={onWeatherOverride}
        />

        <WeatherRow
          label="Temp"
          field="temperature"
          value={weather.temperature}
          suffix="F"
          onCommit={onWeatherOverride}
        />

        <WeatherRow
          label="Humidity"
          field="humidity"
          value={weather.humidity}
          suffix="%"
          onCommit={onWeatherOverride}
        />
      </div>
    </motion.section>
  );
}
