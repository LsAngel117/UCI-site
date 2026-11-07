/**
 * Admin Sermons API (docs/08 §11.3–11.9, §24).
 *
 * Thin HTTP layer over `service.ts`: it owns routing, authentication and the
 * `{ data, meta }` / `{ error: { code, message } }` envelopes (docs/08 §29–30),
 * and nothing else. Every editorial rule is enforced by the reusable core.
 *
 * Authorization is per-route via `requirePermission` (docs/11 §9, §12):
 *   read/create/update on the content actions; publish + schedule require
 *   `sermons.publish`; archive requires `sermons.archive`. An EDITOR holds none
 *   of the privileged actions and therefore gets a 403.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  ListResponse,
  RevisionDto,
  SermonAdminDto,
  SermonListQuery,
} from '@shared/cms';
import type { CreateSermonInput, ScheduleInput, UpdateSermonInput } from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  archiveSermon,
  createSermon,
  getSermon,
  getSermonRevision,
  listSermons,
  listSermonRevisions,
  previewSermon,
  publishSermon,
  restoreSermonRevision,
  scheduleSermon,
  updateSermon,
} from './service';

/** Run a service call and translate the result/error into the standard envelope. */
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

interface RevisionParams {
  id: string;
  revisionId: string;
}

export function registerSermonRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('sermons.read');
  const canCreate = requirePermission('sermons.create');
  const canUpdate = requirePermission('sermons.update');
  const canPublish = requirePermission('sermons.publish');
  const canArchive = requirePermission('sermons.archive');

  app.get<{ Querystring: SermonListQuery }>(
    '/api/v1/admin/sermons',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listSermons(request.query);
        reply.send({ data, meta } satisfies ListResponse<SermonAdminDto>);
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
    '/api/v1/admin/sermons',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateSermonInput;
      reply.code(201);
      await send<SermonAdminDto>(reply, () =>
        createSermon(body, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<SermonAdminDto>(reply, () => getSermon(request.params.id));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateSermonInput;
      await send<SermonAdminDto>(reply, () =>
        updateSermon(request.params.id, body, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id/publish',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      await send<SermonAdminDto>(reply, () =>
        publishSermon(request.params.id, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id/schedule',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      const body = (request.body ?? {}) as ScheduleInput;
      await send<SermonAdminDto>(reply, () =>
        scheduleSermon(request.params.id, body.publishAt, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id/archive',
    { preHandler: [auth, canArchive] },
    async (request, reply) => {
      await send<SermonAdminDto>(reply, () =>
        archiveSermon(request.params.id, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id/revisions',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<RevisionDto[]>(reply, () =>
        listSermonRevisions(request.params.id),
      );
    },
  );

  app.get<{ Params: RevisionParams }>(
    '/api/v1/admin/sermons/:id/revisions/:revisionId',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<RevisionDto>(reply, () =>
        getSermonRevision(request.params.id, request.params.revisionId),
      );
    },
  );

  app.post<{ Params: RevisionParams }>(
    '/api/v1/admin/sermons/:id/revisions/:revisionId/restore',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      await send<SermonAdminDto>(reply, () =>
        restoreSermonRevision(
          request.params.id,
          request.params.revisionId,
          request.user!.id,
        ),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/sermons/:id/preview',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      // Preview is never public and must not be indexed (docs/11 §15, docs/08 §24).
      reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
      reply.header('Cache-Control', 'no-store');
      await send<SermonAdminDto>(reply, () => previewSermon(request.params.id));
    },
  );
}
