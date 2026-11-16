/**
 * Navigation service (Phase 7A, docs/08 §14, docs/05 §45, docs/11 §9).
 *
 * CMS-driven menu items scoped by `location` (HEADER / FOOTER), optionally
 * nested through `parentId`. The service owns boundary validation — location,
 * target, internal/external href and a cycle-free hierarchy — and persistence;
 * there is no reusable core for menus because the rules are specific to this
 * collection.
 *
 * Mutations are audited (docs/05 §33) and every write is validated before it
 * touches the database, so a rejected payload leaves stored rows untouched.
 */
import type { Navigation } from '@prisma/client';
import type {
  CreateNavigationInput,
  NavigationAdminDto,
  NavigationListQuery,
  NavigationLocation,
  NavigationReorderInput,
  NavigationTarget,
  UpdateNavigationInput,
} from '@shared/cms';
import { NAVIGATION_LOCATIONS, NAVIGATION_TARGETS } from '@shared/cms';
import { prisma } from '../../db';
import { recordAudit } from '../audit';
import { notFound, validation } from '../errors';

const ENTITY_TYPE = 'NAVIGATION';

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

function requireLabel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "label" is required.', { field: 'label' });
  }
  return value;
}

/** Normalize a location to the canonical uppercase form. */
function parseLocation(value: unknown): NavigationLocation {
  if (typeof value !== 'string') {
    throw validation('"location" must be HEADER or FOOTER.', { field: 'location' });
  }
  const normalized = value.trim().toUpperCase();
  if (!(NAVIGATION_LOCATIONS as readonly string[]).includes(normalized)) {
    throw validation('"location" must be HEADER or FOOTER.', { field: 'location' });
  }
  return normalized as NavigationLocation;
}

/** Parse an optional target (`_self` / `_blank`) or null. */
function parseTarget(value: unknown): NavigationTarget | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    !(NAVIGATION_TARGETS as readonly string[]).includes(value)
  ) {
    throw validation('"target" must be "_self", "_blank" or null.', {
      field: 'target',
    });
  }
  return value as NavigationTarget;
}

/**
 * Validate the href against the external flag: an external link must be an
 * absolute http(s) URL, an internal link must be a rooted path.
 */
function assertValidHref(href: string, external: boolean): void {
  if (external) {
    if (!/^https?:\/\//i.test(href)) {
      throw validation('An external "href" must be an http(s) URL.', {
        field: 'href',
      });
    }
    return;
  }
  if (!href.startsWith('/')) {
    throw validation('An internal "href" must start with "/".', {
      field: 'href',
    });
  }
}

function parseHref(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "href" is required.', { field: 'href' });
  }
  return value.trim();
}

function parseOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw validation('"order" must be a non-negative integer.', {
      field: 'order',
    });
  }
  return value;
}

function parseVisible(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw validation('"visible" must be a boolean.', { field: 'visible' });
  }
  return value;
}

function parseExternal(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw validation('"external" must be a boolean.', { field: 'external' });
  }
  return value;
}

function parseParentId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('"parentId" must be a non-empty id or null.', {
      field: 'parentId',
    });
  }
  return value;
}

/**
 * Validate that `parentId` exists and, on update, that assigning it cannot
 * create a cycle (the new parent must not be the item itself or any of its
 * descendants).
 */
