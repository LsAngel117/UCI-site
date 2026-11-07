/**
 * Fastify application assembly (buildServer vs listen — testable by design).
 *
 * `buildServer` constructs and returns a Fastify instance without binding a
 * port. `server.ts` is the only place that calls `listen`, so integration
 * tests can inject the app directly later (docs/02 §67).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { ApiErrorEnvelope, HealthResponse } from '@shared/api';
import {
  buildSecurityHeaders,
  isMutatingMethod,
  isSameOriginRequest,
  shouldSendHsts,
} from '@shared/security';
import { registerAdminAuditRoutes } from './admin/audit/routes';
import { registerAdminContactRoutes } from './admin/contact/routes';
import { registerAdminRoleRoutes } from './admin/roles/routes';
import { registerAdminUserRoutes } from './admin/users/routes';
import { registerAuthRoutes } from './auth/routes';
import { registerEventCategoryRoutes } from './cms/event-categories/routes';
import { registerEventRoutes } from './cms/events/routes';
import { registerPublicEventRoutes } from './cms/events/public-routes';
import { registerMinistryRoutes } from './cms/ministries/routes';
import { registerPublicMinistryRoutes } from './cms/ministries/public-routes';
import { registerPublicNavigationRoutes } from './cms/navigation/public-routes';
import { registerNavigationRoutes } from './cms/navigation/routes';
import { registerPublicPageRoutes } from './cms/pages/public-routes';
import { registerPageRoutes } from './cms/pages/routes';
import { registerPublicSermonRoutes } from './cms/sermons/public-routes';
import { registerSermonRoutes } from './cms/sermons/routes';
import { registerTaxonomyRoutes } from './cms/taxonomy/routes';
import { registerPublicContactRoutes } from './contact/routes';
import { loadConfig, type ServerConfig } from './config';
import { loggerOptions } from './logger';
import { prisma } from './db';
import { registerMediaRoutes } from './media/routes';
import { createMediaStorage, isAbsoluteUrl } from './media/storage';
import { registerSearchRoutes } from './search/routes';
import {
  registerAdminSeoRoutes,
  registerPublicSeoRoutes,
} from './seo/routes';
import {
  registerAdminSettingsRoutes,
  registerPublicSettingsRoutes,
} from './settings/routes';

export const SERVICE_NAME = 'uci-api';
export const SERVICE_VERSION = '0.0.1';

/**
 * Built admin SPA (`pnpm build:admin` → `dist/admin`). Resolved from this
 * module so it is independent of the process working directory.
 */
const ADMIN_DIST_ROOT = fileURLToPath(
  new URL('../../dist/admin', import.meta.url),
);

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

/** Mutation rejected by the same-origin (CSRF) guard (docs/11 §16). */
function csrfRejectedEnvelope(): ApiErrorEnvelope {
  return {
    error: {
      code: 'CSRF_REJECTED',
      message: 'Cross-origin request rejected.',
    },
  };
}

/**
 * Canonical origins accepted in addition to the request's own host. The public
 * site origin (`SITE_URL`) is allowed so a browser posting directly to the API
 * from the site's origin still passes if the deployment ever splits the two
 * hosts; the normal same-origin proxy path needs no allowance at all.
 */
