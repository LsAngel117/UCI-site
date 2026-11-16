# Browser E2E (Playwright) — Lote C

Browser-level tests for the public Astro site and the admin panel, running
against the real stack: Fastify API + PostgreSQL + SSR Astro + the built React
panel.

## Prerequisites

1. **PostgreSQL** reachable through `DATABASE_URL` (locally the Docker database
   on port 5435). `playwright.config.ts` reads `.env` when the variable is not
   already exported.
2. **Admin panel build** — the API serves `/panel` from `dist/admin`, not from a
   Vite dev server. Run it once (and after panel changes):
   ```bash
   pnpm build:admin
   ```
3. **Chromium** for Playwright:
   ```bash
   pnpm exec playwright install chromium
   ```
   This downloads ~330 MB into `~/.cache/ms-playwright`. If the machine is
   offline, run the command on a connected machine and copy the cache, or set
   `PLAYWRIGHT_BROWSERS_PATH` to a shared directory. Without a browser,
   `pnpm exec playwright test --list` still works (config + test discovery),
   but the tests themselves cannot run.

## Run

```bash
# Starts the API (8787) and Astro dev (4321) automatically, runs every test.
pnpm test:e2e

# Run one project or file.
pnpm exec playwright test --project=public-site
pnpm exec playwright test e2e/panel/editorial.spec.ts

# List tests without launching a browser.
pnpm exec playwright test --list
```

`webServer` starts:

- `pnpm exec tsx src/server/server.ts` → `http://127.0.0.1:8787`
  (`/api/v1/health` readiness; also serves the built panel);
- `pnpm exec astro dev --host 127.0.0.1 --port 4321` → the public site.

An already-running server on either origin is reused locally
(`reuseExistingServer`) unless `CI=1`. To manage the stack yourself:

```bash
pnpm dev:all            # api + web + vite panel
E2E_NO_WEBSERVER=1 pnpm exec playwright test
```

The panel is still served by the API, so `pnpm build:admin` remains required
even in that mode.

## Test data

The suite never reads or writes production data:

- `global-setup.ts` creates/reuses a disposable account
  `playwright-admin@uci.local` with the ADMIN role and every permission.
- The editorial test creates sermons whose slug starts with
  `e2e-playwright-`, publishes one and archives it.
- `global-teardown.ts` hard-deletes those sermons (SEO rows and audit rows
  included) and the test admin, its sessions and role grants.

The suite refuses to run with `NODE_ENV=production`.

Overrides (export in the shell, never commit):

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_API_BASE_URL` | `http://127.0.0.1:8787` | API + panel origin |
| `E2E_PUBLIC_BASE_URL` | `http://127.0.0.1:4321` | Astro site origin |
| `E2E_ADMIN_EMAIL` | `playwright-admin@uci.local` | test admin |
| `E2E_ADMIN_PASSWORD` | local disposable value | test admin password |
| `E2E_NO_WEBSERVER` | unset | `1` reuses a running stack |

## Coverage

- public: homepage title/hero/nav, `/sermones` archive shell + filters,
  `/contacto` accessible form, structural accessibility invariants
  (`lang`, one `h1`, `main`, image `alt`, link names);
- panel: login form, real sign-in to the dashboard, sign-out;
- editorial: login → create draft (not public) → publish → public detail and
  archive entry → archive (public 404).

## Typechecking

The Playwright specs need Node and DOM libs plus `@playwright/test` types, so
they live in their own `tsconfig.e2e.json` instead of the Astro/server/admin
projects. `pnpm typecheck` runs `pnpm check:e2e` as its last step; run
`pnpm check:e2e` alone while iterating.

Artifacts (`test-results/`, `playwright-report/`) are git-ignored.
