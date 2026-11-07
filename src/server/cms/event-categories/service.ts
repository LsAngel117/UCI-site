/**
 * Event category admin service (Phase 6A, T5; docs/05 §12, docs/11 §9).
 *
 * Event categories are event-owned taxonomy: they are edited by the same
 * editorial team that edits events. `docs/11 §9` defines no `event-categories.*`
 * permissions, so this module reuses `events.read/create/update` — the same
 * deliberate decision documented for the sermon taxonomy. Reusing the parent
 * resource avoids fragmenting authorization for one editorial surface.
 *
 * Slug rules and uniqueness come from the shared `cms/slug` service.
 */
import type { EventCategory } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreateEventCategoryInput,
  EventCategoryDto,
  EventCategoryListQuery,
  PaginationMeta,
  UpdateEventCategoryInput,
} from '@shared/cms';
import {
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { prisma } from '../../db';
import { recordAudit } from '../audit';
import { notFound, slugTaken, validation } from '../errors';
import { generateUniqueSlug, requireAvailableSlug, type SlugTakenProbe } from '../slug';
import { isSlugUniqueViolation } from '../sermons/prisma-errors';

const ENTITY_TYPE = 'EVENT_CATEGORY';

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.eventCategory.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

const SORT_FIELDS = ['name', 'slug', 'createdAt', 'updatedAt'] as const;

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "name" is required.', { field: 'name' });
  }
  return value.trim();
}

function toDto(category: EventCategory): EventCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function listEventCategories(
  query: EventCategoryListQuery,
): Promise<{ data: EventCategoryDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.EventCategoryWhereInput = {};

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const requested = resolveSort(query.sort, query.order, SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { name: 'asc' }
  ) as Prisma.EventCategoryOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.eventCategory.count({ where }),
    prisma.eventCategory.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  return {
    data: rows.map(toDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function createEventCategory(
  input: CreateEventCategoryInput,
  actorId: string | null,
): Promise<EventCategoryDto> {
  const name = requireName(input.name);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(name, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  try {
    const category = await prisma.eventCategory.create({
      data: { name, slug },
    });
    await recordAudit({
      actorId,
      action: 'event-category.created',
      entityType: ENTITY_TYPE,
      entityId: category.id,
      metadata: { slug: category.slug },
    });
    return toDto(category);
  } catch (error) {
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
}

export async function updateEventCategory(
  id: string,
  input: UpdateEventCategoryInput,
  actorId: string | null,
): Promise<EventCategoryDto> {
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing) throw notFound('Event category not found.');

  const data: Prisma.EventCategoryUncheckedUpdateInput = {};
  if ('name' in input) data.name = requireName(input.name);
  if (input.slug !== undefined && input.slug !== null) {
    if (typeof input.slug !== 'string') {
      throw validation('"slug" must be a string.', { field: 'slug' });
    }
    data.slug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
  }

  try {
    const category = await prisma.eventCategory.update({
      where: { id },
      data,
    });
    await recordAudit({
      actorId,
      action: 'event-category.updated',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: { slug: category.slug },
    });
    return toDto(category);
  } catch (error) {
    if (typeof data.slug === 'string' && isSlugUniqueViolation(error)) {
      throw slugTaken(data.slug);
    }
    throw error;
  }
}