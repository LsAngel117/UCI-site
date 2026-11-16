/**
 * Public Stories API (improvement A2, docs/05 §14, docs/10 §5–6).
 *
 * Two unauthenticated, read-only endpoints:
 *
 *   GET /api/v1/stories        published + editorially approved listing
 *   GET /api/v1/stories/:slug  published + approved detail (uniform 404)
 */
import type { FastifyInstance } from 'fastify';
import type {
  ListResponse,
  PublicStoryDetailDto,
  PublicStoryDto,
  PublicStoryListQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import type { MediaStorage } from '../../media/storage';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import { getPublicStoryBySlug, listPublicStories } from './public-service';

interface SlugParams {
  slug: string;
}

export function registerPublicStoryRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const options = { storage, siteUrl: config.siteUrl };

  app.get<{ Querystring: PublicStoryListQuery }>(
    '/api/v1/stories',
    async (request, reply) => {
      try {
        const { data, meta } = await listPublicStories(request.query, options);
        reply.send({ data, meta } satisfies ListResponse<PublicStoryDto>);
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
    '/api/v1/stories/:slug',
    async (request, reply) => {
      try {
        const story = await getPublicStoryBySlug(request.params.slug, options);
        reply.send({ data: story } satisfies { data: PublicStoryDetailDto });
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
