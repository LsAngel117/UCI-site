/**
 * Admin Event Categories API (Phase 6A, T5; docs/05 §12).
 *
 * Categories are event-owned taxonomy, so the routes reuse the `events.*`
 * permissions (docs/11 §9 defines no separate category resource — same
 * documented decision as the sermon taxonomy). Exposes the basic list/create/
 * update surface the admin event editor needs.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreateEventCategoryInput,
  EventCategoryDto,
  EventCategoryListQuery,
  ListResponse,
  UpdateEventCategoryInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  createEventCategory,
  listEventCategories,
  updateEventCategory,
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

export function registerEventCategoryRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('events.read');
  const canCreate = requirePermission('events.create');
  const canUpdate = requirePermission('events.update');

  app.get<{ Querystring: EventCategoryListQuery }>(
    '/api/v1/admin/event-categories',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listEventCategories(request.query);
        reply.send({ data, meta } satisfies ListResponse<EventCategoryDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/event-categories',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateEventCategoryInput;
      reply.code(201);
      await send<EventCategoryDto>(reply, () =>
        createEventCategory(body, request.user!.id),
      );
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/event-categories/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateEventCategoryInput;
      await send<EventCategoryDto>(reply, () =>
        updateEventCategory(request.params.id, body, request.user!.id),
      );
    },
  );
}