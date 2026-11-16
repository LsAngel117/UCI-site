/**
 * Shared E2E configuration (Lote C — browser tests).
 *
 * Loads the repository `.env` once when `DATABASE_URL` is not already in the
 * environment, so `npx playwright test` works on a developer machine without
 * exporting every variable by hand. Shell-provided values always win: Node's
 * `process.loadEnvFile()` never overwrites an existing variable.
 *
 * All overrides are optional and local-only:
 *   - E2E_API_BASE_URL     API + panel origin (default http://127.0.0.1:8787)
 *   - E2E_PUBLIC_BASE_URL  Astro site origin (default http://127.0.0.1:4321)
 *   - E2E_ADMIN_EMAIL      test admin created by the global setup
 *   - E2E_ADMIN_PASSWORD   test admin password
 *   - E2E_NO_WEBSERVER=1   assume the API + Astro stack is already running
 *
 * The default credential is a locally-created, disposable test account: the
 * global setup creates it and the global teardown deletes it. It is never a
 * production secret and the suite refuses to run with NODE_ENV=production.
 */
import { existsSync } from 'node:fs';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // `.env` is optional; a broken file surfaces later as a clear DB error.
  }
}

function origin(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  return value.replace(/\/+$/, '');
}

/** API server origin: also serves the built admin panel under `/panel`. */
export const API_BASE_URL = origin('E2E_API_BASE_URL', 'http://127.0.0.1:8787');

/** Public Astro SSR site origin. */
export const PUBLIC_BASE_URL = origin('E2E_PUBLIC_BASE_URL', 'http://127.0.0.1:4321');

/** Disposable admin created by the global setup and removed by the teardown. */
export const E2E_ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL?.trim() || 'playwright-admin@uci.local';
export const E2E_ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || 'Playwright-E2E-Passw0rd!';

/** Every sermon created by the suite starts with this slug prefix. */
export const E2E_SERMON_SLUG_PREFIX = 'e2e-playwright-';

/** Whether Playwright should start the API and the Astro dev server itself. */
export const USE_WEBSERVER = process.env.E2E_NO_WEBSERVER !== '1';

/** DOM/wait budget for a single test. */
export const TEST_TIMEOUT_MS = 90_000;

/** A unique, URL-safe suffix for data created during a run. */
export function runId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
