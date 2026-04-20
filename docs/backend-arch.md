# DEVS-FIRE Backend Architecture (Rebuild)

## Overview
This backend is rebuilt into a strict three-layer server architecture for DEVS-FIRE integration:

1. **Layer 1: HTTP Client**  
   One outbound client responsible for canonical base URL handling, retries, timeout behavior, payload encoding, and error classification.
2. **Layer 2: Endpoint Functions**  
   One typed function per DEVS-FIRE endpoint, each delegating to Layer 1 with endpoint-specific parsing.
3. **Layer 3: Route Handlers**  
   Next.js route handlers that validate input, read session state, call Layer 2 functions, and return a consistent envelope.

This preserves frontend capabilities while removing direct token exposure to browser code.

## Layer 1: HTTP Client
**File:** `src/lib/devsfire/httpClient.ts`  
**Config:** `src/lib/devsfire/config.ts`  
**Errors:** `src/lib/devsfire/errors.ts`

### Responsibilities
- Canonicalize base URL to `https://firesim.cs.gsu.edu/api`
- Build query string and request body for POST-based DEVS-FIRE endpoints
- Timeout with abort handling
- Retry on transient classes
- Parse JSON-or-text response and detect HTML payload issues
- Classify all upstream failures into the 5 standard error classes:
  - `ConnectionError`
  - `TimeoutError`
  - `SimulationError`
  - `ServerError`
  - `UnknownError`

### Retry Policy
- Retryable classes: `ConnectionError`, `TimeoutError`, `ServerError`
- Non-retryable classes: `SimulationError`, `UnknownError`
- Backoff: simple linear backoff

## Layer 2: Endpoint Function Inventory
**File:** `src/lib/devsfire/endpoints.ts`

All required DEVS-FIRE endpoints are represented as typed functions:

1. `connectToServer`
2. `setCellResolution`
3. `getCellSpaceSize`
4. `getCellSize`
5. `setCellSpaceLocation`
6. `setWindCondition`
7. `loadWindFlow`
8. `loadFuel`
9. `loadSlope`
10. `loadAspect`
11. `getCellFuel`
12. `getCellSlope`
13. `getCellAspect`
14. `setPointIgnition`
15. `setDynamicIgnition`
16. `setSuppressedCell`
17. `runSimulation`
18. `continueSimulation`
19. `getPerimeterCells`
20. `computeBurnedArea`
21. `computePerimeterLength`
22. `getBurningCellNum`
23. `getUnburnedCellNum`
24. `getCellState`
25. `setMultiParameters`

### Parsing Strategy
- Numeric endpoint helpers normalize direct or envelope numeric payloads.
- Matrix endpoints normalize direct matrix or nested matrix payloads.
- Simulation endpoints parse operation lists via schema validation.

## Layer 3: Route Handlers
**Helpers:** `src/lib/devsfire/routeHandlers.ts`  
**Envelope:** `src/lib/devsfire/envelope.ts`

### Standard Response Envelope
All rebuilt DEVS-FIRE/simulation routes return:

