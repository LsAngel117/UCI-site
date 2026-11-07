#!/usr/bin/env node
/**
 * Production build for the Fastify API (Phase 13).
 *
 * The development server runs through `tsx`; production must run plain Node
 * against a compiled bundle (`node dist-server/server.js`). This script uses
 * esbuild to:
 *
 * - bundle every relative/aliased module (`@shared/*`, `@server/*`),
 * - leave third-party packages external (`--packages=external`) so native
 *   modules (`sharp`, `@node-rs/argon2`) and Prisma's generated client are
 *   resolved from the production `node_modules` at runtime,
 * - emit ESM targeting the Node version from package.json engines.
 *
 * Path aliases come from `tsconfig.server.json`, which extends the root
 * tsconfig where `@shared`/`@server` are declared. Keeping the aliases in one
 * place avoids duplicating them here.
 */
import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

const OUT_DIR = 'dist-server';

// Astro clears `dist/` on every build; `dist-server/` is emitted separately so
// either build order stays safe. Remove stale output first for clean deploys.
await rm(OUT_DIR, { recursive: true, force: true });

await build({
  entryPoints: ['src/server/server.ts'],
  outfile: `${OUT_DIR}/server.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Every bare import stays external: third-party code is installed (prod
  // dependencies only) in the runtime image. Bundling Fastify/Prisma/native
  // addons instead would break dynamic requires and platform binaries.
  packages: 'external',
  tsconfig: 'tsconfig.server.json',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
});

console.log(`[build:server] wrote ${OUT_DIR}/server.js`);
