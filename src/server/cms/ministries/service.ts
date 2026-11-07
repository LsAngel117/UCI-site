/**
 * Ministries service (Phase 6A, docs/05 §13, docs/08 §13).
 *
 * Mirrors the Events consumer of the CMS core: boundary validation, cover
 * `MediaReference` sync, SEO upsert and Prisma implementations of the
 * publication ports. Lifecycle/publication/slug/concurrency/audit rules stay in
 * `src/server/cms/*`.
 *
 * Revisions are intentionally out of scope for Ministries (docs/05 §32); the
 * publication service is wired with the shared null revision store.
 */
import type { Ministry, SeoMetadata } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreateMinistryInput,
  MinistryAdminDto,
  MinistryListQuery,
  PaginationMeta,
  UpdateMinistryInput,
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

const ENTITY_TYPE = 'MINISTRY';
const COVER_ENTITY_TYPE = 'ministry';
const COVER_PURPOSE = 'cover';
const SEO_ENTITY_TYPE = 'ministry';

type Tx = Prisma.TransactionClient;

/**
 * The publication core identifies content by `title` (shared across Sermons and
 * Events). Ministries name that column `name`, so the adapter projects it as
 * `title` for the core without changing the persisted model.
 */
interface PublishableMinistry extends Ministry {
  readonly title: string;
}

function publishable(ministry: Ministry): PublishableMinistry {
  return { ...ministry, title: ministry.name };
}

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.ministry.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

const ministryPublicationStore: PublicationStore<PublishableMinistry> = {
  findById: async (id) => {
    const ministry = await prisma.ministry.findUnique({ where: { id } });
    return ministry ? publishable(ministry) : null;
  },
  listDueForPublish: async (now) => {
    const rows = await prisma.ministry.findMany({
      where: { status: 'scheduled', publishAt: { lte: now } },
      orderBy: { publishAt: 'asc' },
    });
    return rows.map(publishable);
  },
  applyLifecycle: async (id, patch: LifecyclePatch) => {
    const data: Prisma.MinistryUncheckedUpdateInput = {
      status: patch.status,
      version: patch.version,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishAt !== undefined) data.publishAt = patch.publishAt;
    if (patch.unpublishedAt !== undefined) {
      data.unpublishedAt = patch.unpublishedAt;
    }
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById;
    const updated = await prisma.ministry.update({ where: { id }, data });
    return publishable(updated);
  },
  buildSnapshot: (ministry) => ({
    name: ministry.name,
    slug: ministry.slug,
    shortDescription: ministry.shortDescription,
    description: ministry.description,
    coverMediaId: ministry.coverMediaId,
    contactEmail: ministry.contactEmail,
    contactPhone: ministry.contactPhone,
    meetingInfo: ministry.meetingInfo,
    ctaLabel: ministry.ctaLabel,
    ctaUrl: ministry.ctaUrl,
    featured: ministry.featured,
  }),
};

