/**
 * Public Ministries service (Phase 6B, docs/08 §13.1–13.2, docs/10 §5–6,
 * docs/11 §14).
 *
 * A read-only projection of the editorial domain, deliberately separate from the
 * admin service because its invariants are stricter:
 *
 *   - only `status = published` rows are selected;
 *   - the DTO carries no author, version, lifecycle or storage internals;
 *   - a missing or unpublished slug is the same 404, so drafts cannot be
 *     discovered by guessing slugs (docs/11 §14);
 *   - SEO always resolves to a canonical `/ministerios/:slug` URL, falling back
 *     to the ministry's own content when no `SeoMetadata` row exists
 *     (docs/10 §6.1–6.2).
 *
 * The service never mutates state. Editorial lifecycle logic stays in the
 * reusable CMS core.
 */
import { Prisma } from '@prisma/client';
import type { SeoMetadata } from '@prisma/client';
import type {
  PaginationMeta,
  PublicMinistryDto,
  PublicMinistryListQuery,
  PublicMinistrySeoDto,
  PublicMinistrySortField,
} from '@shared/cms';
import { PUBLIC_MINISTRY_SORT_FIELDS } from '@shared/cms';
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

/** Entity type used by `SeoMetadata` rows owned by a ministry (Phase 6A). */
const SEO_ENTITY_TYPE = 'ministry';

/** Maximum accepted length for free-text public filters. */
const MAX_SEARCH_LENGTH = 200;

/** Relations every public ministry DTO is hydrated from. */
const publicMinistryInclude = {
  cover: true,
} satisfies Prisma.MinistryInclude;

type PublicMinistryWithRelations = Prisma.MinistryGetPayload<{
  include: typeof publicMinistryInclude;
}>;

export interface PublicMinistryServiceOptions {
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

/** Make a storage URL absolute for Open Graph consumers (docs/10 §6.2). */
function absoluteUrl(value: string | null, siteUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function toPublicSeo(
  seo: SeoMetadata | null,
  ministry: PublicMinistryWithRelations,
  coverImageUrl: string | null,
  siteUrl: string,
): PublicMinistrySeoDto {
  return {
    title: seo?.title ?? ministry.name,
    description:
      seo?.description ??
      ministry.shortDescription ??
      ministry.description,
    canonicalUrl: seo?.canonicalUrl ?? `${siteUrl}/ministerios/${ministry.slug}`,
    ogImageUrl: seo?.ogImageUrl ?? absoluteUrl(coverImageUrl, siteUrl),
  };
}

function toPublicMinistryDto(
  ministry: PublicMinistryWithRelations,
  seo: SeoMetadata | null,
  options: PublicMinistryServiceOptions,
): PublicMinistryDto {
  const coverImageUrl = publicMediaUrl(ministry.cover, options.storage);

  return {
    id: ministry.id,
    slug: ministry.slug,
    name: ministry.name,
    shortDescription: ministry.shortDescription,
    description: ministry.description,
    coverImageUrl,
    coverImageAlt: ministry.cover?.altText ?? null,
    contactEmail: ministry.contactEmail,
    contactPhone: ministry.contactPhone,
    meetingInfo: ministry.meetingInfo,
    ctaLabel: ministry.ctaLabel,
    ctaUrl: ministry.ctaUrl,
    featured: ministry.featured,
    publishedAt: ministry.publishedAt ? ministry.publishedAt.toISOString() : null,
    updatedAt: ministry.updatedAt.toISOString(),
    seo: toPublicSeo(seo, ministry, coverImageUrl, options.siteUrl),
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

/**
 * Parse a documented boolean query flag (`featured`). Accepts the query-string
 * spellings `true`/`false`/`1`/`0` plus real booleans; anything else is a 400
 * rather than a silently ignored filter.
 */
function parseBooleanFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw validation(`"${field}" must be a boolean.`, { field });
}

/** Validate sort/order exactly like the media library: provided but invalid → 400. */
function resolvePublicSort(query: PublicMinistryListQuery): ResolvedSort | null {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }
  const requested = resolveSort(rawSort, rawOrder, PUBLIC_MINISTRY_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }
  return requested;
}

function orderByFor(
  requested: ResolvedSort | null,
): Prisma.MinistryOrderByWithRelationInput[] {
  // Most recently published first, then alphabetical — a stable default for a
  // directory. `publishedAt` is nullable, so nulls are pushed last.
  if (requested === null) {
    return [
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { name: 'asc' },
      { id: 'asc' },
    ];
  }
  const field = requested.field as PublicMinistrySortField;
  const direction: SortOrder = requested.order;
  const primary: Prisma.MinistryOrderByWithRelationInput =
    field === 'publishedAt'
      ? { publishedAt: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary, { id: 'asc' }];
}

function publicWhere(query: PublicMinistryListQuery): Prisma.MinistryWhereInput {
  const where: Prisma.MinistryWhereInput = { status: 'published' };

  const search = requiredText(query.search, 'search');
  if (search !== undefined) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { shortDescription: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const featured = parseBooleanFlag(query.featured, 'featured');
  if (featured !== undefined) where.featured = featured;

  return where;
}

/** Batch-load SEO rows so listing pages never N+1. */
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

export async function listPublicMinistries(
  query: PublicMinistryListQuery,
  options: PublicMinistryServiceOptions,
): Promise<{ data: PublicMinistryDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where = publicWhere(query);
  const orderBy = orderByFor(resolvePublicSort(query));

  const [total, rows] = await Promise.all([
    prisma.ministry.count({ where }),
    prisma.ministry.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: publicMinistryInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) =>
      toPublicMinistryDto(row, seoByEntity.get(row.id) ?? null, options),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getPublicMinistryBySlug(
  slug: string,
  options: PublicMinistryServiceOptions,
): Promise<PublicMinistryDto> {
  const ministry = await prisma.ministry.findFirst({
    where: { slug, status: 'published' },
    include: publicMinistryInclude,
  });
  // Drafts, scheduled, archived and missing slugs are indistinguishable
  // (docs/11 §14): a 404 must not confirm that an unpublished slug exists.
  if (!ministry) throw notFound('Ministry not found.');

  const seo = await prisma.seoMetadata.findUnique({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: ministry.id },
    },
  });

  return toPublicMinistryDto(ministry, seo, options);
}
