/**
 * Admin users API (Phase 10D1, docs/08 §8).
 *
 *   GET   /api/v1/admin/users             users.read
 *   POST  /api/v1/admin/users             users.create
 *   GET   /api/v1/admin/users/:id         users.read
 *   PATCH /api/v1/admin/users/:id         users.update
 *   POST  /api/v1/admin/users/:id/disable users.disable
 *
 * The path prefix is `/api/v1/admin/users` (docs/08 §53) rather than the
 * `/api/v1/users` sketch in §8.1–8.5, keeping every administration endpoint
 * under the same panel namespace. Authorization is evaluated server-side by
 * the pre-handler chain before any service call.
 */
import type { FastifyInstance } from 'fastify';
import type { AdminUserDto } from '@shared/admin';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { sendData, sendList } from '../http';
import {
  createUser,
  disableUser,
  getUser,
  listUsers,
  updateUser,
} from './service';
import {
  parseAdminUserListQuery,
  parseCreateUserInput,
  parseUpdateUserInput,
} from './validation';

interface IdParams {
  id: string;
}

export function registerAdminUserRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('users.read');
  const canCreate = requirePermission('users.create');
  const canUpdate = requirePermission('users.update');
  const canDisable = requirePermission('users.disable');

  app.get('/api/v1/admin/users', { preHandler: [auth, canRead] }, async (request, reply) => {
    await sendList<AdminUserDto>(reply, () =>
      listUsers(parseAdminUserListQuery(request.query)),
    );
  });

  app.post('/api/v1/admin/users', { preHandler: [auth, canCreate] }, async (request, reply) => {
    await sendData<AdminUserDto>(
      reply,
      () =>
        createUser(
          parseCreateUserInput(request.body ?? {}),
          request.user!.id,
        ),
      201,
    );
  });

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/users/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await sendData<AdminUserDto>(reply, () => getUser(request.params.id));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/users/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      await sendData<AdminUserDto>(reply, () =>
        updateUser(
          request.params.id,
          parseUpdateUserInput(request.body ?? {}),
          request.user!.id,
        ),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/users/:id/disable',
    { preHandler: [auth, canDisable] },
    async (request, reply) => {
      await sendData<AdminUserDto>(reply, () =>
        disableUser(request.params.id, request.user!.id),
      );
    },
  );
}
