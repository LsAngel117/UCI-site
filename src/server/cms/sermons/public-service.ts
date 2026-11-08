/**
 * Public Sermons service (Phase 5B, docs/08 §11.1–11.2, docs/10 §5–6, §11).
 *
 * The public API is a read-only projection of the editorial domain. It is
 * intentionally separate from the admin service because its invariants are
 * different and strict:
 *
 *   - only `status = published` rows are ever selected (docs/08 §11.2);
 *   - the DTO carries no author, version, lifecycle or storage internals;
 *   - a missing or unpublished slug is the same 404, so drafts cannot be
 *     discovered by guessing slugs (docs/11 §14);
 *   - SEO always resolves to a canonical URL, falling back to the sermon's
 *     own content when no `SeoMetadata` row exists (docs/10 §6.1–6.2);
 *   - related sermons reuse the same published-only visibility rule.
 *
 * The service never mutates state: no audit trail, no revisions, no lifecycle
 * calls. Editorial lifecycle logic stays in the reusable CMS core.
 */
import { Prisma } from '@prisma/client';
import type { SeoMetadata } from '@prisma/client';
import type {
  PaginationMeta,
  PublicSermonDetailDto,
  PublicSermonDto,
  PublicSermonListQuery,
  PublicSermonSeoDto,
  PublicSermonSortField,
  SermonContent,
} from '@shared/cms';
import { PUBLIC_SERMON_SORT_FIELDS } from '@shared/cms';
import {
  isSortOrder,
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
  type ResolvedSort,
  type SortOrder,
} from '@shared/query';
import type { MediaStorage } from '../../media/storage';
import { prisma } from '../../db';
import { notFound, validation } from '../errors';

/** Entity type used by `SeoMetadata` rows owned by a sermon (Phase 5A). */
const SEO_ENTITY_TYPE = 'sermon';

/** A deliberately small related set — enough for a detail sidebar. */
const RELATED_LIMIT = 3;

/** Maximum accepted length for free-text public filters. */
const MAX_SEARCH_LENGTH = 200;

/** Relations every public sermon DTO is hydrated from. */
const publicSermonInclude = {
  preacher: { include: { photo: true } },
  series: { include: { cover: true } },
  topics: { include: { topic: true } },
  cover: true,
  notes: true,
} satisfies Prisma.SermonInclude;

type PublicSermonWithRelations = Prisma.SermonGetPayload<{
  include: typeof publicSermonInclude;
}>;

export interface PublicSermonServiceOptions {
  /** Active storage provider — public URLs are derived from `storageKey`. */
  storage: MediaStorage;
  /** Canonical public origin used for SEO fallbacks (docs/10 §6.2). */
  siteUrl: string;
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function publicMediaUrl(
  asset: { storageKey: string } | null,
  storage: MediaStorage,
): string | null {
  return asset ? storage.getPublicUrl(asset.storageKey) : null;
}

function toPublicSermonContent(
  value: Prisma.JsonValue | null,
): SermonContent | null {
  if (value === null) return null;
  return value as SermonContent;
}

/** Make a storage URL absolute for Open Graph consumers (docs/10 §6.2). */
function absoluteUrl(value: string | null, siteUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

/**
 * Build the public SEO projection. An explicit `SeoMetadata` value always
 * wins; otherwise fall back to the sermon's own content and canonical route so
 * the frontend never has to invent a canonical URL.
 */
function toPublicSeo(
  seo: SeoMetadata | null,
  sermon: PublicSermonWithRelations,
  coverImageUrl: string | null,
  siteUrl: string,
): PublicSermonSeoDto {
  return {
    title: seo?.title ?? sermon.title,
    description: seo?.description ?? sermon.description,
    canonicalUrl: seo?.canonicalUrl ?? `${siteUrl}/sermones/${sermon.slug}`,
    ogImageUrl: seo?.ogImageUrl ?? absoluteUrl(coverImageUrl, siteUrl),
  };
}

function toPublicSermonDto(
  sermon: PublicSermonWithRelations,
  seo: SeoMetadata | null,
  options: PublicSermonServiceOptions,
): PublicSermonDto {
  const coverImageUrl = publicMediaUrl(sermon.cover, options.storage);
  const video =
    sermon.videoProvider !== null ||
    sermon.videoExternalId !== null ||
    sermon.videoUrl !== null
      ? {
          provider: sermon.videoProvider ?? 'external',
          externalId: sermon.videoExternalId,
          url: sermon.videoUrl,
        }
      : null;

  return {
    id: sermon.id,
    slug: sermon.slug,
    title: sermon.title,
    description: sermon.description,
    scriptureReference: sermon.scriptureReference,
    scriptureText: sermon.scriptureText,
    preacherName: sermon.preacherName,
    preacher: sermon.preacher
      ? {
          id: sermon.preacher.id,
          displayName: sermon.preacher.displayName,
          role: sermon.preacher.role,
          photoUrl: publicMediaUrl(sermon.preacher.photo, options.storage),
        }
      : null,
    sermonDate: sermon.sermonDate ? sermon.sermonDate.toISOString() : null,
    series: sermon.series
      ? {
          id: sermon.series.id,
          name: sermon.series.name,
          slug: sermon.series.slug,
          coverImageUrl: publicMediaUrl(sermon.series.cover, options.storage),
        }
      : null,
    topics: sermon.topics.map((link) => ({
      id: link.topic.id,
      name: link.topic.name,
      slug: link.topic.slug,
    })),
    coverImageUrl,
    coverImageAlt: sermon.cover?.altText ?? null,
    video,
    audioUrl: sermon.audioUrl,
    notesContent: sermon.notesContent,
    content: toPublicSermonContent(sermon.content),
    notesUrl: publicMediaUrl(sermon.notes, options.storage),
    durationMinutes: sermon.durationMinutes,
    featured: sermon.featured,
    publishedAt: sermon.publishedAt ? sermon.publishedAt.toISOString() : null,
    updatedAt: sermon.updatedAt.toISOString(),
    seo: toPublicSeo(seo, sermon, coverImageUrl, options.siteUrl),
  };
}

// ---------------------------------------------------------------------------
// Query parsing (the public boundary is untrusted)
// ---------------------------------------------------------------------------

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string.`, { field });
  }
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function requiredText(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field);
  if (text !== undefined && text.length > MAX_SEARCH_LENGTH) {
    throw validation(`"${field}" must be at most ${MAX_SEARCH_LENGTH} characters.`, {
      field,
    });
  }
  return text;
}

function parseDateBoundary(value: unknown, field: string): Date | undefined {
  const text = optionalText(value, field);
  if (text === undefined) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be a valid ISO date.`, { field });
  }
  return date;
}

