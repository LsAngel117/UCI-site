// @ts-check
import { fileURLToPath } from 'node:url';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

// SITE_URL is REQUIRED in every real deploy. It is the public origin consumed
// by canonical tags, Open Graph, the sitemap and JSON-LD (docs/14 §61).
// The fallback below is a non-production placeholder ONLY so that local
// builds do not crash. When it is used, the site publishes `uci.example.org`
// canonical/sitemap URLs, which must never reach production.
// Set it before deploying, e.g.: SITE_URL=https://uci.org pnpm astro build
export const SITE_URL_PLACEHOLDER = 'https://uci.example.org';
const SITE = process.env.SITE_URL ?? SITE_URL_PLACEHOLDER;

// Emit an honest, non-fatal warning at config load (build/dev) when the
// placeholder origin is in use, so a misconfigured deploy is visible in logs.
if (SITE === SITE_URL_PLACEHOLDER) {
  console.warn(
    '[uci] SITE_URL is not set — falling back to the placeholder origin ' +
      `"${SITE_URL_PLACEHOLDER}". Canonical, Open Graph, sitemap and JSON-LD ` +
      'URLs are NOT production-safe. Set SITE_URL before deploying.',
  );
}

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // SSR (docs/15 §15, Phase 9A). The public website renders on demand against
  // the HTTP API on every request so CMS content is always fresh and no rebuild
  // is needed after an editorial change. Astro never talks to Postgres
  // (docs/07 §59); `src/web/lib/api.ts` is the only outbound boundary.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Monorepo single-package layout: the public website lives under
  // `src/web` (docs/02 §9). `public/` stays at the repo root.
  srcDir: './src/web',
  // The sitemap is served by the dynamic `/sitemap.xml` route, which proxies
  // the API's Phase 8 sitemap (published detail URLs + canonical overrides).
  // `@astrojs/sitemap` was removed: it generated a build-time static sitemap
  // that omitted detail routes and used an inconsistent trailing slash, so
  // keeping both would publish conflicting sitemaps. The package may remain in
  // package.json but is intentionally not wired here.
  integrations: [],
  vite: {
    resolve: {
      // Runtime aliases mirroring tsconfig `paths`, so shared/domain code is
      // consumable by the web at bundle time (not just for typechecking).
      alias: {
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@web': fileURLToPath(new URL('./src/web', import.meta.url)),
        '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
        '@admin': fileURLToPath(new URL('./src/admin', import.meta.url)),
      },
    },
  },
});