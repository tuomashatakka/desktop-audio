# AGENTS — Repository Quick‑Start

## Core commands (must‑run in repo root)
- `npm run start`    → launch Electron (uses `electron‑forge start`)
- `npm run lint`    → run ESLint on `src/`
- `npm run typecheck` → run `tsc --noEmit`
- `npm run test`    → run Vitest unit tests
- `npm run test:e2e` → run Playwright end‑to‑end tests
- `npm run rebuild`  → re‑build native modules (`better‑sqlite3`)
- `npm run package`  → bundle app for current platform (uses Vite + Forge)
- `npm run make`    → create distributable installers (deb, rpm, zip, …)

## Build nuances
- Main‑process bundling (`vite.main.config.ts`) marks `better‑sqlite3` and `mpris‑service` as **external** – they are loaded from the built app, not bundled.
- Renderer, preload and worker Vite configs live alongside but are invoked automatically by Forge; no manual steps needed.

## Testing quirks
- Vitest reads TypeScript source directly – ensure `npm run rebuild` has been run if native modules are imported in tests.
- Playwright tests require a graphical environment; CI should run with `xvfb‑run` or similar headless setup.

## Repo layout shortcuts (high‑signal)
- `public/` → static assets (`index.html`, `main.css`, images, manifests). The UI entry point is `public/index.html`.
- `src/`  → application source (React UI, Electron main, preload, workers).
- `docs/plans/` → OpenCode planning files referenced by `.claude/settings.json`.

## Agent tooling rules (avoid mistakes)
- **Never** run raw `curl`/`wget`/`fetch` – blocked. Use `webfetch` or `context‑mode` helpers.
- For any shell output > 20 lines (e.g. `git status`), use `context‑mode_ctx_batch_execute` or `context‑mode_ctx_execute` to keep context small.
- Use `context‑mode_ctx_search` before asking the user for prior decisions or constraints.
- Editing files requires a prior `read` – always read before `edit`.

## Context‑mode defaults (must stay enabled)
- All MCP tools are available; respect the routing rules listed in the original AGENTS file.
- Session memory is auto‑enabled – query it with `ctx stats` or `ctx doctor` when needed.

## Things *not* needed in this repo
- No monorepo or multiple packages – single Electron app.
- No custom environment variables beyond Node/Electron defaults.
- No special code‑generation steps.

*End of concise instructions*