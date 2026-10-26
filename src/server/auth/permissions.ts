/**
 * Server-side permission vocabulary (docs/11 §9).
 *
 * The canonical identifiers and the `PermissionName` union live in `@shared`
 * so the admin UI and the API agree on exactly one string set. This module
 * re-exports that vocabulary and adds the server-only pieces: permission
 * descriptions (consumed by the seed) and the baseline EDITOR grant.
 *
 * Nothing here queries the database — resolution and evaluation live in
 * `authorization.ts`, keeping the vocabulary pure and importable anywhere.
 */
export {
  PERMISSIONS,
  isPermissionName,
  type PermissionName,
} from '@shared/api';

import type { PermissionName } from '@shared/api';

/**
 * Baseline permissions granted to EDITOR (docs/11 §8.2): create/edit content,
 * media and SEO. Deliberately excludes every publish/archive/delete action and
 * all of users, roles, audit, settings and navigation. Publishing is controlled
 * by explicit permission rather than assumed from the role name.
 */
export const EDITOR_PERMISSIONS: readonly PermissionName[] = [
  'pages.read',
  'pages.create',
  'pages.update',
  'sermons.read',
  'sermons.create',
  'sermons.update',
  'events.read',
  'events.create',
  'events.update',
  'ministries.read',
  'ministries.create',
  'ministries.update',
  'media.read',
  'media.upload',
  'media.update',
  'seo.read',
  'seo.update',
];

/**
 * Human-readable description for a permission, used by the seed. Derived from
 * the `resource.action` shape instead of a 40-entry hand-written map so the
 * vocabulary stays the single source of truth.
 */
export function describePermission(permission: PermissionName): string {
  const separator = permission.indexOf('.');
  const resource =
    separator === -1 ? permission : permission.slice(0, separator);
  const action =
    separator === -1 ? '' : permission.slice(separator + 1);
  return action
    ? `Allows "${action}" operations on ${resource}.`
    : `Allows "${permission}".`;
}