/** Validate sort/order exactly like the media library: provided but invalid → 400. */
function resolvePublicSort(query: PublicSermonListQuery): ResolvedSort | null {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }
  const requested = resolveSort(rawSort, rawOrder, PUBLIC_SERMON_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }
  return requested;
}

function orderByFor(
  requested: ResolvedSort | null,
): Prisma.SermonOrderByWithRelationInput[] {
  // `sermonDate DESC` is the documented default (docs/08 §11.1). Dates are
  // nullable, so nulls are pushed last instead of leading the archive.
  if (requested === null) {
    return [
      { sermonDate: { sort: 'desc', nulls: 'last' } },
      { publishedAt: 'desc' },
      { id: 'asc' },
    ];
  }
  const field = requested.field as PublicSermonSortField;
  const direction: SortOrder = requested.order;
  const primary: Prisma.SermonOrderByWithRelationInput =
    field === 'sermonDate'
      ? { sermonDate: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary, { id: 'asc' }];
}

function publicWhere(query: PublicSermonListQuery): Prisma.SermonWhereInput {
  const where: Prisma.SermonWhereInput = { status: 'published' };
  const and: Prisma.SermonWhereInput[] = [];

  const search = requiredText(query.search, 'search');
  if (search !== undefined) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { preacherName: { contains: search, mode: 'insensitive' } },
        {
          preacher: {
            is: { displayName: { contains: search, mode: 'insensitive' } },
          },
        },
      ],
    });
  }

  const preacher = requiredText(query.preacher, 'preacher');
  if (preacher !== undefined) {
    and.push({
      OR: [
        { preacherName: { contains: preacher, mode: 'insensitive' } },
        {
          preacher: {
            is: { displayName: { contains: preacher, mode: 'insensitive' } },
          },
        },
        { preacherId: preacher },
      ],
    });
  }

  const from = parseDateBoundary(query.from, 'from');
  const to = parseDateBoundary(query.to, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw validation('"from" must be before or equal to "to".', {
      field: 'from',
    });
  }
  if (from || to) {
    where.sermonDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  if (and.length > 0) where.AND = and;
  return where;
}

/** Batch-load SEO rows so listing/related pages never N+1. */
async function loadSeoMap(ids: string[]): Promise<Map<string, SeoMetadata>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.seoMetadata.findMany({
    where: { entityType: SEO_ENTITY_TYPE, entityId: { in: ids } },
  });
  return new Map(rows.map((row) => [row.entityId, row]));
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export async function listPublicSermons(
  query: PublicSermonListQuery,
  options: PublicSermonServiceOptions,
): Promise<{ data: PublicSermonDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where = publicWhere(query);
  const orderBy = orderByFor(resolvePublicSort(query));

  const [total, rows] = await Promise.all([
    prisma.sermon.count({ where }),
    prisma.sermon.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: publicSermonInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) =>
      toPublicSermonDto(row, seoByEntity.get(row.id) ?? null, options),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

async function findRelated(
  sermon: PublicSermonWithRelations,
  options: PublicSermonServiceOptions,
): Promise<PublicSermonDto[]> {
  const or: Prisma.SermonWhereInput[] = [];
  if (sermon.seriesId) or.push({ seriesId: sermon.seriesId });
  const topicIds = sermon.topics.map((link) => link.topicId);
  if (topicIds.length > 0) {
    or.push({ topics: { some: { topicId: { in: topicIds } } } });
  }
  // A standalone sermon with no series and no topics simply has no related
  // published content: skip the query entirely.
  if (or.length === 0) return [];

  const rows = await prisma.sermon.findMany({
    where: {
      status: 'published',
      id: { not: sermon.id },
      OR: or,
    },
    orderBy: orderByFor(null),
    take: RELATED_LIMIT,
    include: publicSermonInclude,
  });
  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));
  return rows.map((row) =>
    toPublicSermonDto(row, seoByEntity.get(row.id) ?? null, options),
  );
}

export async function getPublicSermonBySlug(
  slug: string,
  options: PublicSermonServiceOptions,
): Promise<PublicSermonDetailDto> {
  const sermon = await prisma.sermon.findFirst({
    where: { slug, status: 'published' },
    include: publicSermonInclude,
  });
  // Drafts, scheduled, archived and missing slugs are indistinguishable
  // (docs/11 §14): a 404 must not confirm that an unpublished slug exists.
  if (!sermon) throw notFound('Sermon not found.');

  // Independent lookups: resolve the SEO override and the related set in
  // parallel instead of serializing two round trips on every detail request.
  const [seo, related] = await Promise.all([
    prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: sermon.id },
      },
    }),
    findRelated(sermon, options),
  ]);

  return {
    ...toPublicSermonDto(sermon, seo, options),
    related,
  };
}