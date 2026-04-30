# Authentication (Clerk)

User sign-in and session handling use **[Clerk](https://clerk.com/)** for Next.js.

## Middleware

- **`src/proxy.ts`** — `clerkMiddleware` with `createRouteMatcher` lists protected patterns (dashboard, simulations, agent, project APIs, simulation APIs, DEVS-FIRE, weather, and workspace paths). Matching requests call `auth.protect()`.

Project workspace URLs are matched as **two path segments** where the second segment is a UUID ([`src/proxy.ts`](../src/proxy.ts)).

## API routes

Server routes that must be user-specific should call **`auth()`** from `@clerk/nextjs/server` and return `401` when `userId` is missing (for example [`src/app/api/agent/route.ts`](../src/app/api/agent/route.ts)).

## DEVS-FIRE smoke route

`/api/devs-fire/smoke` is protected like other `/api/devs-fire/*` routes. **Unauthenticated `curl` will not behave like an in-app check**; use a signed-in browser session or another authenticated client when validating connectivity.

## Environment variables

See [`.env.example`](../.env.example):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`

## Related docs

- [nextjs.md](./nextjs.md) — middleware matcher and deployment.
- [supabase.md](./supabase.md) — use Clerk `userId` to scope Supabase writes.