const publication: PublicationService<PublishableMinistry> =
  createPublicationService<PublishableMinistry>({
    entityType: ENTITY_TYPE,
    store: ministryPublicationStore,
    revisions: createNullRevisionStore(),
  });

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toMinistryDto(
  ministry: Ministry,
  seo: SeoMetadata | null,
): MinistryAdminDto {
  return {
    id: ministry.id,
    slug: ministry.slug,
    name: ministry.name,
    shortDescription: ministry.shortDescription,
    description: ministry.description,
    coverMediaId: ministry.coverMediaId,
    contactEmail: ministry.contactEmail,
    contactPhone: ministry.contactPhone,
    meetingInfo: ministry.meetingInfo,
    ctaLabel: ministry.ctaLabel,
    ctaUrl: ministry.ctaUrl,
    featured: ministry.featured,
    seo: toSeoDto(seo),
    status: ministry.status,
    publishedAt: ministry.publishedAt
      ? ministry.publishedAt.toISOString()
      : null,
    publishAt: ministry.publishAt ? ministry.publishAt.toISOString() : null,
    version: ministry.version,
    unpublishedAt: ministry.unpublishedAt
      ? ministry.unpublishedAt.toISOString()
      : null,
    createdById: ministry.createdById,
    updatedById: ministry.updatedById,
    createdAt: ministry.createdAt.toISOString(),
    updatedAt: ministry.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "name" is required.', { field: 'name' });
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

interface MinistryContentData {
  name?: string;
  shortDescription?: string | null;
  description?: string | null;
  coverMediaId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  meetingInfo?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  featured?: boolean;
}

function contentData(input: {
  name?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  coverMediaId?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  meetingInfo?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  featured?: unknown;
}): MinistryContentData {
  const data: MinistryContentData = {};
  if (input.name !== undefined) data.name = requireName(input.name);
  if (input.shortDescription !== undefined) {
    data.shortDescription = optionalString(
      input.shortDescription,
      'shortDescription',
    );
  }
  if (input.description !== undefined) {
    data.description = optionalString(input.description, 'description');
  }
  if (input.coverMediaId !== undefined) {
    data.coverMediaId = optionalString(input.coverMediaId, 'coverMediaId');
  }
  if (input.contactEmail !== undefined) {
    data.contactEmail = optionalString(input.contactEmail, 'contactEmail');
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = optionalString(input.contactPhone, 'contactPhone');
  }
  if (input.meetingInfo !== undefined) {
    data.meetingInfo = optionalString(input.meetingInfo, 'meetingInfo');
  }
  if (input.ctaLabel !== undefined) {
    data.ctaLabel = optionalString(input.ctaLabel, 'ctaLabel');
  }
  if (input.ctaUrl !== undefined) {
    data.ctaUrl = optionalUrl(input.ctaUrl, 'ctaUrl');
  }
  if (input.featured !== undefined) {
    data.featured = optionalBool(input.featured, 'featured');
  }
  return data;
}

async function validateReferences(input: { coverMediaId?: unknown }): Promise<void> {
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

async function syncCoverReference(
  tx: Tx,
  ministryId: string,
  previousId: string | null,
  nextId: string | null | undefined,
): Promise<void> {
  if (nextId === undefined || nextId === previousId) return;
  await tx.mediaReference.deleteMany({
    where: {
      entityType: COVER_ENTITY_TYPE,
      entityId: ministryId,
      purpose: COVER_PURPOSE,
    },
  });
  if (nextId) {
    await tx.mediaReference.create({
      data: {
        mediaAssetId: nextId,
        entityType: COVER_ENTITY_TYPE,
        entityId: ministryId,
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
  'name',
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

async function findMinistryOrThrow(id: string): Promise<Ministry> {
  const ministry = await prisma.ministry.findUnique({ where: { id } });
  if (!ministry) throw notFound('Ministry not found.');
  return ministry;
}

export async function listMinistries(
  query: MinistryListQuery,
): Promise<{ data: MinistryAdminDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.MinistryWhereInput = {};

  if (query.status !== undefined) {
    if (!isContentStatus(query.status)) {
      throw validation('Invalid "status" filter.', { field: 'status' });
    }
    where.status = query.status;
  }
  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { shortDescription: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const publishedRange = dateRange(query.publishedFrom, query.publishedTo);
  if (publishedRange) where.publishedAt = publishedRange;

  const requested = resolveSort(query.sort, query.order, LIST_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { createdAt: 'desc' }
  ) as Prisma.MinistryOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.ministry.count({ where }),
    prisma.ministry.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  const seoByEntity = await loadSeoMap(
    SEO_ENTITY_TYPE,
    rows.map((row) => row.id),
  );

  return {
    data: rows.map((row) =>
      toMinistryDto(row, seoByEntity.get(row.id) ?? null),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getMinistry(id: string): Promise<MinistryAdminDto> {
  const ministry = await findMinistryOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  return toMinistryDto(ministry, seo);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createMinistry(
  input: CreateMinistryInput,
  actorId: string | null,
): Promise<MinistryAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const name = requireName(input.name);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(name, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.ministry.create({
        data: {
          ...content,
          name,
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

  const created = await findMinistryOrThrow(createdId);
  const seo = await loadSeo(SEO_ENTITY_TYPE, createdId);
  await recordAudit({
    actorId,
    action: 'ministry.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toMinistryDto(created, seo);
}

export async function updateMinistry(
  id: string,
  input: UpdateMinistryInput,
  actorId: string | null,
): Promise<MinistryAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const current = await findMinistryOrThrow(id);
  const nextVersion = assertVersionMatches(current.version, input.version);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  const data: Prisma.MinistryUncheckedUpdateInput = {
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
      const result = await tx.ministry.updateMany({
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

  const updated = await findMinistryOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  await recordAudit({
    actorId,
    action: 'ministry.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toMinistryDto(updated, seo);
}

export async function publishMinistry(
  id: string,
  actorId: string | null,
): Promise<MinistryAdminDto> {
  await publication.publish(id, actorId);
  return getMinistry(id);
}

export async function scheduleMinistry(
  id: string,
  publishAt: unknown,
  actorId: string | null,
): Promise<MinistryAdminDto> {
  await publication.schedule(id, publishAt, actorId);
  return getMinistry(id);
}

export async function archiveMinistry(
  id: string,
  actorId: string | null,
): Promise<MinistryAdminDto> {
  await publication.archive(id, actorId);
  return getMinistry(id);
}

/** Promote scheduled ministries whose `publishAt` has passed. */
export function publishDueMinistries(now: Date): Promise<Ministry[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as MINISTRY_ENTITY_TYPE };