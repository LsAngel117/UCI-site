/**
 * SEO HTTP routes (Phase 8, docs/10 §8–§9, docs/08 §18).
 *
 * Public, unauthenticated:
 *   GET /sitemap.xml   dynamic XML sitemap of published content
 *   GET /robots.txt    crawl directives + sitemap reference
 *
 * Admin, permission-protected (docs/11 §9):
 *   GET   /api/v1/admin/seo   seo.read
 *   PATCH /api/v1/admin/seo   seo.update
 */
import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from '@shared/api';
import type { SiteSeoDto, UpdateSiteSeoInput } from '@shared/seo';
import { requireAuth, requirePermission } from '../auth/middleware';
import type { ServerConfig } from '../config';
import { recordAudit } from '../cms/audit';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';
import { buildRobotsTxt } from './robots';
import {
  getSiteSeoSettings,
  parseUpdateSiteSeoInput,
  updateSiteSeoSettings,
} from './settings';
import { buildSitemap } from './sitemap';

export function registerPublicSeoRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  app.get('/sitemap.xml', async (_request, reply) => {
    try {
      const xml = await buildSitemap(config.siteUrl);
      reply.type('application/xml; charset=utf-8').send(xml);
    } catch (error) {
      if (isCmsError(error)) {
        reply.code(error.statusCode).send(cmsErrorEnvelope(error));
        return;
      }
      throw error;
    }
  });

  app.get('/robots.txt', async (_request, reply) => {
    reply
      .type('text/plain; charset=utf-8')
      .send(buildRobotsTxt(config.siteUrl));
  });
}

export function registerAdminSeoRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('seo.read');
  const canUpdate = requirePermission('seo.update');

  app.get(
    '/api/v1/admin/seo',
    { preHandler: [auth, canRead] },
    async (_request, reply) => {
      try {
        const data = await getSiteSeoSettings();
        reply.send({ data } satisfies ApiResponse<SiteSeoDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.patch(
    '/api/v1/admin/seo',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      try {
        const input: UpdateSiteSeoInput = parseUpdateSiteSeoInput(
          request.body ?? {},
        );
        const data = await updateSiteSeoSettings(input);
        await recordAudit({
          actorId: request.user!.id,
          action: 'seo.update',
          entityType: 'site',
          // Never persist the payload itself: only which settings changed.
          metadata: { fields: Object.keys(input) },
        });
        reply.send({ data } satisfies ApiResponse<SiteSeoDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );
}
