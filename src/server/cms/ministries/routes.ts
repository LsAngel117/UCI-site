/**
 * Admin Ministries API (docs/08 §13).
 *
 * Thin HTTP layer over `service.ts`: routing, authentication, permissions and
 * the standard envelopes. Editorial rules live in the reusable CMS core.
 *
 * Authorization (docs/11 §9): read/create/update for content actions; publish +
 * schedule require `ministries.publish`; archive requires `ministries.archive`.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CreateMinistryInput,
  ListResponse,
  MinistryAdminDto,
  MinistryListQuery,
  ScheduleInput,
  UpdateMinistryInput,
} from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  archiveMinistry,
  createMinistry,
  getMinistry,
  listMinistries,
  publishMinistry,
  scheduleMinistry,
  updateMinistry,
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

export function registerMinistryRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('ministries.read');
  const canCreate = requirePermission('ministries.create');
  const canUpdate = requirePermission('ministries.update');
  const canPublish = requirePermission('ministries.publish');
  const canArchive = requirePermission('ministries.archive');

  app.get<{ Querystring: MinistryListQuery }>(
    '/api/v1/admin/ministries',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listMinistries(request.query);
        reply.send({ data, meta } satisfies ListResponse<MinistryAdminDto>);
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
    '/api/v1/admin/ministries',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreateMinistryInput;
      reply.code(201);
      await send<MinistryAdminDto>(reply, () =>
        createMinistry(body, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/ministries/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<MinistryAdminDto>(reply, () =>
        getMinistry(request.params.id),
      );
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/ministries/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdateMinistryInput;
      await send<MinistryAdminDto>(reply, () =>
        updateMinistry(request.params.id, body, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/ministries/:id/publish',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      await send<MinistryAdminDto>(reply, () =>
        publishMinistry(request.params.id, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/ministries/:id/schedule',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      const body = (request.body ?? {}) as ScheduleInput;
      await send<MinistryAdminDto>(reply, () =>
        scheduleMinistry(
          request.params.id,
          body.publishAt,
          request.user!.id,
          config.timezone,
        ),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/ministries/:id/archive',
    { preHandler: [auth, canArchive] },
    async (request, reply) => {
      await send<MinistryAdminDto>(reply, () =>
        archiveMinistry(request.params.id, request.user!.id),
      );
    },
  );
}