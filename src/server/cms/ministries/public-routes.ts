/**
 * Public Ministries API (Phase 6B, docs/08 §13.1–13.2, docs/11 §14).
 *
 * Two unauthenticated, read-only endpoints:
 *
 *   GET /api/v1/ministries        published directory with filters + pagination
 *   GET /api/v1/ministries/:slug  published detail with SEO + cover + contact
 *
 * No `preHandler` is attached on purpose: public content must be readable
 * without a session. Visibility is enforced inside the service, which only
 * selects `status = published` rows.
 */
import type { FastifyInstance } from 'fastify';
import type {
  ListResponse,
  PublicMinistryDto,
  PublicMinistryListQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import type { MediaStorage } from '../../media/storage';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  getPublicMinistryBySlug,
  listPublicMinistries,
} from './public-service';

interface SlugParams {
  slug: string;
}

export function registerPublicMinistryRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  storage: MediaStorage,
): void {
  const options = { storage, siteUrl: config.siteUrl };

  app.get<{ Querystring: PublicMinistryListQuery }>(
    '/api/v1/ministries',
    async (request, reply) => {
      try {
        const { data, meta } = await listPublicMinistries(request.query, options);
        reply.send({ data, meta } satisfies ListResponse<PublicMinistryDto>);
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
    '/api/v1/ministries/:slug',
    async (request, reply) => {
      try {
        const ministry = await getPublicMinistryBySlug(
          request.params.slug,
          options,
        );
        reply.send({ data: ministry } satisfies { data: PublicMinistryDto });
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