function allowedRequestOrigins(siteUrl: string): string[] {
  try {
    return [new URL(siteUrl).origin];
  } catch {
    return [];
  }
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
    // The same-origin Astro proxy forwards the real client IP in
    // `X-Forwarded-For`. Trusting only that proxy (loopback by default) keeps
    // `request.ip` — and therefore the per-IP rate limiter — honest without
    // letting direct clients spoof their address.
    trustProxy: config.trustProxy,
  });

  // Cookie transport for the session token (docs/11 §6.2). Registered before
  // routes so `reply.setCookie` / `request.cookies` are available to them.
  app.register(cookie);

  // Rate limiting is opt-in per route (`global: false`), so only the login
  // endpoint is throttled and ordinary reads are unaffected (docs/11 §18).
  app.register(rateLimit, { global: false });

  const allowedOrigins = allowedRequestOrigins(config.siteUrl);

  // CSRF guard for cookie-authenticated mutations (Phase 12A, docs/11 §16).
  // SameSite=Lax already defeats most cross-site writes; this is the second
  // layer: a browser that sends `Origin` must be talking about this very
  // origin. Requests without `Origin` (server-side proxy, non-browser
  // clients) are allowed because CSRF requires a browser to attach the
  // victim's cookie. The panel and the public contact form are same-origin and
  // therefore unaffected.
  app.addHook('onRequest', async (request, reply) => {
    if (!isMutatingMethod(request.method)) return;
    const requestOrigin = `${request.protocol}://${request.host}`;
    if (
      isSameOriginRequest({
        origin: request.headers.origin,
        requestOrigin,
        allowedOrigins,
      })
    ) {
      return;
    }
    request.log.warn(
      { origin: request.headers.origin, requestOrigin },
      'CSRF: cross-origin mutation rejected',
    );
    return reply.code(403).send(csrfRejectedEnvelope());
  });

  // Security headers on every response (Phase 12A, docs/11 §28–§30). HSTS is
  // emitted only over TLS or in production, never on plain-HTTP development.
  app.addHook('onSend', async (request, reply) => {
    const headers = buildSecurityHeaders({
      secure: shouldSendHsts(request.protocol, config.nodeEnv),
    });
    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }
  });

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

  // Admin SPA (feature doc 10A, docs/09 §4). Served same-origin under
  // `/panel` so the HttpOnly session cookie reaches `/api/v1` without CORS.
  // The build is optional at runtime (tests and API-only deployments run
  // without it), so registration is skipped when `dist/admin` is absent.
  if (existsSync(ADMIN_DIST_ROOT)) {
    app.register(async (instance) => {
      await instance.register(fastifyStatic, {
        root: ADMIN_DIST_ROOT,
        prefix: '/panel/',
        // Explicit file routes + index handling, no static wildcard: the
        // wildcard route below is the SPA fallback instead.
        wildcard: false,
        index: ['index.html'],
        redirect: true,
        cacheControl: true,
        maxAge: '365d',
        immutable: true,
        // Hashed assets are immutable; the entry document must always be
        // revalidated so a deploy is picked up on the next navigation.
        setHeaders(reply, filePath) {
          if (filePath.endsWith('index.html')) {
            reply.header('Cache-Control', 'no-cache');
          }
        },
      });

      // Client-side routes (e.g. `/panel/contenido/sermones`) resolve to the
      // SPA shell and are handled by React Router. Missing asset files keep a
      // real 404 so a broken deploy is visible instead of returning HTML.
      instance.get('/panel/*', (request, reply) => {
        const pathname = (request.raw.url ?? '').split('?')[0] ?? '';
        if (/\.[a-z0-9]+$/i.test(pathname)) {
          return reply.callNotFound();
        }
        return reply.sendFile('index.html');
      });
    });
  } else {
    app.log.warn(
      { root: ADMIN_DIST_ROOT },
      'Admin panel build not found — /panel is not served. Run `pnpm build:admin`.',
    );
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

  // Public pages & navigation API (Phase 7B). Same visibility rule as the other
  // public collections: only `status = published` pages and `visible`
  // navigation items are returned, enforced inside each service. No
  // authentication is required. A published slug change surfaces
  // `details.redirectTo` on the old slug's 404 (redirect foundation).
  app.register(async (instance) => {
    registerPublicPageRoutes(instance, config, mediaStorage);
  });

  app.register(async (instance) => {
    registerPublicNavigationRoutes(instance, config);
  });

  // Public settings API (Phase 9A1, docs/08 §17.1). One unauthenticated,
  // read-only endpoint returning the normalized church profile, schedule,
  // social links and giving copy. No internal values are exposed.
  app.register(async (instance) => {
    registerPublicSettingsRoutes(instance, config);
  });

  // Public contact form (Phase 9B2, docs/08 §19, §40). Unauthenticated write,
  // rate limited per IP, validated server-side and persisted as a
  // ContactSubmission row. Delivery/notification stays a Phase 11 concern.
  app.register(async (instance) => {
    registerPublicContactRoutes(instance, config);
  });

  // SEO & discovery (Phase 8, docs/10 §8–§9, §20). Public sitemap/robots and
  // unauthenticated search; visibility and indexability are enforced in the
  // services. The admin SEO settings endpoints attach `seo.*` permissions.
  app.register(async (instance) => {
    registerPublicSeoRoutes(instance, config);
  });

  app.register(async (instance) => {
    registerSearchRoutes(instance);
  });

  app.register(async (instance) => {
    registerAdminSeoRoutes(instance, config);
  });

  // Admin settings API (Phase 9A1, docs/08 §17.2). Protected by
  // `settings.read` / `settings.update`; PATCH is strictly validated and
  // audited as `settings.update`.
  app.register(async (instance) => {
    registerAdminSettingsRoutes(instance, config);
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

  // Admin Pages & Navigation API (Phase 7A). Each route is protected by
  // `requireAuth` + the matching `pages.*` / `navigation.*` permission.
  app.register(async (instance) => {
    registerPageRoutes(instance, config);
  });

  app.register(async (instance) => {
    registerNavigationRoutes(instance, config);
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

  // Administration API (Phase 10D1, docs/08 §8–§9, §21). Users CRUD, the role
  // permission matrix, the canonical permission vocabulary and the read-only
  // audit trail. Every route is protected by `requireAuth` + the exact
  // `users.*` / `roles.*` / `audit.read` permission inside its module.
  app.register(async (instance) => {
    registerAdminUserRoutes(instance, config);
  });

  app.register(async (instance) => {
    registerAdminRoleRoutes(instance, config);
  });

  app.register(async (instance) => {
    registerAdminAuditRoutes(instance, config);
  });

  // Admin contact inbox (Phase 11A, docs/08 §19, docs/11 §9). Protected by
  // `contact.read` for visibility and `contact.manage` for state transitions.
  // The public contact endpoint remains write-only and never returns rows.
  app.register(async (instance) => {
    registerAdminContactRoutes(instance, config);
  });

  return app;
}
