/**
 * Public Events service (Phase 6B, docs/08 §12.1–12.2, docs/10 §5–6, docs/11 §14).
 *
 * A read-only projection of the editorial domain, deliberately separate from the
 * admin service because its invariants are stricter:
 *
 *   - only `status = published` rows are selected (docs/08 §11.2 analogue);
 *   - the DTO carries no author, version, lifecycle or storage internals;
 *   - a missing or unpublished slug is the same 404, so drafts cannot be
 *     discovered by guessing slugs (docs/11 §14);
 *   - SEO always resolves to a canonical `/eventos/:slug` URL, falling back to
 *     the event's own content when no `SeoMetadata` row exists (docs/10 §6.1–6.2).
 *
 * The service never mutates state: no audit trail, no revisions, no lifecycle
 * calls. Editorial lifecycle logic stays in the reusable CMS core.
 */
import { Prisma } from '@prisma/client';
import type { SeoMetadata } from '@prisma/client';
import type {
  PaginationMeta,
  PublicEventDto,
  PublicEventListQuery,
  PublicEventSeoDto,
  PublicEventSortField,
} from '@shared/cms';
import { PUBLIC_EVENT_SORT_FIELDS } from '@shared/cms';
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

/** Entity type used by `SeoMetadata` rows owned by an event (Phase 6A). */
const SEO_ENTITY_TYPE = 'event';

/** Maximum accepted length for free-text public filters. */
const MAX_SEARCH_LENGTH = 200;

/** Relations every public event DTO is hydrated from. */
const publicEventInclude = {
  category: true,
  cover: true,
} satisfies Prisma.EventInclude;

type PublicEventWithRelations = Prisma.EventGetPayload<{
  include: typeof publicEventInclude;
}>;

export interface PublicEventServiceOptions {
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

/**
 * Build the public SEO projection. An explicit `SeoMetadata` value always wins;
 * otherwise fall back to the event's own content and canonical route so the
 * frontend never has to invent a canonical URL.
 */
function toPublicSeo(
  seo: SeoMetadata | null,
  event: PublicEventWithRelations,
  coverImageUrl: string | null,
  siteUrl: string,
): PublicEventSeoDto {
  return {
    title: seo?.title ?? event.title,
    description: seo?.description ?? event.summary ?? event.description,
    canonicalUrl: seo?.canonicalUrl ?? `${siteUrl}/eventos/${event.slug}`,
    ogImageUrl: seo?.ogImageUrl ?? absoluteUrl(coverImageUrl, siteUrl),
  };
}

function toPublicEventDto(
  event: PublicEventWithRelations,
  seo: SeoMetadata | null,
  options: PublicEventServiceOptions,
): PublicEventDto {
  const coverImageUrl = publicMediaUrl(event.cover, options.storage);

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    category: event.category
      ? {
          id: event.category.id,
          name: event.category.name,
          slug: event.category.slug,
        }
      : null,
    startAt: event.startAt ? event.startAt.toISOString() : null,
    endAt: event.endAt ? event.endAt.toISOString() : null,
    locationName: event.locationName,
    address: event.address,
    city: event.city,
    coverImageUrl,
    coverImageAlt: event.cover?.altText ?? null,
    registrationUrl: event.registrationUrl,
    featured: event.featured,
    publishedAt: event.publishedAt ? event.publishedAt.toISOString() : null,
    updatedAt: event.updatedAt.toISOString(),
    seo: toPublicSeo(seo, event, coverImageUrl, options.siteUrl),
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

/**
 * Parse a documented boolean query flag (`upcoming`, `featured`). Accepts the
 * query-string spellings `true`/`false`/`1`/`0` plus real booleans; anything
 * else is a 400 rather than a silently ignored filter.
 */
function parseBooleanFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw validation(`"${field}" must be a boolean.`, { field });
}

/** Validate sort/order exactly like the media library: provided but invalid → 400. */
function resolvePublicSort(query: PublicEventListQuery): ResolvedSort | null {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }
  const requested = resolveSort(rawSort, rawOrder, PUBLIC_EVENT_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }
  return requested;
}

function orderByFor(
  requested: ResolvedSort | null,
): Prisma.EventOrderByWithRelationInput[] {
  // `startAt ASC` is the documented default (docs/08 §12.1). Dates are
  // nullable, so nulls are pushed last instead of leading the agenda.
  if (requested === null) {
    return [
      { startAt: { sort: 'asc', nulls: 'last' } },
      { publishedAt: 'desc' },
      { id: 'asc' },
    ];
  }
  const field = requested.field as PublicEventSortField;
  const direction: SortOrder = requested.order;
  const primary: Prisma.EventOrderByWithRelationInput =
    field === 'startAt'
      ? { startAt: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary, { id: 'asc' }];
}

function publicWhere(query: PublicEventListQuery): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = { status: 'published' };
  const and: Prisma.EventWhereInput[] = [];

  const category = requiredText(query.category, 'category');
  if (category !== undefined) {
    // Accept either the public slug or the raw id so both consumers work.
    and.push({
      category: { is: { OR: [{ slug: category }, { id: category }] } },
    });
  }

  const from = parseDateBoundary(query.from, 'from');
  const to = parseDateBoundary(query.to, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw validation('"from" must be before or equal to "to".', {
      field: 'from',
    });
  }

  const upcoming = parseBooleanFlag(query.upcoming, 'upcoming');
  let gte = from;
  if (upcoming === true) {
    const now = new Date();
    // The lower bound is the later of `from` and "now" so `upcoming` can never
    // be widened by an earlier `from`.
    gte = gte && gte.getTime() > now.getTime() ? gte : now;
  }
  if (gte || to) {
    where.startAt = {
      ...(gte ? { gte } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  if (and.length > 0) where.AND = and;
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

export async function listPublicEvents(
  query: PublicEventListQuery,
  options: PublicEventServiceOptions,
): Promise<{ data: PublicEventDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where = publicWhere(query);
  const orderBy = orderByFor(resolvePublicSort(query));

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: publicEventInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) =>
      toPublicEventDto(row, seoByEntity.get(row.id) ?? null, options),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getPublicEventBySlug(
  slug: string,
  options: PublicEventServiceOptions,
): Promise<PublicEventDto> {
  const event = await prisma.event.findFirst({
    where: { slug, status: 'published' },
    include: publicEventInclude,
  });
  // Drafts, scheduled, archived and missing slugs are indistinguishable
  // (docs/11 §14): a 404 must not confirm that an unpublished slug exists.
  if (!event) throw notFound('Event not found.');

  const seo = await prisma.seoMetadata.findUnique({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: event.id },
    },
  });

  return toPublicEventDto(event, seo, options);
}
