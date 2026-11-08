/**
 * Admin Stories API (improvement A2, docs/08 §10, §22–24, docs/05 §14).
 *
 * Thin HTTP layer over `service.ts`: routing, authentication and the standard
 * `{ data, meta }` / `{ error: { code, message } }` envelopes. Every editorial
 * rule (lifecycle, publication, slug, concurrency, audit) is enforced by the
 * reusable CMS core.
 *
 * Permission choice: docs/11 §9 defines no `stories.*` vocabulary, so this
 * collection reuses the existing `pages.*` permissions — the same deliberate
 * convention used by event categories (which reuse `events.*`). An EDITOR can
 * read/create/update but cannot publish or archive.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreateStoryInput,
  ListResponse,
  ScheduleInput,
  StoryAdminDto,
  StoryListQuery,
  UpdateStoryInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  archiveStory,
  createStory,
  getStory,
  listStories,
  publishStory,
  scheduleStory,
  updateStory,
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

export function registerStoryRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('pages.read');
  const canCreate = requirePermission('pages.create');
  const canUpdate = requirePermission('pages.update');
  const canPublish = requirePermission('pages.publish');
  const canArchive = requirePermission('pages.archive');

  app.get<{ Querystring: StoryListQuery }>(
    '/api/v1/admin/stories',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listStories(request.query);
        reply.send({ data, meta } satisfies ListResponse<StoryAdminDto>);
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
    '/api/v1/admin/stories',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateStoryInput;
      reply.code(201);
      await send<StoryAdminDto>(reply, () =>
        createStory(body, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/stories/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<StoryAdminDto>(reply, () => getStory(request.params.id));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/stories/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateStoryInput;
      await send<StoryAdminDto>(reply, () =>
        updateStory(request.params.id, body, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/stories/:id/publish',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      await send<StoryAdminDto>(reply, () =>
        publishStory(request.params.id, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/stories/:id/schedule',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      const body = (request.body ?? {}) as ScheduleInput;
      await send<StoryAdminDto>(reply, () =>
        scheduleStory(
          request.params.id,
          body.publishAt,
          request.user!.id,
          config.timezone,
        ),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/stories/:id/archive',
    { preHandler: [auth, canArchive] },
    async (request, reply) => {
      await send<StoryAdminDto>(reply, () =>
        archiveStory(request.params.id, request.user!.id),
      );
    },
  );
}
