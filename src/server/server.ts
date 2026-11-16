/**
 * Server entrypoint — the only place that binds a network port.
 *
 * Bootstraps the Fastify app from `app.ts`, reads validated environment
 * configuration, and installs graceful shutdown handlers.
 */
import { buildServer } from './app';
import { isPlaceholderSiteUrl, loadConfig } from './config';
import { prisma } from './db';
import { cleanupOrphanMedia } from './media/cleanup';
import { createMediaStorage } from './media/storage';
import { startScheduler, type SchedulerHandle } from './scheduler';

const config = loadConfig();
const app = buildServer();

let shuttingDown = false;
let scheduler: SchedulerHandle | null = null;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  scheduler?.stop();
  scheduler = null;
  try {
    await app.close();
  } finally {
    // Release the PostgreSQL connection pool after Fastify stops accepting
    // connections (docs/07 §55).
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { host: config.host, port: config.port, env: config.nodeEnv },
    'uci-api listening',
  );

  if (isPlaceholderSiteUrl(config.siteUrl)) {
    app.log.warn(
      { siteUrl: config.siteUrl },
      'SITE_URL is still the development placeholder — canonical URLs, Open Graph metadata and the sitemap will point at it. Set a real public origin before deploying to production.',
    );
  }

  // Orphan-media cleanup is opt-in via `MEDIA_ORPHAN_CLEANUP_DAYS > 0`. When
  // enabled it runs after each publication sweep with a full cleanup (never a
  // dry run); `0` leaves the scheduler publishing-only (improvement A4).
  const mediaCleanupDays = config.media.orphanCleanupDays;
  const mediaCleanup =
    mediaCleanupDays > 0
      ? {
          olderThanDays: mediaCleanupDays,
          run: async () => {
            const storage = createMediaStorage({
              root: config.media.root,
              publicBase: config.media.publicBase,
            });
            return cleanupOrphanMedia(
              { olderThanDays: mediaCleanupDays },
              { storage },
            );
          },
        }
      : undefined;

  // Scheduled-publication sweep (Phase 12B). Started only here, after the
  // process actually listens, and never in tests: `buildServer` remains
  // timer-free so its inject-based suites cannot publish scheduled rows.
  scheduler = startScheduler({
    intervalMs: config.scheduler.intervalMs,
    enabled: config.nodeEnv !== 'test',
    logger: app.log,
    ...(mediaCleanup ? { mediaCleanup } : {}),
  });
  app.log.info(
    {
      intervalMs: config.scheduler.intervalMs,
      enabled: config.nodeEnv !== 'test',
      timezone: config.timezone,
      mediaOrphanCleanupDays: mediaCleanupDays,
    },
    'Publication scheduler started',
  );
} catch (error) {
  app.log.error(error, 'Failed to start server');
  process.exit(1);
}
