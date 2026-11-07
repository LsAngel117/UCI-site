/**
 * Events service (Phase 6A, docs/05 §11–12, docs/08 §12.3).
 *
 * Like sermons, this module is deliberately thin: it implements the core's
 * publication ports with Prisma, validates the boundary payload, keeps the
 * cover `MediaReference` and SEO row in sync, and delegates every editorial
 * rule (lifecycle, publication, slug, concurrency, audit) to
 * `src/server/cms/*`. No lifecycle/publication/slug logic is duplicated.
 *
 * Revisions are intentionally out of scope for Events (docs/05 §32 reserves
 * them for "important content"). `createNullRevisionStore()` satisfies the
 * publication port so the shared orchestration still owns the flow.
 */
import type { Event, EventCategory, SeoMetadata } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreateEventInput,
  EventAdminDto,
  EventCategoryDto,
  EventListQuery,
  PaginationMeta,
  UpdateEventInput,
} from '@shared/cms';
import {
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { isContentStatus } from '@shared/types';
import { prisma } from '../../db';
import { recordAudit } from '../audit';
import { conflict, notFound, slugTaken, validation } from '../errors';
import { assertVersionMatches } from '../lifecycle';
import {
  createNullRevisionStore,
  createPublicationService,
  type LifecyclePatch,
  type PublicationService,
  type PublicationStore,
} from '../publication';
import { loadSeo, loadSeoMap, parseSeoInput, toSeoDto, upsertSeo } from '../seo';
import { generateUniqueSlug, requireAvailableSlug, type SlugTakenProbe } from '../slug';
import { isSlugUniqueViolation } from '../sermons/prisma-errors';

const ENTITY_TYPE = 'EVENT';
const COVER_ENTITY_TYPE = 'event';
const COVER_PURPOSE = 'cover';
const SEO_ENTITY_TYPE = 'event';

const eventInclude = {
  category: true,
} satisfies Prisma.EventInclude;

type EventWithRelations = Prisma.EventGetPayload<{
  include: typeof eventInclude;
}>;

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Core ports (Prisma implementations)
// ---------------------------------------------------------------------------

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.event.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

const eventPublicationStore: PublicationStore<Event> = {
  findById: (id) => prisma.event.findUnique({ where: { id } }),
  listDueForPublish: (now) =>
    prisma.event.findMany({
      where: { status: 'scheduled', publishAt: { lte: now } },
      orderBy: { publishAt: 'asc' },
    }),
  applyLifecycle: async (id, patch: LifecyclePatch) => {
    const data: Prisma.EventUncheckedUpdateInput = {
      status: patch.status,
      version: patch.version,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishAt !== undefined) data.publishAt = patch.publishAt;
    if (patch.unpublishedAt !== undefined) {
      data.unpublishedAt = patch.unpublishedAt;
    }
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById;
    return prisma.event.update({ where: { id }, data });
  },
  buildSnapshot: (event) => ({
    title: event.title,
    slug: event.slug,
    summary: event.summary,
    description: event.description,
    categoryId: event.categoryId,
    startAt: event.startAt ? event.startAt.toISOString() : null,
    endAt: event.endAt ? event.endAt.toISOString() : null,
    locationName: event.locationName,
    address: event.address,
    city: event.city,
    coverMediaId: event.coverMediaId,
    registrationUrl: event.registrationUrl,
    featured: event.featured,
  }),
};

const publication: PublicationService<Event> = createPublicationService<Event>({
  entityType: ENTITY_TYPE,
  store: eventPublicationStore,
  revisions: createNullRevisionStore(),
});

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toEventCategoryDto(category: EventCategory): EventCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function toEventDto(event: EventWithRelations, seo: SeoMetadata | null): EventAdminDto {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    categoryId: event.categoryId,
    category: event.category ? toEventCategoryDto(event.category) : null,
    startAt: event.startAt ? event.startAt.toISOString() : null,
    endAt: event.endAt ? event.endAt.toISOString() : null,
    locationName: event.locationName,
    address: event.address,
    city: event.city,
    coverMediaId: event.coverMediaId,
    registrationUrl: event.registrationUrl,
    featured: event.featured,
    seo: toSeoDto(seo),
    status: event.status,
    publishedAt: event.publishedAt ? event.publishedAt.toISOString() : null,
    publishAt: event.publishAt ? event.publishAt.toISOString() : null,
    version: event.version,
    unpublishedAt: event.unpublishedAt
      ? event.unpublishedAt.toISOString()
      : null,
    createdById: event.createdById,
    updatedById: event.updatedById,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

function requireTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "title" is required.', { field: 'title' });
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an ISO date string or null.`, { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be a valid date.`, { field });
  }
  return date;
}

