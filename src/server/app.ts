/**
 * Fastify application assembly (buildServer vs listen — testable by design).
 *
 * `buildServer` constructs and returns a Fastify instance without binding a
 * port. `server.ts` is the only place that calls `listen`, so integration
 * tests can inject the app directly later (docs/02 §67).
 */
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { ApiErrorEnvelope, HealthResponse } from '@shared/api';
import { loggerOptions } from './logger';
import { prisma } from './db';

export const SERVICE_NAME = 'uci-api';
export const SERVICE_VERSION = '0.0.1';

export interface BuildServerOptions {
  /** Disable the logger (used by tests that want a quiet instance). */
  logger?: boolean;
}

function notFoundEnvelope(method: string, url: string): ApiErrorEnvelope {
  return {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${method} ${url} not found`,
    },
  };
}

function errorEnvelope(statusCode: number): ApiErrorEnvelope {
  const isServerError = statusCode >= 500;
  return {
    error: {
      code: isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: isServerError
        ? 'Internal server error'
        : 'The request could not be processed',
    },
  };
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : loggerOptions,
  });

  // 404 handler — consistent error envelope (docs/02 §38).
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(notFoundEnvelope(request.method, request.url));
  });

  // Global error handler — never leak internals to clients (docs/07 §23).
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send(errorEnvelope(statusCode));
  });

  // Liveness + readiness entry point (docs/14 §30, docs/07 §36). A single
  // endpoint is used: `status` reflects process liveness, `database` reflects
  // the PostgreSQL readiness probe. A DB outage degrades to `degraded` +
  // `database: "unavailable"` instead of failing the liveness check.
  app.get('/api/v1/health', async (): Promise<HealthResponse> => {
    let database: HealthResponse['database'] = 'unavailable';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch (error) {
      // Readiness probe failure — never throw, so liveness stays green.
      app.log.warn({ err: error }, 'Database readiness check failed');
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      database,
    };
  });

  return app;
}