- **Success**
```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

- **Failure**
```json
{
  "ok": false,
  "data": null,
  "error": { "type": "SimulationError", "message": "...", "details": "..." },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### Dedicated DEVS-FIRE Routes
Added under `src/app/api/devs-fire/*`:

- `connectToServer`
- `setCellResolution`
- `getCellSpaceSize`
- `getCellSize`
- `setCellSpaceLocation`
- `setWindCondition`
- `loadWindFlow`
- `loadFuel`
- `loadSlope`
- `loadAspect`
- `getCellFuel`
- `getCellSlope`
- `getCellAspect`
- `setPointIgnition`
- `setDynamicIgnition`
- `setSuppressedCell`
- `runSimulation`
- `continueSimulation`
- `getPerimeterCells`
- `computeBurnedArea`
- `computePerimeterLength`
- `getBurningCellNum`
- `getUnburnedCellNum`
- `getCellState`
- `setMultiParameters`
- additive combined route: `metrics`

### Compatibility Route
`/api/devs-fire/route.ts` remains as a compatibility shim for legacy callers while enforcing session cookie behavior and envelope responses.

## Session Security Model
**File:** `src/lib/devsfire/session.ts`

### Design
- Upstream `userToken` is never returned to frontend payloads.
- Session stored in encrypted `httpOnly` cookie (`devs_fire_session`).
- Cookie payload includes:
  - `token`
  - `iat`
  - `exp`
- Encryption: AES-256-GCM with key derived from `DEVS_FIRE_SESSION_SECRET` (fallback to `CLERK_SECRET_KEY` if needed).

### Cookie Defaults
- `httpOnly: true`
- `sameSite: lax`
- `path: /`
- `secure: true` in production
- TTL: 12 hours

## Simulation Pipeline Rewire
**Core Orchestrator:** `src/lib/runDevsFireFromPlan.ts`

### Changes
- Rewired orchestration to call Layer 2 endpoint functions instead of ad-hoc raw upstream calls.
- Maintains existing run path behavior but now through standardized wrappers.
- Keeps per-endpoint setup fallback intact.
- Adds optional bootstrap optimization path through `setMultiParameters` when enabled.

### Bootstrap Optimization
- Env gate: `DEVS_FIRE_USE_MULTI_PARAMETERS`
- If enabled and terrain is online-mode, attempts single-call setup with:
  - location
  - wind
  - cell resolution/dimension
- If that fails, falls back to per-endpoint setup sequence.

## Feature Flags and Guards

### Wind Flow
- `loadWindFlow` remains feature-flagged by `DEVS_FIRE_ENABLE_WINDFLOW`.
- If disabled, route returns explicit not-enabled error envelope.

### Diagnostics and Smoke
- Diagnostics route remains bearer-token guarded (`DEVS_FIRE_DIAGNOSTICS_KEY`).
- Smoke route now requires authenticated user.
- Middleware updated to protect `/api/devs-fire(.*)`.

## Existing Frontend Compatibility

### Terrain Flow
`src/lib/devsFireBrowser.ts` now:
- uses dedicated backend routes
- relies on server-managed session cookie
- no browser token handling

`src/components/map/MapOverlayPanels.tsx` updated accordingly.

### Simulation Run Flow
`/api/simulation/run` and `/api/simulation/delegate-run` now:
- return envelope responses
- set session cookie after successful upstream connection/run
- do not expose `userToken` in payload

`src/components/map/ProjectWorkspace.tsx` updated to unwrap new envelope format while preserving existing UI behavior.

## Data Exposure Hardening

`LatestSimulationManifest` no longer includes `userToken` in shared/replayed payloads:
- `src/types/latestSimulation.ts`
- `src/lib/latestSimulationStore.ts`
- legacy replay fallback route adjusted.

## Environment Variables
Updated `.env.example`:

- `DEVS_FIRE_BASE_URL`
- `DEVS_FIRE_REQUEST_TIMEOUT_MS`
- `DEVS_FIRE_SESSION_SECRET`
- `DEVS_FIRE_DIAGNOSTICS_KEY`
- `DEVS_FIRE_ENABLE_WINDFLOW`
- `DEVS_FIRE_USE_MULTI_PARAMETERS`

## Testing

### Added
- `src/lib/devsfire/httpClient.test.ts`
  - timeout/network/server/simulation classification + retry behavior
- `src/lib/devsfire/endpoints.test.ts`
  - wrapper parsing/contracts, including missing wrappers and `setMultiParameters`

### Updated
- `src/lib/devsFireBrowser.test.ts`
- `src/app/api/devs-fire/smoke/route.test.ts`
- `src/app/api/devs-fire/diagnostics/route.test.ts`
- `src/mastra/tools/devsFire/_client.test.ts` URL expectation updates

### Verification Commands
- `bun test src/lib/devsfire src/lib/devsFireBrowser.test.ts src/app/api/devs-fire/smoke/route.test.ts src/app/api/devs-fire/diagnostics/route.test.ts src/lib/api src/mastra/tools/devsFire`
- `bun x tsc --noEmit`

Both pass on this branch.

## Notes for Future Work
- If desired, the compatibility proxy route can be removed once all consumers use dedicated endpoint routes.
- Additional integration tests can be added for all new route handlers to validate envelope and auth/session behavior end-to-end.
