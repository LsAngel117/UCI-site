/**
 * Playwright configuration — Lote C (browser E2E).
 *
 * The suite talks to two origins:
 *   - API_BASE_URL: the Fastify API, which also serves the built admin panel
 *     under `/panel/` (session cookie + `/api/v1` are same-origin there);
 *   - PUBLIC_BASE_URL: the Astro SSR site, which fetches the API per request.
 *
 * By default Playwright starts both with `webServer`. Set
 * `E2E_NO_WEBSERVER=1` to reuse an already-running stack instead.
 *
 * Prerequisites (see e2e/README.md):
 *   - PostgreSQL reachable through DATABASE_URL;
 *   - `pnpm build:admin` (the API serves `dist/admin`, not a Vite dev server);
 *   - Chromium installed with `pnpm exec playwright install chromium`.
 */
import { defineConfig, devices } from '@playwright/test';
import {
  API_BASE_URL,
  PUBLIC_BASE_URL,
  TEST_TIMEOUT_MS,
  USE_WEBSERVER,
} from './e2e/support/env';

function parseOrigin(origin: string): { host: string; port: string } {
  const url = new URL(origin);
  return {
    host: url.hostname,
    port: url.port || (url.protocol === 'https:' ? '443' : '80'),
  };
}

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

const api = parseOrigin(API_BASE_URL);
const publicSite = parseOrigin(PUBLIC_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  // The suite mutates shared seed data, so it runs one worker at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    // The first Astro dev request compiles on demand; give navigation room.
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'public-site',
      testMatch: /public\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: PUBLIC_BASE_URL,
      },
    },
    {
      name: 'panel',
      testMatch: /panel\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: API_BASE_URL,
      },
    },
  ],
  webServer: USE_WEBSERVER
    ? [
        {
          name: 'api',
          command: 'pnpm exec tsx src/server/server.ts',
          url: `${stripTrailingSlash(API_BASE_URL)}/api/v1/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            HOST: api.host,
            PORT: api.port,
          },
        },
        {
          name: 'web',
          command: `pnpm exec astro dev --host ${publicSite.host} --port ${publicSite.port}`,
          url: stripTrailingSlash(PUBLIC_BASE_URL),
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            // The SSR site must read the same API the suite exercises.
            API_BASE_URL: stripTrailingSlash(API_BASE_URL),
          },
        },
      ]
    : undefined,
});
