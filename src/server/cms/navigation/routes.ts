/**
 * Admin Navigation API (Phase 7A, docs/08 §14.2).
 *
 * Thin HTTP layer over `service.ts`. Every route requires authentication and
 * the `navigation.read` / `navigation.update` permission (docs/11 §9). The
 * reorder route is declared before `/:id` so it is never interpreted as an id.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreateNavigationInput,
  NavigationAdminDto,
  NavigationListQuery,
  NavigationReorderInput,
  UpdateNavigationInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  createNavigation,
  deleteNavigation,
  listNavigation,
  reorderNavigation,
  updateNavigation,
} from './service';

async function send<T>(
  reply: FastifyReply,
  produce: () => Promise<T>,
): Promise<void> {
  try {
    const data = await produce();
    reply.send({ data } satisfies ApiResponse<T>);
  } catch (error) {
    if (isCmsError(error)) {
      reply.code(error.statusCode).send(cmsErrorEnvelope(error));
      return;
    }
    throw error;
  }
}

interface IdParams {
  id: string;
}

export function registerNavigationRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('navigation.read');
  const canUpdate = requirePermission('navigation.update');

  app.get<{ Querystring: NavigationListQuery }>(
    '/api/v1/admin/navigation',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<NavigationAdminDto[]>(reply, () =>
        listNavigation(request.query),
      );
    },
  );

  app.post(
    '/api/v1/admin/navigation',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateNavigationInput;
      reply.code(201);
      await send<NavigationAdminDto>(reply, () =>
        createNavigation(body, request.user!.id),
      );
    },
  );

  // Declared before the `/:id` routes so the literal path always wins.
  app.post(
    '/api/v1/admin/navigation/reorder',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as NavigationReorderInput;
      await send<NavigationAdminDto[]>(reply, () =>
        reorderNavigation(body, request.user!.id),
      );
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/navigation/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateNavigationInput;
      await send<NavigationAdminDto>(reply, () =>
        updateNavigation(request.params.id, body, request.user!.id),
      );
    },
  );

  app.delete<{ Params: IdParams }>(
    '/api/v1/admin/navigation/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      try {
        await deleteNavigation(request.params.id, request.user!.id);
        reply.code(204).send();
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
