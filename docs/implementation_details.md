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
- **Package Manager**: `npm` or `bun`.
- **API Keys**: Access to OpenRouter (for LLM) and Clerk (for Auth).

### Project Setup
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd firemapsim-v2
   ```
2. **Install dependencies**:
   ```bash
   npm install
   # or
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
   npm run dev
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