async function assertValidParent(parentId: string | null, selfId?: string): Promise<void> {
  if (parentId === null) return;
  if (parentId === selfId) {
    throw validation('A navigation item cannot be its own parent.', {
      field: 'parentId',
    });
  }
  const parent = await prisma.navigation.findUnique({
    where: { id: parentId },
    select: { id: true },
  });
  if (!parent) {
    throw validation('The referenced parent navigation item does not exist.', {
      field: 'parentId',
    });
  }
  if (selfId === undefined) return;

  // Walk up from the proposed parent; reaching the edited id means a cycle.
  const seen = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor !== null) {
    if (cursor === selfId) {
      throw validation(
        'A navigation item cannot be nested under itself or one of its descendants.',
        { field: 'parentId' },
      );
    }
    if (seen.has(cursor)) break; // defensive: pre-existing corrupt chain
    seen.add(cursor);
    const row: { parentId: string | null } | null = await prisma.navigation.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toNavigationDto(row: Navigation): NavigationAdminDto {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    external: row.external,
    location: row.location as NavigationLocation,
    target: (row.target as NavigationTarget | null) ?? null,
    order: row.order,
    visible: row.visible,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ORDER_BY = [
  { location: 'asc' },
  { order: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function parseVisibleFilter(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw validation('"visible" filter must be true or false.', {
    field: 'visible',
  });
}

export async function listNavigation(
  query: NavigationListQuery,
): Promise<NavigationAdminDto[]> {
  const where: { location?: string; visible?: boolean; parentId?: string } = {};
  if (query.location !== undefined && query.location !== null) {
    where.location = parseLocation(query.location);
  }
  const visible = parseVisibleFilter(query.visible);
  if (visible !== undefined) where.visible = visible;
  if (typeof query.parentId === 'string' && query.parentId.length > 0) {
    where.parentId = query.parentId;
  }

  const rows = await prisma.navigation.findMany({ where, orderBy: [...ORDER_BY] });
  return rows.map(toNavigationDto);
}

async function findNavigationOrThrow(id: string): Promise<Navigation> {
  const row = await prisma.navigation.findUnique({ where: { id } });
  if (!row) throw notFound('Navigation item not found.');
  return row;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createNavigation(
  input: CreateNavigationInput,
  actorId: string | null,
): Promise<NavigationAdminDto> {
  const label = requireLabel(input.label);
  const href = parseHref(input.href);
  const external = input.external === undefined ? false : parseExternal(input.external);
  assertValidHref(href, external);
  const location =
    input.location === undefined ? 'HEADER' : parseLocation(input.location);
  const target = parseTarget(input.target);
  const order = input.order === undefined ? 0 : parseOrder(input.order);
  const visible = input.visible === undefined ? true : parseVisible(input.visible);
  const parentId = parseParentId(input.parentId);
  await assertValidParent(parentId);

  const created = await prisma.navigation.create({
    data: { label, href, external, location, target, order, visible, parentId },
  });
  await recordAudit({
    actorId,
    action: 'navigation.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { location: created.location, href: created.href },
  });
  return toNavigationDto(created);
}

export async function updateNavigation(
  id: string,
  input: UpdateNavigationInput,
  actorId: string | null,
): Promise<NavigationAdminDto> {
  const current = await findNavigationOrThrow(id);

  const label = input.label === undefined ? current.label : requireLabel(input.label);
  const href = input.href === undefined ? current.href : parseHref(input.href);
  const external =
    input.external === undefined ? current.external : parseExternal(input.external);
  assertValidHref(href, external);
  const location =
    input.location === undefined
      ? (current.location as NavigationLocation)
      : parseLocation(input.location);
  const target =
    input.target === undefined
      ? (current.target as NavigationTarget | null)
      : parseTarget(input.target);
  const order = input.order === undefined ? current.order : parseOrder(input.order);
  const visible =
    input.visible === undefined ? current.visible : parseVisible(input.visible);
  const parentId =
    input.parentId === undefined ? current.parentId : parseParentId(input.parentId);
  await assertValidParent(parentId, id);

  const updated = await prisma.navigation.update({
    where: { id },
    data: { label, href, external, location, target, order, visible, parentId },
  });
  await recordAudit({
    actorId,
    action: 'navigation.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: {
      location: updated.location,
      href: updated.href,
      visible: updated.visible,
    },
  });
  return toNavigationDto(updated);
}

export async function deleteNavigation(
  id: string,
  actorId: string | null,
): Promise<void> {
  await findNavigationOrThrow(id);
  await prisma.navigation.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: 'navigation.deleted',
    entityType: ENTITY_TYPE,
    entityId: id,
  });
}

/**
 * Apply a batch of order positions (docs/08 §14.2). The whole batch is
 * validated first and then written in one transaction; a malformed request
 * therefore changes no row at all.
 */
export async function reorderNavigation(
  input: NavigationReorderInput,
  actorId: string | null,
): Promise<NavigationAdminDto[]> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw validation('"items" must be a non-empty array.', { field: 'items' });
  }

  const seen = new Set<string>();
  const items: { id: string; position: number }[] = [];
  for (const entry of input.items) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw validation('Each reorder item must be an object.', { field: 'items' });
    }
    const candidate = entry as { id?: unknown; position?: unknown };
    if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
      throw validation('Each reorder item needs a non-empty "id".', {
        field: 'items',
      });
    }
    if (seen.has(candidate.id)) {
      throw validation('Each navigation item may appear only once.', {
        field: 'items',
      });
    }
    seen.add(candidate.id);
    if (
      typeof candidate.position !== 'number' ||
      !Number.isInteger(candidate.position) ||
      candidate.position < 0
    ) {
      throw validation('Each "position" must be a non-negative integer.', {
        field: 'items',
      });
    }
    items.push({ id: candidate.id, position: candidate.position });
  }

  const found = await prisma.navigation.findMany({
    where: { id: { in: items.map((item) => item.id) } },
    select: { id: true },
  });
  if (found.length !== items.length) {
    throw validation('One or more navigation items do not exist.', {
      field: 'items',
    });
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.navigation.update({
        where: { id: item.id },
        data: { order: item.position },
      }),
    ),
  );

  const rows = await prisma.navigation.findMany({
    where: { id: { in: items.map((item) => item.id) } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  await recordAudit({
    actorId,
    action: 'navigation.reordered',
    entityType: ENTITY_TYPE,
    metadata: { items: items.map((item) => item.id) },
  });
  return rows.map(toNavigationDto);
}
