# DEVS-FIRE Findings Log (2026-04-20)

## Context
- Reported issue: DEVS-FIRE flows appeared broken in app usage; user observed `POST /api/devs-fire/connectToServer 404 in 60s`.
- Constraint: no smoke-test-based conclusion; investigate code and runtime behavior directly.

## What Was Verified

### 1) MCP contract verification (devs-fire-docs)
- `connectToServer` canonical endpoint: `POST https://firesim.cs.gsu.edu/api/connectToServer/`
- Contract body for connect: raw text `"testtest"`
- Contract note: use `https://firesim.cs.gsu.edu/api/<endpoint>/` (no `:8084`)
- Related terrain chain contracts validated:
  - `setCellResolution` (`userToken`, `cellResolution`, `cellDimension` in query)
  - `setCellSpaceLocation` (`userToken`, `lat`, `lng` in query)
  - `getCellFuel` (`userToken` in query)

### 2) Upstream behavior verification (direct, outside sandbox restrictions)
- Direct upstream probes for `connectToServer` returned fast `200` responses.
- Runtime `fetch` probes (same shape as app code) also returned fast `200`.
- Conclusion: upstream availability is good; breakage is in app integration behavior/pathing.

### 3) Local app routing/auth behavior
- `POST /api/devs-fire/connectToServer` without authenticated context produced Clerk redirect (`307` to `/login`), confirming route protection is active.
- Route exists and is discoverable in Next runtime MCP route index.

## Findings

1. The connect path was too permissive and had weak bounded-failure behavior:
   - It attempted multiple variants (including non-canonical GET paths) and could produce opaque failures.
   - Failure details were not sufficiently attempt-specific for fast diagnosis from client envelopes.

2. The observed `404 in 60s` pattern can be amplified by endpoint-attempt chaining under route/runtime limits:
   - Even when upstream is healthy, bad-path attempts plus long route timing can surface as delayed failures.

3. Protected route behavior must be accounted for during manual checks:
   - Unauthenticated checks can look like endpoint failure while actually being auth redirect/protection.

## Fixes Applied

### Connect wrapper hardening
- File: `src/lib/devsfire/endpoints.ts`
- Changes:
  - Introduced explicit connect attempt table with MCP-aligned POST-first behavior.
  - Added per-attempt timeout bound (`CONNECT_ATTEMPT_TIMEOUT_MS = 15_000`).
  - Removed GET-based connect attempts from connect flow.
  - Added attempt-level error summaries into thrown `DevsFireError.details` for actionable envelope diagnostics.

### Connect route runtime budget
- File: `src/app/api/devs-fire/connectToServer/route.ts`
- Change: added `export const maxDuration = 360;` to align with other long-running DEVS-FIRE routes.

### Regression guard tests
- File: `src/lib/devsfire/endpoints.test.ts`
- Added assertions for connect call shape:
  - method is `POST`
  - body is exactly `"testtest"`
  - first successful path is `/api/connectToServer/`

## Validation After Fix
- `bun test src/lib/devsfire/endpoints.test.ts src/lib/devsfire/httpClient.test.ts` passed.
- `bun x tsc --noEmit` passed.

## Operational Notes
- If a frontend flow still fails, inspect envelope `error.details` from `/api/devs-fire/connectToServer`; it now includes per-attempt classification and status context.
- Ensure requests to `/api/devs-fire/*` are made in an authenticated session (Clerk guard is intentional).
- Keep base URL as `https://firesim.cs.gsu.edu/api` in environment config.
