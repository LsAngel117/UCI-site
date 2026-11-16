/**
 * Stories service (improvement A2, docs/05 §14, docs/08 §10, docs/11 §9).
 *
 * Stories are the "testimonios" content type. Like events and ministries they
 * have no revision table (docs/05 §32 reserves revisions for important
 * content), so the publication service is wired with the shared null revision
 * store. Every editorial rule — lifecycle transitions, publication, slug
 * uniqueness, optimistic concurrency, audit — is delegated to
 * `src/server/cms/*`; this module only owns Prisma persistence, boundary
 * validation and the cover/SEO side tables.
 *
 * Authorization choice: docs/11 §9 has no `stories.*` vocabulary, so the admin
 * routes reuse the existing `pages.*` permissions (documented in
 * `routes.ts`) instead of growing the canonical permission list.
 */
import type { SeoMetadata, Story } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreateStoryInput,
  PaginationMeta,
  StoryAdminDto,
  StoryListQuery,
  UpdateStoryInput,
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
import {
  generateUniqueSlug,
  requireAvailableSlug,
  type SlugTakenProbe,
} from '../slug';
import { isSlugUniqueViolation } from '../sermons/prisma-errors';

const ENTITY_TYPE = 'STORY';
const COVER_ENTITY_TYPE = 'story';
const COVER_PURPOSE = 'cover';
const SEO_ENTITY_TYPE = 'story';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Core ports (Prisma implementations)
// ---------------------------------------------------------------------------

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.story.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

const storyPublicationStore: PublicationStore<Story> = {
  findById: (id) => prisma.story.findUnique({ where: { id } }),
  listDueForPublish: (now) =>
    prisma.story.findMany({
      where: { status: 'scheduled', publishAt: { lte: now } },
      orderBy: { publishAt: 'asc' },
    }),
  applyLifecycle: async (id, patch: LifecyclePatch) => {
    const data: Prisma.StoryUncheckedUpdateInput = {
      status: patch.status,
      version: patch.version,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishAt !== undefined) data.publishAt = patch.publishAt;
    if (patch.unpublishedAt !== undefined) {
      data.unpublishedAt = patch.unpublishedAt;
    }
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById;
    return prisma.story.update({ where: { id }, data });
  },
  buildSnapshot: (story) => ({
    title: story.title,
    slug: story.slug,
    displayName: story.displayName,
    quote: story.quote,
    fullStory: story.fullStory,
    coverMediaId: story.coverMediaId,
    date: story.date ? story.date.toISOString() : null,
    editorialApproved: story.editorialApproved,
    featured: story.featured,
  }),
};

const publication: PublicationService<Story> = createPublicationService<Story>({
  entityType: ENTITY_TYPE,
  store: storyPublicationStore,
  revisions: createNullRevisionStore(),
});

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toStoryDto(story: Story, seo: SeoMetadata | null): StoryAdminDto {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    displayName: story.displayName,
    quote: story.quote,
    fullStory: story.fullStory,
    coverMediaId: story.coverMediaId,
    date: story.date ? story.date.toISOString() : null,
    editorialApproved: story.editorialApproved,
    featured: story.featured,
    seo: toSeoDto(seo),
    status: story.status,
    version: story.version,
    publishedAt: story.publishedAt ? story.publishedAt.toISOString() : null,
    publishAt: story.publishAt ? story.publishAt.toISOString() : null,
    unpublishedAt: story.unpublishedAt
      ? story.unpublishedAt.toISOString()
      : null,
    createdById: story.createdById,
    updatedById: story.updatedById,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
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
    throw validation(`"${field}" must be an ISO date string or null.`, {
      field,
    });
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

/** Reject a lifecycle `status` on create/update; only explicit actions change it. */
function assertNoDirectStatus(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === 'string' && value.toLowerCase() === 'draft') return;
  throw validation(
    '"status" cannot be set directly; use publish/schedule/archive actions.',
    { field: 'status' },
  );
}

interface StoryContentData {
  title?: string;
  displayName?: string;
  quote?: string;
  fullStory?: string;
  coverMediaId?: string | null;
  date?: Date | null;
  editorialApproved?: boolean;
  featured?: boolean;
}

function contentData(input: {
  title?: unknown;
  displayName?: unknown;
  quote?: unknown;
  fullStory?: unknown;
  coverMediaId?: unknown;
  date?: unknown;
  editorialApproved?: unknown;
  featured?: unknown;
}): StoryContentData {
  const data: StoryContentData = {};
  if (input.title !== undefined) data.title = requireTitle(input.title);
  if (input.displayName !== undefined) {
    data.displayName = requireTitle(input.displayName);
  }
  if (input.quote !== undefined) {
    data.quote = optionalString(input.quote, 'quote') ?? '';
  }
  if (input.fullStory !== undefined) {
    data.fullStory = optionalString(input.fullStory, 'fullStory') ?? '';
  }
  if (input.coverMediaId !== undefined) {
    data.coverMediaId = optionalString(input.coverMediaId, 'coverMediaId');
  }
  if (input.date !== undefined) data.date = optionalDate(input.date, 'date');
  if (input.editorialApproved !== undefined) {
    data.editorialApproved = optionalBool(
      input.editorialApproved,
      'editorialApproved',
    );
  }
  if (input.featured !== undefined) {
    data.featured = optionalBool(input.featured, 'featured');
  }
  return data;
}

