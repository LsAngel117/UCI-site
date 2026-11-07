/**
 * Admin Events API (docs/08 §12.3).
 *
 * Thin HTTP layer over `service.ts`: routing, authentication, permissions and
 * the `{ data, meta }` / `{ error: { code, message } }` envelopes. All editorial
 * rules live in the reusable CMS core.
 *
 * Authorization (docs/11 §9): read/create/update for content actions; publish +
 * schedule require `events.publish`; archive requires `events.archive`.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreateEventInput,
  EventAdminDto,
  EventListQuery,
  ListResponse,
  ScheduleInput,
  UpdateEventInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  archiveEvent,
  createEvent,
  getEvent,
  listEvents,
  publishEvent,
  scheduleEvent,
  updateEvent,
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

export function registerEventRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('events.read');
  const canCreate = requirePermission('events.create');
  const canUpdate = requirePermission('events.update');
  const canPublish = requirePermission('events.publish');
  const canArchive = requirePermission('events.archive');

  app.get<{ Querystring: EventListQuery }>(
    '/api/v1/admin/events',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listEvents(request.query);
        reply.send({ data, meta } satisfies ListResponse<EventAdminDto>);
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
    '/api/v1/admin/events',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateEventInput;
      reply.code(201);
      await send<EventAdminDto>(reply, () =>
        createEvent(body, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/events/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<EventAdminDto>(reply, () => getEvent(request.params.id));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/events/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateEventInput;
      await send<EventAdminDto>(reply, () =>
        updateEvent(request.params.id, body, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/events/:id/publish',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      await send<EventAdminDto>(reply, () =>
        publishEvent(request.params.id, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/events/:id/schedule',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      const body = (request.body ?? {}) as ScheduleInput;
      await send<EventAdminDto>(reply, () =>
        scheduleEvent(request.params.id, body.publishAt, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/events/:id/archive',
    { preHandler: [auth, canArchive] },
    async (request, reply) => {
      await send<EventAdminDto>(reply, () =>
        archiveEvent(request.params.id, request.user!.id),
      );
    },
  );
}