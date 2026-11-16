/**
 * Vite config for the dedicated admin app (docs/02 §6, docs/09 §3).
 *
 * Single package.json — no workspace. This config pins `root` to `src/admin`
 * and emits the production build to `dist/admin`. Run from the repo root:
 *
 *   pnpm dev:admin      # vite --config src/admin/vite.config.ts
 *   pnpm build:admin    # vite build --config src/admin/vite.config.ts
 *
 * `base: '/panel/'` makes the build servable under `https://<origin>/panel`
 * (same origin as the API, so the HttpOnly session cookie flows without CORS).
 * In development `/api` is proxied to the Fastify server, which keeps the
 * browser's same-origin view identical to production.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const adminRoot = fileURLToPath(new URL('.', import.meta.url));
const apiTarget = 'http://127.0.0.1:8787';

// Isolate Vite's dependency pre-bundle cache from Astro's dev server. Both
// would otherwise resolve to `node_modules/.vite`; when Astro re-optimizes its
// own deps it invalidates the admin's optimizer hash, producing the browser
// error "504 Outdated Optimize Dep" and a blank panel. A dedicated cacheDir
// keeps the two optimizer sessions independent.
const adminCacheDir = fileURLToPath(
  new URL('../../node_modules/.vite-admin', import.meta.url),
);

export default defineConfig({
  root: adminRoot,
  base: '/panel/',
  cacheDir: adminCacheDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/admin', import.meta.url)),
    emptyOutDir: true,
  },
});
