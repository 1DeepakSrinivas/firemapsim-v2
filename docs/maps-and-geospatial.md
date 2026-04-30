# Maps and geospatial UI

The map workspace combines **Leaflet** for slippy-map geography and **Konva** (via `react-konva`) for performant overlays such as ignitions and fuel breaks.

## Core components

- **`src/components/map/FireMapClient.tsx`** — Main Leaflet map: base layers, project boundary, ignitions, simulation overlays, and interaction wiring. Loaded dynamically from **`src/components/map/FireMap.tsx`** to avoid SSR issues with Leaflet.
- **`src/components/map/ProjectWorkspace.tsx`** — Orchestrates sidebar, map, modals, simulation run flow, and agent chat host.
- **`src/components/map/MapOverlayPanels.tsx`**, **`MapInteractionLayer.tsx`**, **`PlanScenarioLayer.tsx`** — Layered UI and drawing behavior on top of the map.

## Tiles and CRS

Default basemap behavior follows common OpenStreetMap-style tile usage in Leaflet (see component code for layer URLs and options). Keep **DEVS-FIRE** and **weather** concerns in their own docs; this page is only for map rendering and geospatial UX.

## Grid and projection

Simulation geometry uses a **project grid** aligned with DEVS-FIRE cell space. Coordinate helpers and projection notes live alongside map handlers (for example grid projection utilities under `src/lib/` referenced from workspace pin/line handlers).

## Related docs

- [devs-fire.md](./devs-fire.md) — terrain and simulation data loading through server routes and `devsFireBrowser.ts`.
- [weather.md](./weather.md) — populating wind and humidity used by the plan, not tile loading.
