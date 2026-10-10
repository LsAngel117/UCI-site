/**
 * Server entrypoint — the only place that binds a network port.
 *
 * Bootstraps the Fastify app from `app.ts`, reads validated environment
 * configuration, and installs graceful shutdown handlers.
 */
import { buildServer } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = buildServer();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  try {
    await app.close();
  } finally {
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
} catch (error) {
  app.log.error(error, 'Failed to start server');
  process.exit(1);
}
