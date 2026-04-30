# Next.js

FireMapSim uses the **Next.js App Router** with TypeScript. This document highlights project-specific setup; for framework APIs that differ from older Next versions, see [`AGENTS.md`](../AGENTS.md) for where to read in-repo Next documentation.

## Configuration

- **`next.config.ts`** — composes Nextra (`contentDirBasePath: "/docs"`) and sets `serverExternalPackages: ["@mastra/*"]` for server bundles.

## Development and production scripts

From [`package.json`](../package.json):

| Script | Purpose |
|--------|---------|
| `bun dev` | Runs [`scripts/dev.mjs`](../scripts/dev.mjs): **Next.js** dev server (`http://localhost:3000`) and **Mastra** dev (`http://localhost:4111`, Studio + API). |
| `bun run dev:next` | Next.js only. |
| `bun run dev:mastra` | Mastra dev only. |
| `bun run build` / `bun run start` | Production build and server. |
| `bun run postbuild` | Runs Pagefind for site search output under `public/_pagefind`. |

## Request boundary: `src/proxy.ts`

Clerk **`clerkMiddleware`** protects routes that touch the workspace, agent, projects, simulation, DEVS-FIRE, and weather APIs. Protected matchers include `/dashboard`, `/simulations`, `/api/agent`, `/api/project`, `/api/projects`, `/api/me`, `/api/simulation`, `/api/devs-fire`, `/api/weather`, plus **two-segment project workspace URLs** (`/{userSlug}/{uuid}`).

Unauthenticated requests to those paths are blocked per Clerk’s `auth.protect()` behavior.

## Documentation site

User and developer MDX under [`content/`](../content/) is served at **`/docs`** via Nextra (see `src/app/docs/`).

## Deployment (Vercel)

- [`vercel.json`](../vercel.json) disables Git-triggered deployments for all branches except **`main`** (`deploymentEnabled`: `main` only).
- Set the Vercel project **Production Branch** to `main` so production deploys align with this policy.

## Related docs

- [mastra.md](./mastra.md) — agent runtime colocated with Next API routes.
- [auth-clerk.md](./auth-clerk.md) — middleware and session behavior.
- [devs-fire.md](./devs-fire.md) — `/api/devs-fire/*` route family.
