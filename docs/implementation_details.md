# Implementation Details

This document provides a technical overview of the classes, files, and environmental setup for FireMapSim-v2.

## 1. Key Files & Classes

### AI & Agents
- **`src/mastra/agents/firesim-agent.ts`**: Defines the `fireSimAgent`. This class contains the core instructions for simulation setup and the logic for emitting structured JSON updates.
- **`src/mastra/llm/openrouter.ts`**: Configuration for the OpenRouter provider and selection of LLM models (e.g., Claude 3.5 Sonnet).

### Components & Visualization
- **`src/components/map/FireMapClient.tsx`**: The main Leaflet map component. It handles the rendering of the base map, project boundary, ignitions, and simulation result overlays.
- **`src/components/map/ProjectWorkspace.tsx`**: The parent layout component for the simulation environment. It coordinates the map, chat sidebar, and configuration panels.
- **`src/components/map/ActionModal.tsx`**: A set of Radix-UI based modals that allow users to input numeric data for geospatial actions (e.g., specifying exact coordinates for a fuel break).
- **`src/chatComponents/ChatPanel.tsx`**: The interface for interacting with the Mastra agent. It includes the logic for parsing structured JSON "fences" out of the streaming LLM response.

### Backend & API
- **`src/app/api/weather/zip/route.ts`**: An API route that fetches meteorological data required by DEVS-FIRE.
- **`src/app/api/devs-fire/route.ts`**: The proxy endpoint that communicates with the DEVS-FIRE simulation engine.

## 2. Development Environment & Setup

### Prerequisites
- **Runtime**: [Node.js](https://nodejs.org/) (v20+) or [Bun](https://bun.sh/) (recommended).
- **Package Manager**: `bun`.
- **API Keys**: Access to OpenRouter (for LLM) and Clerk (for Auth).

### Project Setup
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd firemapsim-v2
   ```
2. **Install dependencies**:
   ```bash
   bun install
   ```
3. **Environment Variables**:
   Create a `.env` file in the root directory and add the following:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
   CLERK_SECRET_KEY=...
   OPENROUTER_API_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
4. **Run the development server**:
   ```bash
   bun dev
   ```
   The application will be available at `http://localhost:3000`.

## 3. Important Implementation Notes

### Structured Output Parsing
The frontend uses a custom regex parser to detect blocks like ```setup-update { ... } ``` within the chat stream. This allows the AI to "type" into the UI programmatically while still conversing with the user in natural language.

### Simulation Units
- **Timesteps**: DEVS-FIRE uses discrete timesteps. The UI converts human hours to timesteps using a standard factor of **500 steps per hour**.
- **Grid Resolution**: The default resolution is typically expressed in meters (e.g., 30m cells), which determines the fidelity of the simulation.

### Data Persistence
Project data is saved to **Supabase** in a two-tier approach:
1. **Metadata**: Project name, center coordinates, and weather parameters are saved in a relational table.
2. **Simulation Results**: Large blobs of simulation data are stored as JSON strings or files, allowing for the "Replay" functionality.

## 4. DEVS-FIRE upstream (GSU)

### Branch parity

As of the latest work, `main` and `feat/agent-devsfire` point at the same commit (`d595a12`). There is no code divergence between those branches for DEVS-FIRE behavior.

### Historical behavior (git)

- **`80d0460`**: Mastra `connectToServer` switched from **`devsFireProxyPost`** (self-HTTP to this app’s `/api/devs-fire`) to **`connectToDevsFire`** / direct **`devsFirePost`** to the research server. The default base URL moved from **`http://firesim.cs.gsu.edu:8084/api`** to **`https://firesim.cs.gsu.edu/api`**. Added **`src/app/api/devs-fire/smoke/route.ts`** as a minimal connectivity probe.
- **`eb2388a`**: Added **`scripts/devsfire-connect.mjs`**, HTML-vs-token checks, and **`normalizeDevsFireBaseUrl`** in **`src/mastra/tools/devsFire/_client.ts`** so legacy GSU URLs (e.g. root host or deprecated `:8084/api`) map to the canonical HTTPS API base.

Canonical base and normalization live in **`src/mastra/tools/devsFire/_client.ts`** (`DEVS_FIRE_CANONICAL_BASE_URL`). Server-side simulation uses **`devsFirePost`** directly; the browser uses **`src/lib/devsFireBrowser.ts`** → **`/api/devs-fire`** → same upstream.

### How to verify connectivity

1. **Direct upstream (no Next.js)** — from the same machine/network as the failing server:

   ```bash
   bun run devsfire:connect
   ```

   Optional explicit base (must include `/api` for the canonical host):

   ```bash
   bun scripts/devsfire-connect.mjs "https://firesim.cs.gsu.edu/api"
   ```

   JSON output for CI/evidence capture:

   ```bash
   bun run devsfire:connect --json
   ```

2. **Through the app** — with `bun dev` running:

   ```bash
   curl -sS -m 200 "http://127.0.0.1:3000/api/devs-fire/smoke"
   ```

   The smoke route calls **`connectToDevsFire()`** and returns JSON (`ok`, `baseUrl`, latency, or classified error). Use a long client timeout (default upstream timeout is large — see **`DEVS_FIRE_REQUEST_TIMEOUT_MS`** / **`DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS`** in **`src/mastra/tools/devsFire/config.ts`**).

3. **Deep diagnostics (protected)** — requires **`DEVS_FIRE_DIAGNOSTICS_KEY`**:

   ```bash
   curl -sS -m 200 \
     -H "Authorization: Bearer $DEVS_FIRE_DIAGNOSTICS_KEY" \
     "http://127.0.0.1:3000/api/devs-fire/diagnostics"
   ```

   This returns connect-attempt telemetry (`method`, `url`, status, timing, content type, redirect location, token/html detection) plus final classification (`success`, `upstream_timeout`, `upstream_unreachable`, `upstream_http_error`, `upstream_html_response`, `invalid_connect_payload`).

### Comparing environments

If **local** probes succeed and **deployed** (e.g. Vercel) fails, suspect **egress IP** or network policy on the host: the browser VPN does not change the server’s outbound IP. If both fail with **HTML** or **non-JSON** bodies, the upstream may be returning a block page, login page, or nginx error — see error strings in **`src/mastra/tools/devsFire/_client.ts`** and **`src/lib/api/simulationErrors.ts`**.
