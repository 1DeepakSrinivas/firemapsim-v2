# Supabase

Supabase provides **PostgreSQL** and the **Supabase JS client** used from **server-only** code to persist projects, simulation metadata, and agent chat transcripts. **End-user authentication is Clerk**, not Supabase Auth (see [auth-clerk.md](./auth-clerk.md)).

## Server client

- **`src/lib/supabase.ts`** — `import "server-only"`; creates a single `SupabaseClient` with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

The service role key must **never** be exposed to the browser. API routes and server modules should scope queries by the authenticated Clerk user id from `auth()`.

## Schema and migrations

- SQL migrations live under **`supabase/migrations/`** in this repository (when present). Apply them according to your Supabase workflow (CLI or dashboard).

## Persistence concepts

- **Projects** — loaded and updated through `/api/project/*` handlers; include plan fields, simulation snapshots, etc.
- **Agent chat** — messages may be stored in dedicated chat tables when available, with a compatibility path writing JSON on the project row if columns are missing (see [`src/lib/projectChatStore.ts`](../src/lib/projectChatStore.ts) and project PUT handler).

## Environment variables

See [`.env.example`](../.env.example):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (where used for client-safe operations)
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` — Postgres URL (often Supabase pooler) for Mastra or other server components that need SQL access

## Related docs

- [mastra.md](./mastra.md) — `DATABASE_URL` for Mastra storage.
- [auth-clerk.md](./auth-clerk.md) — always scope data by Clerk `userId`.
