/**
 * Public Navigation API (Phase 7B, docs/08 §14.1).
 *
 * One unauthenticated, read-only endpoint:
 *
 *   GET /api/v1/navigation?location=HEADER
 *
 * No `preHandler` is attached on purpose: the public menu must be readable
 * without a session. Visibility and hierarchy are enforced inside the service.
 */
import type { FastifyInstance } from 'fastify';
import type {
  PublicNavigationItemDto,
  PublicNavigationQuery,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import { getPublicNavigation } from './public-service';

export function registerPublicNavigationRoutes(
  app: FastifyInstance,
  _config: ServerConfig,
): void {
  app.get<{ Querystring: PublicNavigationQuery }>(
    '/api/v1/navigation',
    async (request, reply) => {
      try {
        const data = await getPublicNavigation(request.query);
        reply.send({ data } satisfies { data: PublicNavigationItemDto[] });
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
