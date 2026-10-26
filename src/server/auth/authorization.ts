/**
 * Authorization service (docs/11 §7, §10).
 *
 * Resolves a user's permissions through the served relations
 * (User → UserRole → Role → RolePermission → Permission) exactly once per
 * request, then evaluates them. Authorization is intentionally independent of
 * the UI: the server is the only authority (docs/07 §59, docs/11 §3.1).
 *
 * Permissions are treated as an allowlist — an unknown identifier in the DB is
 * ignored rather than trusted — and `can` is a pure set-membership check, so
 * there is one place to extend when resource-level policies arrive
 * (docs/11 §11).
 */
import type { AuthUser, PermissionName } from '@shared/api';
import { isPermissionName } from '@shared/api';
import { prisma } from '../db';

/**
 * Role ordering used to pick a single presentational `role` name when a user
 * holds several. `ADMIN` wins over `EDITOR`; unknown roles fall back to the
 * first assigned. This is for display only — never for authorization.
 */
export const ROLE_PRIORITY = ['ADMIN', 'EDITOR'] as const;

interface RoleLink {
  role: { name: string };
}

interface NameableUser {
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** Role names from a Prisma user payload shaped with `roles: { role }`. */
export function roleNamesOf(user: { roles: readonly RoleLink[] }): string[] {
  return user.roles.map((link) => link.role.name);
}

/** Primary (highest-priority) role name, or `''` when the user has none. */
export function primaryRole(roleNames: readonly string[]): string {
  for (const role of ROLE_PRIORITY) {
    if (roleNames.includes(role)) return role;
  }
  return roleNames[0] ?? '';
}

/** Display name from first/last name, falling back to the email local part. */
export function displayName(user: NameableUser): string {
  const full = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  return full || user.email;
}

/**
 * Map a persisted user (with roles) to the client-facing `AuthUser` DTO.
 * Only safe fields cross the boundary — no hash, no session, no internals
 * (docs/11 §20).
 */
export function toAuthUser(user: NameableUser & { id: string; roles: readonly RoleLink[] }): AuthUser {
  return {
    id: user.id,
    name: displayName(user),
    email: user.email,
    role: primaryRole(roleNamesOf(user)),
  };
}

/**
 * Resolve every permission granted to a user through all of their roles,
 * deduplicated and sorted. Unknown identifiers are dropped by
 * `isPermissionName` so a stray row can never widen access.
 */
export async function getUserPermissions(
  userId: string,
): Promise<PermissionName[]> {
  const links = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          permissions: {
            select: { permission: { select: { name: true } } },
          },
        },
      },
    },
  });

  const resolved = new Set<PermissionName>();
  for (const link of links) {
    for (const rolePermission of link.role.permissions) {
      if (isPermissionName(rolePermission.permission.name)) {
        resolved.add(rolePermission.permission.name);
      }
    }
  }
  return [...resolved].sort();
}

/** True when the resolved permission set contains the required permission. */
export function can(
  permissions: readonly PermissionName[],
  required: PermissionName,
): boolean {
  return permissions.includes(required);
}