/** Validate the cover FK before any write (a missing reference is a 400). */
async function validateReferences(input: {
  coverMediaId?: unknown;
}): Promise<void> {
  if (typeof input.coverMediaId !== 'string') return;
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

/**
 * Keep the cover `MediaReference` in sync with `Story.coverMediaId`. The
 * reference-aware media delete relies on these rows (docs/12 §20).
 */
async function syncCoverReference(
  tx: Tx,
  storyId: string,
  previousId: string | null,
  nextId: string | null | undefined,
): Promise<void> {
  if (nextId === undefined || nextId === previousId) return;
  await tx.mediaReference.deleteMany({
    where: {
      entityType: COVER_ENTITY_TYPE,
      entityId: storyId,
      purpose: COVER_PURPOSE,
    },
  });
  if (nextId) {
    await tx.mediaReference.create({
      data: {
        mediaAssetId: nextId,
        entityType: COVER_ENTITY_TYPE,
        entityId: storyId,
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
  'date',
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

/** Accept `true`/`false` (query strings) as well as booleans. */
function parseBooleanQuery(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw validation(`"${field}" must be true or false.`, { field });
}

async function findStoryOrThrow(id: string): Promise<Story> {
  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) throw notFound('Story not found.');
  return story;
}

export async function listStories(
  query: StoryListQuery,
): Promise<{ data: StoryAdminDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.StoryWhereInput = {};

  if (query.status !== undefined) {
    if (!isContentStatus(query.status)) {
      throw validation('Invalid "status" filter.', { field: 'status' });
    }
    where.status = query.status;
  }
  if (typeof query.author === 'string' && query.author.length > 0) {
    where.createdById = query.author;
  }
  const featured = parseBooleanQuery(query.featured, 'featured');
  if (featured !== undefined) where.featured = featured;

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    const search = query.search.trim();
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
      { quote: { contains: search, mode: 'insensitive' } },
    ];
  }

  const publishedRange = dateRange(query.publishedFrom, query.publishedTo);
  if (publishedRange) where.publishedAt = publishedRange;
  const createdRange = dateRange(query.createdFrom, query.createdTo);
  if (createdRange) where.createdAt = createdRange;

  const requested = resolveSort(query.sort, query.order, LIST_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { createdAt: 'desc' }
  ) as Prisma.StoryOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  const seoByEntity = await loadSeoMap(SEO_ENTITY_TYPE, rows.map((row) => row.id));

  return {
    data: rows.map((row) => toStoryDto(row, seoByEntity.get(row.id) ?? null)),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getStory(id: string): Promise<StoryAdminDto> {
  const story = await findStoryOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  return toStoryDto(story, seo);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createStory(
  input: CreateStoryInput,
  actorId: string | null,
): Promise<StoryAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const title = requireTitle(input.title);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(title, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.story.create({
        data: {
          ...content,
          title,
          slug,
          // Required text defaults keep draft creation forgiving while the
          // editable payload stays partial (admin DTOs always expose strings).
          displayName: content.displayName ?? title,
          quote: content.quote ?? '',
          fullStory: content.fullStory ?? '',
          editorialApproved: content.editorialApproved ?? false,
          featured: content.featured ?? false,
          status: 'draft',
          version: 1,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      if (typeof content.coverMediaId === 'string') {
        await syncCoverReference(tx, created.id, null, content.coverMediaId);
      }
      await upsertSeo(tx, SEO_ENTITY_TYPE, created.id, seoInput);
      return created.id;
    });
  } catch (error) {
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }

  const created = await findStoryOrThrow(createdId);
  const seo = await loadSeo(SEO_ENTITY_TYPE, createdId);
  await recordAudit({
    actorId,
    action: 'story.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toStoryDto(created, seo);
}

export async function updateStory(
  id: string,
  input: UpdateStoryInput,
  actorId: string | null,
): Promise<StoryAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const current = await findStoryOrThrow(id);
  // Throws 409 CONFLICT on a stale version, 400 on a missing/invalid one.
  const nextVersion = assertVersionMatches(current.version, input.version);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  const data: Prisma.StoryUncheckedUpdateInput = {
    ...content,
    version: nextVersion,
    updatedById: actorId,
  };
  let nextSlug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    nextSlug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
    data.slug = nextSlug;
  }

  // Atomic guard: only the row still at `input.version` is updated, so a
  // racing writer turns this into a 409 instead of a silent overwrite.
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.story.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (result.count === 0) {
        throw conflict(
          'The content was modified by someone else. Reload and try again.',
          { expected: current.version, provided: input.version },
        );
      }
      await syncCoverReference(tx, id, current.coverMediaId, content.coverMediaId);
      await upsertSeo(tx, SEO_ENTITY_TYPE, id, seoInput);
    });
  } catch (error) {
    if (nextSlug !== undefined && isSlugUniqueViolation(error)) {
      throw slugTaken(nextSlug);
    }
    throw error;
  }

  const updated = await findStoryOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  await recordAudit({
    actorId,
    action: 'story.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toStoryDto(updated, seo);
}

export async function publishStory(
  id: string,
  actorId: string | null,
): Promise<StoryAdminDto> {
  await publication.publish(id, actorId);
  return getStory(id);
}

export async function scheduleStory(
  id: string,
  publishAt: unknown,
  actorId: string | null,
  timeZone?: string,
): Promise<StoryAdminDto> {
  await publication.schedule(id, publishAt, actorId, timeZone);
  return getStory(id);
}

export async function archiveStory(
  id: string,
  actorId: string | null,
): Promise<StoryAdminDto> {
  await publication.archive(id, actorId);
  return getStory(id);
}

/** Promote scheduled stories whose `publishAt` has passed. */
export function publishDueStories(now: Date): Promise<Story[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as STORY_ENTITY_TYPE };
