/**
 * Fastify application assembly (buildServer vs listen — testable by design).
 *
 * `buildServer` constructs and returns a Fastify instance without binding a
 * port. `server.ts` is the only place that calls `listen`, so integration
 * tests can inject the app directly later (docs/02 §67).
 */
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { ApiErrorEnvelope, HealthResponse } from '@shared/api';
import { registerAuthRoutes } from './auth/routes';
import { registerEventCategoryRoutes } from './cms/event-categories/routes';
import { registerEventRoutes } from './cms/events/routes';
import { registerPublicEventRoutes } from './cms/events/public-routes';
import { registerMinistryRoutes } from './cms/ministries/routes';
import { registerPublicMinistryRoutes } from './cms/ministries/public-routes';
import { registerPublicSermonRoutes } from './cms/sermons/public-routes';
import { registerSermonRoutes } from './cms/sermons/routes';
import { registerTaxonomyRoutes } from './cms/taxonomy/routes';
import { loadConfig, type ServerConfig } from './config';
import { loggerOptions } from './logger';
import { prisma } from './db';
import { registerMediaRoutes } from './media/routes';
import { createMediaStorage, isAbsoluteUrl } from './media/storage';

export const SERVICE_NAME = 'uci-api';
export const SERVICE_VERSION = '0.0.1';

export interface BuildServerOptions {
  /** Disable the logger (used by tests that want a quiet instance). */
  logger?: boolean;
  /** Pre-loaded configuration. Defaults to `loadConfig()` from the env. */
  config?: ServerConfig;
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
  // Rate-limit and other 4xx responses raised by plugins keep their status but
  // get a stable, actionable code (docs/08 §31, docs/11 §18).
  if (statusCode === 429) {
    return {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    };
  }
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
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger === false ? false : loggerOptions,
  });

  // Cookie transport for the session token (docs/11 §6.2). Registered before
  // routes so `reply.setCookie` / `request.cookies` are available to them.
  app.register(cookie);

  // Rate limiting is opt-in per route (`global: false`), so only the login
  // endpoint is throttled and ordinary reads are unaffected (docs/11 §18).
  app.register(rateLimit, { global: false });

  // Media storage is created once per app. The filesystem provider ensures its
  // root exists before `@fastify/static` is registered below (docs/12 §7).
  const mediaStorage = createMediaStorage({
    root: config.media.root,
    publicBase: config.media.publicBase,
  });

  // Public media delivery (docs/12 §12, docs/15 §10.4). In production a reverse
  // proxy/CDN may serve the same directory; an absolute MEDIA_PUBLIC_BASE
  // disables this local mount and lets the storage adapter emit CDN URLs.
  if (!isAbsoluteUrl(config.media.publicBase)) {
    app.register(fastifyStatic, {
      root: config.media.root,
      prefix: `${config.media.publicBase}/`,
      index: false,
      dotfiles: 'deny',
      decorateReply: false,
      cacheControl: true,
      // Storage keys are content-addressed by random UUID, so derivatives are
      // immutable and safe to cache aggressively (docs/12 §45–46).
      maxAge: '365d',
      immutable: true,
    });
  }

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

  // Authentication API (docs/08 §7). Registered as a plugin so its routes are
  // added *after* the cookie and rate-limit plugins have loaded — the latter
  // installs its limiter through an `onRoute` hook, which must exist before the
  // login route (with its per-route limit) is defined. Authorization middleware
  // is exported from `auth/middleware.ts` for protected routes in later phases.
  app.register(async (instance) => {
    registerAuthRoutes(instance, config);
  });

  // Admin content API (Phase 3). Registered as a plugin for the same reason as
  // auth: its routes must be added after the cookie + rate-limit plugins load.
  // Every route is protected by `requireAuth` + `requirePermission` inside.
  app.register(async (instance) => {
    registerSermonRoutes(instance, config);
  });

  // Public sermons API (Phase 5B). No authentication, no editorial actions:
  // only published content is visible, enforced inside the service.
  app.register(async (instance) => {
    registerPublicSermonRoutes(instance, config, mediaStorage);
  });

  // Public events & ministries API (Phase 6B). Same visibility rule as the
  // public sermon archive: only `status = published` rows are ever selected,
  // enforced inside each service. No authentication is required.
  app.register(async (instance) => {
    registerPublicEventRoutes(instance, config, mediaStorage);
  });

  app.register(async (instance) => {
    registerPublicMinistryRoutes(instance, config, mediaStorage);
  });

  // Admin sermon taxonomy API (Phase 5A): people / series / topics pickers.
  // Protected by the `sermons.*` permissions (docs/11 §9 has no separate
  // vocabulary for this taxonomy; see `cms/taxonomy/service.ts`).
  app.register(async (instance) => {
    registerTaxonomyRoutes(instance, config);
  });

  // Admin Events & Ministries API (Phase 6A). Each route is protected by
  // `requireAuth` + the matching `events.*` / `ministries.*` permission.
  app.register(async (instance) => {
    registerEventRoutes(instance, config);
  });

  app.register(async (instance) => {
    registerMinistryRoutes(instance, config);
  });

  // Event-category taxonomy (Phase 6A). No `event-categories.*` vocabulary in
  // docs/11 §9, so it reuses `events.read/create/update` (documented in
  // `cms/event-categories/service.ts`).
  app.register(async (instance) => {
    registerEventCategoryRoutes(instance, config);
  });

  // Admin media API (Phase 4). Multipart is registered in the same plugin
  // before the routes so `request.parts()` and its limits are available. Every
  // route is protected by `requireAuth` + `requirePermission` inside.
  app.register(async (instance) => {
    await instance.register(multipart, {
      limits: {
        fileSize: config.media.maxUploadBytes,
        files: 1,
        fields: 20,
        fieldSize: 1024 * 1024,
        parts: 25,
      },
    });
    registerMediaRoutes(instance, config, mediaStorage);
  });

  return app;
}
