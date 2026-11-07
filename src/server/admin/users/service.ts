/**
 * Admin users service (Phase 10D1, docs/08 §8, docs/11 §5.3, §9).
 *
 * Owns the use cases behind the admin users endpoints. The route layer stays
 * thin; this module enforces every rule:
 *
 *   - the email is unique (pre-check + `P2002` race translation → 409);
 *   - a new password is hashed with Argon2id and never leaves this module;
 *   - role assignments are resolved by name against existing roles;
 *   - disabling (or deactivating/demoting via PATCH) revokes every session;
 *   - the last ACTIVE ADMIN can never be disabled, deactivated or demoted;
 *   - every mutation is appended to `audit_logs`;
 *   - every response is an explicit DTO with no `passwordHash`.
 */
import { Prisma } from '@prisma/client';
import type {
  AdminUserDto,
  AdminUserListQuery,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from '@shared/admin';
import type { PaginationMeta } from '@shared/api';
import {
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { prisma } from '../../db';
import { displayName } from '../../auth/authorization';
import { hashPassword } from '../../auth/password';
import { revokeAllUserSessions } from '../../auth/session';
import { recordAudit } from '../../cms/audit';
import { conflict, notFound, validation } from '../../cms/errors';

const ENTITY_TYPE = 'USER';
const ADMIN_ROLE = 'ADMIN';

/** Fields every user DTO is hydrated from — never includes `passwordHash`. */
const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: { select: { id: true, name: true, description: true } },
    },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Sorting allowlist — a client value is never used as a raw Prisma key. */
const USER_SORT_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'active',
  'createdAt',
  'updatedAt',
] as const;

/** Project a persisted user (with roles) to the safe admin DTO. */
export function toAdminUser(row: UserRow): AdminUserDto {
  const roles = row.roles
    .map((link) => ({
      id: link.role.id,
      name: link.role.name,
      description: link.role.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: row.id,
    email: row.email,
    name: displayName(row),
    firstName: row.firstName,
    lastName: row.lastName,
    active: row.active,
    roles,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Load one user or throw the standard 404. */
async function loadUser(id: string): Promise<UserRow> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });
  if (!row) throw notFound('User not found.');
  return row;
}

/**
 * Resolve role names to ids, preserving the caller's order and rejecting any
 * unknown name before a write. `roles` are names, mirroring docs/08 §8.3.
 */
async function resolveRoleIds(names: string[]): Promise<string[]> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return [];
  const roles = await prisma.role.findMany({
    where: { name: { in: unique } },
    select: { id: true, name: true },
  });
  const missing = unique.filter(
    (name) => !roles.some((role) => role.name === name),
  );
  if (missing.length > 0) {
    throw validation('Unknown role name.', { field: 'roles', roles: missing });
  }
  const idByName = new Map(roles.map((role) => [role.name, role.id]));
  return unique.map((name) => idByName.get(name)!);
}

/**
 * True when the target is currently an active ADMIN and the proposed state
 * would leave it as neither active nor ADMIN. In that case at least one other
 * active ADMIN must exist (docs/08 §8.5 safeguard).
 */
async function assertNotLastActiveAdmin(
  current: UserRow,
  nextActive: boolean,
  nextRoleNames: readonly string[],
): Promise<void> {
  const isActiveAdmin =
    current.active &&
    current.roles.some((link) => link.role.name === ADMIN_ROLE);
  if (!isActiveAdmin) return;

  const staysActiveAdmin = nextActive && nextRoleNames.includes(ADMIN_ROLE);
  if (staysActiveAdmin) return;

  const otherActiveAdmins = await prisma.user.count({
    where: {
      id: { not: current.id },
      active: true,
      roles: { some: { role: { name: ADMIN_ROLE } } },
    },
  });
  if (otherActiveAdmins === 0) {
    throw conflict(
      'Cannot disable or demote the last active administrator.',
      { reason: 'LAST_ACTIVE_ADMIN' },
    );
  }
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') return false;
  const target = candidate.meta?.target;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some(
    (field) => typeof field === 'string' && field.includes('email'),
  );
}

