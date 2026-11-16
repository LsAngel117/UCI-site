/**
 * Admin roles & permissions service (Phase 10D1, docs/08 §9, docs/11 §9).
 *
 * Roles are data, not a hard-coded enum, but their grants are always matched
 * against the canonical permission vocabulary. A role update is a complete
 * replacement of its `RolePermission` rows and every change is audited.
 *
 * Safeguard (evaluated decision, documented here): the ADMIN role must keep
 * `roles.update`. Without it no authenticated principal could ever grant the
 * permission back through the API, leaving the installation administrable only
 * by re-running the seed. Any other permission removal from ADMIN is allowed.
 */
import type { Prisma } from '@prisma/client';
import type { PermissionDto, RoleDto } from '@shared/admin';
import type { PermissionName } from '@shared/api';
import { PERMISSIONS, isPermissionName } from '@shared/api';
import { prisma } from '../../db';
import { recordAudit } from '../../cms/audit';
import { conflict, notFound, validation } from '../../cms/errors';

const ADMIN_ROLE = 'ADMIN';
/**
 * Permission without which the ADMIN role could not be repaired through the
 * API. Removing it from ADMIN is rejected (409).
 */
const ADMIN_CRITICAL_PERMISSION: PermissionName = 'roles.update';

const permissionOrder = new Map<string, number>(
  PERMISSIONS.map((name, index) => [name, index]),
);

const roleInclude = {
  permissions: {
    select: {
      permission: { select: { name: true, description: true } },
    },
  },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

/** Sort recognized permissions in canonical vocabulary order. */
function sortPermissions(permissions: PermissionDto[]): PermissionDto[] {
  return permissions.sort(
    (a, b) =>
      (permissionOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
      (permissionOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Project a role row; unknown permission rows are ignored (allowlist rule). */
export function toRoleDto(row: RoleRow): RoleDto {
  const permissions: PermissionDto[] = [];
  for (const link of row.permissions) {
    const name = link.permission.name;
    if (!isPermissionName(name)) continue;
    permissions.push({
      name,
      description: link.permission.description,
    });
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: sortPermissions(permissions),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** All roles with their permission matrix, ordered by name. */
export async function listRoles(): Promise<RoleDto[]> {
  const rows = await prisma.role.findMany({
    include: roleInclude,
    orderBy: { name: 'asc' },
  });
  return rows.map(toRoleDto);
}

/**
 * Canonical permission vocabulary. Only entries present in the database are
 * returned, in the `@shared/api` order, so the admin matrix and the
 * authorization layer agree on exactly one list.
 */
export async function listPermissions(): Promise<PermissionDto[]> {
  const rows = await prisma.permission.findMany({
    where: { name: { in: [...PERMISSIONS] } },
    select: { name: true, description: true },
  });
  const byName = new Map(rows.map((row) => [row.name, row]));
  const result: PermissionDto[] = [];
  for (const name of PERMISSIONS) {
    const row = byName.get(name);
    if (row) result.push({ name, description: row.description });
  }
  return result;
}

/** Replace a role's grants, validating names and protecting ADMIN. */
export async function updateRole(
  id: string,
  permissions: PermissionName[],
  actorId: string,
): Promise<RoleDto> {
  const current = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!current) throw notFound('Role not found.');

  if (
    current.name === ADMIN_ROLE &&
    !permissions.includes(ADMIN_CRITICAL_PERMISSION)
  ) {
    throw conflict(
      `The ${ADMIN_ROLE} role must keep the "${ADMIN_CRITICAL_PERMISSION}" permission.`,
      { reason: 'ADMIN_CRITICAL_PERMISSION' },
    );
  }

  const rows = await prisma.permission.findMany({
    where: { name: { in: permissions } },
    select: { id: true, name: true },
  });
  const missing = permissions.filter(
    (name) => !rows.some((row) => row.name === name),
  );
  if (missing.length > 0) {
    throw validation('Unknown permission name.', {
      field: 'permissions',
      permissions: missing,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    if (rows.length > 0) {
      await tx.rolePermission.createMany({
        data: rows.map((row) => ({ roleId: id, permissionId: row.id })),
        skipDuplicates: true,
      });
    }
    // `RolePermission` writes do not touch the role row, so the UI would show
    // a stale `updatedAt`. Bump it in the same transaction as the grant change.
    await tx.role.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  });

  await recordAudit({
    actorId,
    action: 'role.update',
    entityType: 'ROLE',
    entityId: id,
    metadata: { role: current.name, permissions },
  });

  const updated = await prisma.role.findUnique({
    where: { id },
    include: roleInclude,
  });
  if (!updated) throw notFound('Role not found.');
  return toRoleDto(updated);
}
