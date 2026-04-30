# Testing

## Layout

Canonical tests live in the repository root under **`__tests__/`**, organized to mirror source areas:

- `__tests__/app/` — App Router and API route tests  
- `__tests__/lib/` — shared library tests (including `__tests__/lib/devsfire/`)  
- `__tests__/mastra/` — Mastra tools and related tests  
- `__tests__/types/` — type-level or validator tests where present  

**Do not** add new tests as `src/**/*.test.ts` or `src/**/*.test.tsx`; `bun run test:guard:placement` fails the build if co-located tests appear outside `__tests__/`.

## Commands

```bash
bun run test
```

Runs the placement guard then unit tests (`bun test __tests__`).

## Typecheck

```bash
bun x tsc --noEmit
```

## Example DEVS-FIRE–related test paths

- `__tests__/lib/devsfire/httpClient.test.ts`  
- `__tests__/lib/devsfire/endpoints.test.ts`  
- `__tests__/lib/devsFireBrowser.test.ts`  
- `__tests__/app/api/devs-fire/smoke/route.test.ts`  
- `__tests__/mastra/tools/devsFire/_client.test.ts`  

## Related docs

- [CONTRIBUTING.md](../CONTRIBUTING.md) — contributor expectations.  
- [devs-fire.md](./devs-fire.md) — subsystem under test.