function optionalBool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw validation(`"${field}" must be a boolean.`, { field });
  }
  return value;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  return value;
}

/**
 * Reject an explicit lifecycle `status` on a generic create/update body: state
 * changes are business actions (`publish`/`schedule`/`archive`), never plain
 * editorial fields (docs/08 §22). The only accepted value is `'draft'`
 * (case-insensitive), which matches the canonical create default; an omitted
 * value is a no-op. Any other provided value is a 400 before any write, so a
 * rejected payload leaves stored data untouched.
 */
function assertNoDirectStatus(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === 'string' && value.toLowerCase() === 'draft') return;
  throw validation(
    '"status" cannot be set directly; use publish/schedule/archive actions.',
    { field: 'status' },
  );
}

interface EventContentData {
  title?: string;
  summary?: string | null;
  description?: string | null;
  categoryId?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  locationName?: string | null;
  address?: string | null;
  city?: string | null;
  coverMediaId?: string | null;
  registrationUrl?: string | null;
  featured?: boolean;
}

/** Build the content columns from any provided editorial fields. */
function contentData(input: {
  title?: unknown;
  summary?: unknown;
  description?: unknown;
  categoryId?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  locationName?: unknown;
  address?: unknown;
  city?: unknown;
  coverMediaId?: unknown;
  registrationUrl?: unknown;
  featured?: unknown;
}): EventContentData {
  const data: EventContentData = {};
  if (input.title !== undefined) data.title = requireTitle(input.title);
  if (input.summary !== undefined) {
    data.summary = optionalString(input.summary, 'summary');
  }
  if (input.description !== undefined) {
    data.description = optionalString(input.description, 'description');
  }
  if (input.categoryId !== undefined) {
    data.categoryId = optionalString(input.categoryId, 'categoryId');
  }
  if (input.startAt !== undefined) {
    data.startAt = optionalDate(input.startAt, 'startAt');
  }
  if (input.endAt !== undefined) data.endAt = optionalDate(input.endAt, 'endAt');
  if (input.locationName !== undefined) {
    data.locationName = optionalString(input.locationName, 'locationName');
  }
  if (input.address !== undefined) {
    data.address = optionalString(input.address, 'address');
  }
  if (input.city !== undefined) data.city = optionalString(input.city, 'city');
  if (input.coverMediaId !== undefined) {
    data.coverMediaId = optionalString(input.coverMediaId, 'coverMediaId');
  }
  if (input.registrationUrl !== undefined) {
    data.registrationUrl = optionalUrl(
      input.registrationUrl,
      'registrationUrl',
    );
  }
  if (input.featured !== undefined) {
    data.featured = optionalBool(input.featured, 'featured');
  }
  return data;
}

/** Validate every FK a create/update provides before any write. */
async function validateReferences(input: {
  categoryId?: unknown;
  coverMediaId?: unknown;
}): Promise<void> {
  if (typeof input.categoryId === 'string') {
    const found = await prisma.eventCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!found) {
      throw validation('The referenced event category does not exist.', {
        field: 'categoryId',
      });
    }
  }
  if (typeof input.coverMediaId === 'string') {
    const found = await prisma.mediaAsset.findUnique({
      where: { id: input.coverMediaId },
      select: { id: true },
    });
    if (!found) {
      throw validation('The referenced media asset does not exist.', {
        field: 'coverMediaId',
      });
    }
  }
}

/**
 * Keep the cover `MediaReference` in sync with `Event.coverMediaId`. The
 * relation is rewritten only when the cover actually changed; clearing the
 * cover removes every `cover`-purpose row for the event.
 */
