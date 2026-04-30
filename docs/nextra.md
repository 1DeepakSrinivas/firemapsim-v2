# Nextra maintenance (`/docs` site)

The in-app documentation site at **`/docs`** is built with **Nextra**. Content lives under [`content/`](../content/) and is rendered by Next.js via Nextra.

This page covers repo-specific maintenance tasks (structure, navigation, editing, and common gotchas).

## Where content lives

- **Docs content**: [`content/`](../content/)
  - Core pages: `content/*.mdx`
  - Sections: `content/features/`, `content/workflows/`, `content/developer-docs/`
- **Navigation metadata**:
  - Root: [`content/_meta.js`](../content/_meta.js)
  - Section sidebars: `content/**/_meta.js` (for example [`content/features/_meta.js`](../content/features/_meta.js))

## Next + Nextra wiring

- **`next.config.ts`** composes Nextra:
  - `nextra({ contentDirBasePath: "/docs" })`
  - This repository uses [`content/`](../content/) as the doc source folder (served at `/docs`).

- **Docs layout**:
  - [`src/app/docs/layout.tsx`](../src/app/docs/layout.tsx) uses `nextra-theme-docs` `Layout` + `Navbar`
  - Page map: `getPageMap(\"/docs\")`
  - Repository edit base is set to the `content` folder.

## Adding a new docs page

1. Create an `.mdx` file under `content/` (or an appropriate subfolder).
2. Add it to the relevant `_meta.js` so it appears in the sidebar.
3. Run `bun dev` and verify under `/docs`.

## Images and static assets

- Put static images under [`public/`](../public/).
- In MDX, reference them with absolute paths (for example `/images/...`) so they work in dev and production.

## Search (Pagefind)

This repo runs Pagefind after builds:

- Script: `bun run postbuild`
- Output: `public/_pagefind` (ignored by git via `.gitignore`)

If search is missing in production, confirm the build pipeline runs `postbuild`.

## Developer docs inside `/docs`

The in-app “Developer Docs” section (`content/developer-docs/`) is intentionally lightweight and mainly links to repository engineering docs under [`docs/`](../docs/README.md) to avoid duplicated, stale copies.

