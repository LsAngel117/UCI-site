/**
 * Public Pages API (Phase 7B, docs/08 §10.1–10.2, docs/10 §5–6, docs/11 §14).
 *
 * Two unauthenticated, read-only endpoints:
 *
 *   GET /api/v1/pages        published listing with `search` + pagination
 *   GET /api/v1/pages/:slug  published detail with content + cover + SEO
 *
 * No `preHandler` is attached on purpose: public content must be readable
 * without a session. Visibility is enforced inside the service, which only
 * selects `status = published` rows. A 404 for a slug that moved carries
 * `error.details.redirectTo` (redirect foundation consumed by Phase 9).
 */
import type { FastifyInstance } from 'fastify';
import type {
  ListResponse,
  PublicPageDetailDto,
  PublicPageDto,
  PublicPageListQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import type { MediaStorage } from '../../media/storage';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import { getPublicPageBySlug, listPublicPages } from './public-service';

interface SlugParams {
  slug: string;
}

export function registerPublicPageRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const options = { storage, siteUrl: config.siteUrl };

  app.get<{ Querystring: PublicPageListQuery }>(
    '/api/v1/pages',
    async (request, reply) => {
      try {
        const { data, meta } = await listPublicPages(request.query, options);
        reply.send({ data, meta } satisfies ListResponse<PublicPageDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.get<{ Params: SlugParams }>(
    '/api/v1/pages/:slug',
    async (request, reply) => {
      try {
        const page = await getPublicPageBySlug(request.params.slug, options);
        reply.send({ data: page } satisfies { data: PublicPageDetailDto });
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
