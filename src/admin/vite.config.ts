/**
 * Vite config for the dedicated admin app (docs/02 §6).
 *
 * Single package.json — no workspace. This config pins `root` to `src/admin`
 * and emits the production build to `dist/admin`. Run from the repo root:
 *
 *   pnpm dev:admin      # vite --config src/admin/vite.config.ts
 *   pnpm build:admin    # vite build --config src/admin/vite.config.ts
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const adminRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: adminRoot,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/admin', import.meta.url)),
    emptyOutDir: true,
  },
});
