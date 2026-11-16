/**
 * Public Sermons API (Phase 5B, docs/08 §11.1–11.2, docs/11 §14).
 *
 * Two unauthenticated, read-only endpoints:
 *
 *   GET /api/v1/sermons        published archive with filters + pagination
 *   GET /api/v1/sermons/:slug  published detail with SEO + related sermons
 *
 * No `preHandler` is attached on purpose: public content must be readable
 * without a session. Visibility is enforced inside the service, which only
 * selects `status = published` rows.
 */
import type { FastifyInstance } from 'fastify';
import type {
  ListResponse,
  PublicSermonDetailDto,
  PublicSermonDto,
  PublicSermonListQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import type { MediaStorage } from '../../media/storage';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import { getPublicSermonBySlug, listPublicSermons } from './public-service';

interface SlugParams {
  slug: string;
}

export function registerPublicSermonRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const options = { storage, siteUrl: config.siteUrl };

  app.get<{ Querystring: PublicSermonListQuery }>(
    '/api/v1/sermons',
    async (request, reply) => {
      try {
        const { data, meta } = await listPublicSermons(request.query, options);
        reply.send({ data, meta } satisfies ListResponse<PublicSermonDto>);
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
    '/api/v1/sermons/:slug',
    async (request, reply) => {
      try {
        const sermon = await getPublicSermonBySlug(request.params.slug, options);
        reply.send({ data: sermon } satisfies { data: PublicSermonDetailDto });
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