/**
 * Validation for `PATCH /api/v1/admin/roles/:id` (Phase 10D1, docs/08 §9).
 *
 * The permission list is a complete replacement and every name must belong to
 * the canonical vocabulary (`@shared/api` PERMISSIONS). An unknown identifier
 * is a 400: the authorization layer treats permissions as an allowlist, so a
 * grant that could never be evaluated must never be persisted.
 */
import type { PermissionName } from '@shared/api';
import { isPermissionName } from '@shared/api';
import type { UpdateRoleInput } from '@shared/admin';
import { validation } from '../../cms/errors';

const UPDATE_KEYS = new Set(['permissions']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate and normalize a complete permission replacement set. */
export function parseUpdateRoleInput(value: unknown): UpdateRoleInput {
  if (!isPlainObject(value)) {
    throw validation('"body" must be an object.', { field: 'body' });
  }
  for (const key of Object.keys(value)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validation(`"body.${key}" is not a supported field.`, {
        field: 'body',
      });
    }
  }
  if (!Array.isArray(value.permissions)) {
    throw validation('"permissions" must be an array of permission names.', {
      field: 'permissions',
    });
  }

  const permissions: PermissionName[] = [];
  for (const raw of value.permissions) {
    if (!isPermissionName(raw)) {
      throw validation('"permissions" contains an unknown permission name.', {
        field: 'permissions',
      });
    }
    if (!permissions.includes(raw)) permissions.push(raw);
  }
  return { permissions };
}