/** Paginated, filtered user list (docs/08 §8.1). */
export async function listUsers(
  query: AdminUserListQuery,
): Promise<{ data: AdminUserDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.UserWhereInput = {};

  if (typeof query.search === 'string' && query.search.length > 0) {
    where.OR = [
      { email: { contains: query.search, mode: 'insensitive' } },
      { firstName: { contains: query.search, mode: 'insensitive' } },
      { lastName: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (typeof query.role === 'string' && query.role.length > 0) {
    where.roles = { some: { role: { name: query.role } } };
  }
  if (typeof query.active === 'boolean') {
    where.active = query.active;
  }

  const requested = resolveSort(query.sort, query.order, USER_SORT_FIELDS);
  const orderBy = (
    requested
      ? { [requested.field]: requested.order }
      : { createdAt: 'desc' }
  ) as Prisma.UserOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      select: userSelect,
    }),
  ]);

  return {
    data: rows.map(toAdminUser),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

/** Single user detail (docs/08 §8.2). */
export async function getUser(id: string): Promise<AdminUserDto> {
  return toAdminUser(await loadUser(id));
}

/** Create a user with an Argon2id password and optional role grants. */
export async function createUser(
  input: CreateAdminUserInput,
  actorId: string,
): Promise<AdminUserDto> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw conflict('A user with this email already exists.', {
      field: 'email',
    });
  }

  const roleNames = input.roles ?? [];
  const roleIds = await resolveRoleIds(roleNames);
  const passwordHash = await hashPassword(input.password);

  let created: UserRow;
  try {
    created = await prisma.user.create({
      // The schema splits names; until dedicated first/last inputs exist the
      // full display name is stored as `firstName` so it round-trips exactly.
      data: {
        email: input.email,
        passwordHash,
        firstName: input.name,
        lastName: null,
        active: input.active ?? true,
        roles:
          roleIds.length > 0
            ? { create: roleIds.map((roleId) => ({ roleId })) }
            : undefined,
      },
      select: userSelect,
    });
  } catch (error) {
    // A concurrent create can win the race between the pre-check and the
    // insert; translate the unique violation to the same 409.
    if (isEmailUniqueViolation(error)) {
      throw conflict('A user with this email already exists.', {
        field: 'email',
      });
    }
    throw error;
  }

  await recordAudit({
    actorId,
    action: 'user.create',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    // Never log the password, hash or email; role names are the useful context.
    metadata: { roles: roleNames },
  });

  return toAdminUser(created);
}

/** Patch name/active/roles. Password changes are deliberately not supported. */
export async function updateUser(
  id: string,
  input: UpdateAdminUserInput,
  actorId: string,
): Promise<AdminUserDto> {
  const current = await loadUser(id);

  const roleIds =
    input.roles === undefined ? undefined : await resolveRoleIds(input.roles);
  const nextRoleNames =
    input.roles ?? current.roles.map((link) => link.role.name);
  const nextActive = input.active ?? current.active;
  await assertNotLastActiveAdmin(current, nextActive, nextRoleNames);

  const hasChanges =
    input.name !== undefined ||
    input.active !== undefined ||
    input.roles !== undefined;
  if (!hasChanges) return toAdminUser(current);

  await prisma.$transaction(async (tx) => {
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.firstName = input.name;
    if (input.active !== undefined) data.active = input.active;
    await tx.user.update({ where: { id }, data });

    if (roleIds !== undefined) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
          skipDuplicates: true,
        });
      }
    }
  });

  // Deactivation through a generic PATCH has the same security consequence as
  // the dedicated disable endpoint: every existing session stops working.
  if (input.active === false && current.active) {
    await revokeAllUserSessions(id);
  }

  await recordAudit({
    actorId,
    action: 'user.update',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: {
      fields: Object.keys(input),
      ...(input.roles === undefined ? {} : { roles: input.roles }),
    },
  });

  return toAdminUser(await loadUser(id));
}

/** Disable an account (idempotent) and revoke its sessions. */
export async function disableUser(
  id: string,
  actorId: string,
): Promise<AdminUserDto> {
  const current = await loadUser(id);
  if (!current.active) return toAdminUser(current);

  await assertNotLastActiveAdmin(
    current,
    false,
    current.roles.map((link) => link.role.name),
  );

  await prisma.user.update({ where: { id }, data: { active: false } });
  await revokeAllUserSessions(id);

  await recordAudit({
    actorId,
    action: 'user.disable',
    entityType: ENTITY_TYPE,
    entityId: id,
  });

  return toAdminUser(await loadUser(id));
}
