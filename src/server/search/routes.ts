/**
 * Public search API (Phase 8, docs/08 §20).
 *
 * `GET /api/v1/search?q=...` is unauthenticated and read-only. Visibility is
 * enforced inside the service, which only selects `status = 'published'` rows.
 */
import type { FastifyInstance } from 'fastify';
import type { SearchQuery, SearchResponse } from '@shared/search';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';
import { searchPublicContent } from './service';

export function registerSearchRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: SearchQuery }>(
    '/api/v1/search',
    async (request, reply) => {
      try {
        const { data, meta } = await searchPublicContent(request.query);
        reply.send({ data, meta } satisfies SearchResponse);
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
