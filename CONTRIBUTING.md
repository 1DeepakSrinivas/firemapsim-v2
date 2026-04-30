# Contributing

Thank you for helping improve this project.

## Tooling

- Use **[Bun](https://bun.sh/)** for installs and scripts (`bun install`, `bun run …`). Do not use npm or yarn for this repository.

## Documentation

Engineering documentation is split by **functional area** under [`docs/`](docs/README.md). When you change a subsystem, update the matching doc (for example DEVS-FIRE client or routes → [`docs/devs-fire.md`](docs/devs-fire.md)).

End-user guides live in [`content/`](content/) and are served in the app at `/docs` (Nextra).

## Tests

- **Canonical location:** root [`__tests__/`](__tests__/) tree, mirroring source layout (`__tests__/app`, `__tests__/lib`, `__tests__/mastra`, etc.).
- **Do not** add new co-located tests under `src/**/*.test.ts(x)`; placement is enforced by `bun run test:guard:placement`.
- Before opening a PR, run:

  ```bash
  bun run test
  ```

- When touching types broadly, run:

  ```bash
  bun x tsc --noEmit
  ```

## Pull requests

- Keep changes focused and review-sized.
- Describe what changed and why in plain language.

## Next.js APIs

This repo tracks a recent Next.js major version with breaking differences from older docs. See [`AGENTS.md`](AGENTS.md) for where to read in-repo Next documentation when unsure about APIs.