async function syncCoverReference(
  tx: Tx,
  eventId: string,
  previousId: string | null,
  nextId: string | null | undefined,
): Promise<void> {
  if (nextId === undefined || nextId === previousId) return;
  await tx.mediaReference.deleteMany({
    where: {
      entityType: COVER_ENTITY_TYPE,
      entityId: eventId,
      purpose: COVER_PURPOSE,
    },
  });
  if (nextId) {
    await tx.mediaReference.create({
      data: {
        mediaAssetId: nextId,
        entityType: COVER_ENTITY_TYPE,
        entityId: eventId,
        purpose: COVER_PURPOSE,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'publishedAt',
  'startAt',
  'title',
] as const;

function dateRange(
  from: unknown,
  to: unknown,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (typeof from === 'string' && from.length > 0) {
    const date = new Date(from);
    if (Number.isNaN(date.getTime())) throw validation('Invalid date filter.');
    range.gte = date;
  }
  if (typeof to === 'string' && to.length > 0) {
    const date = new Date(to);
    if (Number.isNaN(date.getTime())) throw validation('Invalid date filter.');
    range.lte = date;
  }
  return range.gte === undefined && range.lte === undefined ? undefined : range;
}

async function findEventOrThrow(id: string): Promise<EventWithRelations> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: eventInclude,
  });
  if (!event) throw notFound('Event not found.');
  return event;
}

export async function listEvents(
  query: EventListQuery,
): Promise<{ data: EventAdminDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.EventWhereInput = {};

  if (query.status !== undefined) {
    if (!isContentStatus(query.status)) {
      throw validation('Invalid "status" filter.', { field: 'status' });
    }
    where.status = query.status;
  }
  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { summary: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (typeof query.categoryId === 'string' && query.categoryId.length > 0) {
    where.categoryId = query.categoryId;
  }
  const publishedRange = dateRange(query.publishedFrom, query.publishedTo);
  if (publishedRange) where.publishedAt = publishedRange;
  const startRange = dateRange(query.startFrom, query.startTo);
  if (startRange) where.startAt = startRange;

  const requested = resolveSort(query.sort, query.order, LIST_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { createdAt: 'desc' }
  ) as Prisma.EventOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: eventInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(
    SEO_ENTITY_TYPE,
    rows.map((row) => row.id),
  );

  return {
    data: rows.map((row) => toEventDto(row, seoByEntity.get(row.id) ?? null)),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getEvent(id: string): Promise<EventAdminDto> {
  const event = await findEventOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  return toEventDto(event, seo);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createEvent(
  input: CreateEventInput,
  actorId: string | null,
): Promise<EventAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const title = requireTitle(input.title);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(title, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const content = contentData(input);
  // Validate the whole payload (including `seo`) before touching the database,
  // so a rejected payload leaves no partial row behind (docs/08 §30).
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          ...content,
          title,
          slug,
          status: 'draft',
          version: 1,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      if (content.coverMediaId) {
        await syncCoverReference(tx, created.id, null, content.coverMediaId);
      }
      await upsertSeo(tx, SEO_ENTITY_TYPE, created.id, seoInput);
      return created.id;
    });
  } catch (error) {
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }

  const created = await findEventOrThrow(createdId);
  const seo = await loadSeo(SEO_ENTITY_TYPE, createdId);
  await recordAudit({
    actorId,
    action: 'event.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toEventDto(created, seo);
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  actorId: string | null,
): Promise<EventAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const current = await findEventOrThrow(id);
  const nextVersion = assertVersionMatches(current.version, input.version);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  const data: Prisma.EventUncheckedUpdateInput = {
    ...content,
    version: nextVersion,
    updatedById: actorId,
  };
  let nextSlug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    nextSlug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
    data.slug = nextSlug;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.event.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (result.count === 0) {
        throw conflict(
          'The content was modified by someone else. Reload and try again.',
          { expected: current.version, provided: input.version },
        );
      }
      await syncCoverReference(
        tx,
        id,
        current.coverMediaId,
        content.coverMediaId,
      );
      await upsertSeo(tx, SEO_ENTITY_TYPE, id, seoInput);
    });
  } catch (error) {
    if (nextSlug !== undefined && isSlugUniqueViolation(error)) {
      throw slugTaken(nextSlug);
    }
    throw error;
  }

  const updated = await findEventOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  await recordAudit({
    actorId,
    action: 'event.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toEventDto(updated, seo);
}

export async function publishEvent(
  id: string,
  actorId: string | null,
): Promise<EventAdminDto> {
  await publication.publish(id, actorId);
  return getEvent(id);
}

export async function scheduleEvent(
  id: string,
  publishAt: unknown,
  actorId: string | null,
): Promise<EventAdminDto> {
  await publication.schedule(id, publishAt, actorId);
  return getEvent(id);
}

export async function archiveEvent(
  id: string,
  actorId: string | null,
): Promise<EventAdminDto> {
  await publication.archive(id, actorId);
  return getEvent(id);
}

/** Promote scheduled events whose `publishAt` has passed. */
export function publishDueEvents(now: Date): Promise<Event[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as EVENT_ENTITY_TYPE };