/**
 * Public Navigation service (Phase 7B, docs/08 §14.1, docs/05 §45).
 *
 * CMS-driven menus are projected as a nested, ordered tree scoped by
 * `location` (HEADER / FOOTER). The public boundary enforces:
 *
 *   - only `visible = true` rows are selected (docs/08 §14.1);
 *   - rows are ordered by `order`, then a stable createdAt/id tie-break;
 *   - each item is nested under its `parentId` when that parent is itself
 *     visible, so the frontend receives the hierarchy ready to render;
 *   - the DTO is minimal: no `visible`, `order`, `parentId`, `location` or
 *     timestamps leak (those are editorial/admin concerns).
 *
 * A visible child whose parent is hidden is promoted to the top level instead
 * of being dropped: the item is visible, and hiding a group must not silently
 * delete its visible links.
 */
import type { Navigation } from '@prisma/client';
import type {
  NavigationLocation,
  NavigationTarget,
  PublicNavigationItemDto,
  PublicNavigationQuery,
} from '@shared/cms';
import { NAVIGATION_LOCATIONS } from '@shared/cms';
import { prisma } from '../../db';
import { validation } from '../errors';

/** Default menu when the caller does not ask for one (docs/08 §14.1). */
const DEFAULT_LOCATION: NavigationLocation = 'HEADER';

/** Normalize and validate the requested location. */
function parseLocation(value: unknown): NavigationLocation {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LOCATION;
  }
  if (typeof value !== 'string') {
    throw validation('"location" must be HEADER or FOOTER.', {
      field: 'location',
    });
  }
  const normalized = value.trim().toUpperCase();
  if (!(NAVIGATION_LOCATIONS as readonly string[]).includes(normalized)) {
    throw validation('"location" must be HEADER or FOOTER.', {
      field: 'location',
    });
  }
  return normalized as NavigationLocation;
}

function toItem(row: Navigation): PublicNavigationItemDto {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    external: row.external,
    target: (row.target as NavigationTarget | null) ?? null,
    children: [],
  };
}

/**
 * Load the public tree for one menu location. The whole menu is loaded in one
 * query and assembled in memory: menus are small and a recursive query would
 * add no value.
 */
export async function getPublicNavigation(
  query: PublicNavigationQuery,
): Promise<PublicNavigationItemDto[]> {
  const location = parseLocation(query.location);

  const rows = await prisma.navigation.findMany({
    where: { location, visible: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const nodes = new Map<string, PublicNavigationItemDto>();
  for (const row of rows) nodes.set(row.id, toItem(row));

  const roots: PublicNavigationItemDto[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      // Either a true root or a visible child of a hidden parent.
      roots.push(node);
    }
  }

  return roots;
}
