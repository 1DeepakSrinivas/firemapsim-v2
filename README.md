# FireMapSim (firesimmap-v2)

AI-assisted wildfire simulation workspace: **Next.js** map UI, **Mastra** setup agent with tools, **Supabase** persistence, **Clerk** authentication, **Open-Meteo** weather, and **DEVS-FIRE** via secure server-side HTTP.

## Quick start

**Prerequisites:** [Bun](https://bun.sh/) (see `packageManager` in `package.json`), Git.

```bash
bun install
cp .env.example .env
# Fill in keys in .env (Clerk, Supabase, OpenRouter, DEVS-FIRE, etc.)
bun dev
```

- **App:** [http://localhost:3000](http://localhost:3000)  
- **Mastra dev / Studio:** [http://localhost:4111](http://localhost:4111) (`bun dev` runs Next + Mastra together via `scripts/dev.mjs`)

Split dev processes: `bun run dev:next` and `bun run dev:mastra`.

## Environment

[`/.env.example`](.env.example) is the source of truth for variable names and short comments. Supabase, Clerk, OpenRouter, `DATABASE_URL` (when needed for Mastra), and DEVS-FIRE keys are documented there.

## Documentation

| Audience | Where |
|----------|--------|
| **Engineering (by subsystem)** | [`docs/README.md`](docs/README.md) — Next.js, Mastra, Supabase, Clerk, maps, weather, DEVS-FIRE, testing, Nextra |
| **End users (in-app)** | `/docs` — Nextra content in [`content/`](content/) |
| **Contributing** | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| **License** | [`LICENSE`](LICENSE) (MIT) |
| **AI assistants / Next quirks** | [`AGENTS.md`](AGENTS.md) |

## Testing

```bash
bun run test
```

Tests must live under `__tests__/` (see [`docs/testing.md`](docs/testing.md)).

## DEVS-FIRE connectivity

Use `bun run devsfire:connect` for a direct upstream probe. In-app smoke checks require a **signed-in** session because `/api/devs-fire/*` is Clerk-protected. Details: [`docs/devs-fire.md`](docs/devs-fire.md).

## Build

```bash
bun run build
bun run start
```

## Deployment (Vercel)

This repo configures Git-triggered deployments **only from `main`** ([`vercel.json`](vercel.json)). Set the Vercel project **Production Branch** to `main` under Project → Environments → Production.

---

Licensed under MIT; see [`LICENSE`](LICENSE).
