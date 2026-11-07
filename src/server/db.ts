/**
 * PrismaClient singleton (docs/07 §55, §59).
 *
 * This module is the ONLY place that constructs a `PrismaClient`. It lives in
 * `src/server`, never in `@shared`, so frontend bundles (web/admin) can never
 * pull the ORM into the browser (docs/07 §59: "Connect Astro/React directly to
 * PostgreSQL" is prohibited).
 *
 * The singleton is stashed on `globalThis` so Fastify/tsx hot-reload does not
 * create one connection pool per reload (a known leak in dev). Production
 * reuses a single instance for the process lifetime.
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from './env';

// PrismaClient reads `env("DATABASE_URL")` at construction time, so the `.env`
// file must be loaded before the singleton is created — regardless of import
// order (this module is imported by `app.ts` before `config.ts` runs).
loadEnvFile();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
