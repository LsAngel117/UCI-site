/**
 * Admin roles & permissions API (Phase 10D1, docs/08 §9, docs/11 §9).
 *
 *   GET   /api/v1/admin/roles        roles.read
 *   GET   /api/v1/admin/permissions  roles.read   (documented decision)
 *   PATCH /api/v1/admin/roles/:id    roles.update
 *
 * `GET /admin/permissions` is the vocabulary consumed by the role editor. It
 * requires `roles.read` — the minimum permission that grants access to the
 * role matrix — rather than `roles.update`, because viewing the vocabulary is
 * a read operation and a read-only role administrator must be able to render
 * it. docs/08 §9 does not specify a permission; this is the documented choice.
 */
import type { FastifyInstance } from 'fastify';
import type { PermissionDto, RoleDto } from '@shared/admin';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { sendData } from '../http';
import { listPermissions, listRoles, updateRole } from './service';
import { parseUpdateRoleInput } from './validation';

interface IdParams {
  id: string;
}

export function registerAdminRoleRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('roles.read');
  const canUpdate = requirePermission('roles.update');

  app.get('/api/v1/admin/roles', { preHandler: [auth, canRead] }, async (_request, reply) => {
    await sendData<RoleDto[]>(reply, () => listRoles());
  });

  app.get(
    '/api/v1/admin/permissions',
    { preHandler: [auth, canRead] },
    async (_request, reply) => {
      await sendData<PermissionDto[]>(reply, () => listPermissions());
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/roles/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      await sendData<RoleDto>(reply, () =>
        updateRole(
          request.params.id,
          parseUpdateRoleInput(request.body ?? {}).permissions,
          request.user!.id,
        ),
      );
    },
  );
}
