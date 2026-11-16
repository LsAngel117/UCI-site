/**
 * Public Events API (Phase 6B, docs/08 §12.1–12.2, docs/11 §14).
 *
 * Two unauthenticated, read-only endpoints:
 *
 *   GET /api/v1/events        published agenda with filters + pagination
 *   GET /api/v1/events/:slug  published detail with SEO + category + cover
 *
 * No `preHandler` is attached on purpose: public content must be readable
 * without a session. Visibility is enforced inside the service, which only
 * selects `status = published` rows.
 */
import type { FastifyInstance } from 'fastify';
import type {
  ListResponse,
  PublicEventDto,
  PublicEventListQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import type { MediaStorage } from '../../media/storage';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import { getPublicEventBySlug, listPublicEvents } from './public-service';

interface SlugParams {
  slug: string;
}

export function registerPublicEventRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const options = { storage, siteUrl: config.siteUrl };

  app.get<{ Querystring: PublicEventListQuery }>(
    '/api/v1/events',
    async (request, reply) => {
      try {
        const { data, meta } = await listPublicEvents(request.query, options);
        reply.send({ data, meta } satisfies ListResponse<PublicEventDto>);
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
    '/api/v1/events/:slug',
    async (request, reply) => {
      try {
        const event = await getPublicEventBySlug(request.params.slug, options);
        reply.send({ data: event } satisfies { data: PublicEventDto });
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
