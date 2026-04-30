# DEVS-FIRE integration

DEVS-FIRE is the upstream wildfire simulation HTTP API. **All calls go through the Next.js server** (typed client, route handlers, encrypted session cookie). The browser must not hold upstream tokens or call DEVS-FIRE directly.

Canonical upstream base URL (configurable): **`https://firesim.cs.gsu.edu/api`** — see `DEVS_FIRE_BASE_URL` in [`.env.example`](../.env.example).

## Three-layer architecture

1. **Layer 1 — HTTP client**  
   - [`src/lib/devsfire/httpClient.ts`](../src/lib/devsfire/httpClient.ts) — base URL, timeouts, retries, payload encoding, response parsing.  
   - [`src/lib/devsfire/config.ts`](../src/lib/devsfire/config.ts) — env-driven settings.  
   - [`src/lib/devsfire/errors.ts`](../src/lib/devsfire/errors.ts) — error classes: `ConnectionError`, `TimeoutError`, `SimulationError`, `ServerError`, `UnknownError`.

   **Retries:** `ConnectionError`, `TimeoutError`, `ServerError` are retryable; `SimulationError` and `UnknownError` are not. Backoff is linear.

2. **Layer 2 — Endpoint functions**  
   - [`src/lib/devsfire/endpoints.ts`](../src/lib/devsfire/endpoints.ts) — one typed function per upstream endpoint, including: `connectToServer`, `setCellResolution`, `getCellSpaceSize`, `getCellSize`, `setCellSpaceLocation`, `setWindCondition`, `loadWindFlow`, `loadFuel`, `loadSlope`, `loadAspect`, `getCellFuel`, `getCellSlope`, `getCellAspect`, `setPointIgnition`, `setDynamicIgnition`, `setSuppressedCell`, `runSimulation`, `continueSimulation`, `getPerimeterCells`, `computeBurnedArea`, `computePerimeterLength`, `getBurningCellNum`, `getUnburnedCellNum`, `getCellState`, `setMultiParameters`.

3. **Layer 3 — Next.js route handlers**  
   - Helpers: [`src/lib/devsfire/routeHandlers.ts`](../src/lib/devsfire/routeHandlers.ts)  
   - Envelope: [`src/lib/devsfire/envelope.ts`](../src/lib/devsfire/envelope.ts)

### Response envelope

Success:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

Failure:

```json
{
  "ok": false,
  "data": null,
  "error": { "type": "SimulationError", "message": "...", "details": "..." },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### Route tree

Dedicated handlers under `src/app/api/devs-fire/*` mirror the endpoint list above, plus **`metrics`**. [`src/app/api/devs-fire/route.ts`](../src/app/api/devs-fire/route.ts) remains a **compatibility** shim with session and envelope behavior.

## Session security

- [`src/lib/devsfire/session.ts`](../src/lib/devsfire/session.ts) — upstream `userToken` is stored in an encrypted **`httpOnly`** cookie (`devs_fire_session`), not returned to clients in JSON. Key material from `DEVS_FIRE_SESSION_SECRET` (with documented fallback to `CLERK_SECRET_KEY` if needed). Cookie defaults: `sameSite: lax`, `path: /`, `secure` in production, TTL **12 hours**.

## Orchestration

- [`src/lib/runDevsFireFromPlan.ts`](../src/lib/runDevsFireFromPlan.ts) — runs the simulation pipeline using Layer 2 functions.

### Bootstrap optimization (`setMultiParameters`)

When **`DEVS_FIRE_USE_MULTI_PARAMETERS`** is `1` or `true`, online terrain mode may use a single multi-parameter call for location, wind, and cell resolution; on failure it falls back to the per-endpoint sequence.

## Feature flags

- **`DEVS_FIRE_ENABLE_WINDFLOW`** — when disabled, `loadWindFlow` routes return a clear “not enabled” envelope.
- **`DEVS_FIRE_DIAGNOSTICS_KEY`** — bearer token for the diagnostics route (deep upstream telemetry).

## Browser integration

- [`src/lib/devsFireBrowser.ts`](../src/lib/devsFireBrowser.ts) — calls **Next** `/api/devs-fire/*` routes only; relies on the session cookie set by the server.

## Simulation API envelopes

[`/api/simulation/run`](../src/app/api/simulation/run/route.ts) and related delegation routes return the same envelope style and set the session cookie after a successful connect; they do **not** expose `userToken` in JSON.

## Hardening

`LatestSimulationManifest` and replay payloads exclude `userToken` (see [`src/types/latestSimulation.ts`](../src/types/latestSimulation.ts), [`src/lib/latestSimulationStore.ts`](../src/lib/latestSimulationStore.ts)).

## Connectivity checks

1. **Direct upstream probe (no Next.js):**  
   `bun run devsfire:connect` — see [`scripts/devsfire-connect.mjs`](../scripts/devsfire-connect.mjs). Optional base: `bun scripts/devsfire-connect.mjs "https://firesim.cs.gsu.edu/api"`. JSON: `bun run devsfire:connect --json`.

2. **Through the app:** `/api/devs-fire/smoke` — **requires an authenticated Clerk session** (middleware). Test from the browser while signed in, not with a bare unauthenticated `curl`.

3. **Diagnostics:** `GET /api/devs-fire/diagnostics` with `Authorization: Bearer $DEVS_FIRE_DIAGNOSTICS_KEY`.

If upstream fails from your network, try **GSU VPN** (see [GSU VPN](https://technology.gsu.edu/technology-services/cybersecurity/virtual-private-network/)) and retry.

## Mastra tools

Under `src/mastra/tools/devsFire/`, Mastra tools wrap the same HTTP surface via the Next API layer for agent-driven flows.

## Related docs

- [auth-clerk.md](./auth-clerk.md) — why smoke must be authenticated.
- [testing.md](./testing.md) — automated tests for this stack.
