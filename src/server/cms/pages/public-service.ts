/**
 * Public Pages service (Phase 7B, docs/08 §10.1–10.2, docs/10 §5–6, §11.14).
 *
 * A read-only projection of the editorial page domain. Its invariants are
 * different from the admin service and strict:
 *
 *   - only `status = published` rows are ever selected (docs/08 §10.1–10.2);
 *   - the DTO carries no author, version, lifecycle, status or storage
 *     internals; the listing omits the structured body to stay small;
 *   - drafts, scheduled, archived and missing slugs share the same 404 so an
 *     unpublished slug cannot be discovered by guessing (docs/11 §14);
 *   - SEO always resolves to a canonical `{siteUrl}/{slug}` URL, falling back
 *     to the page's own content when no `SeoMetadata` row exists
 *     (docs/10 §6.1–6.2);
 *   - when a published page changed slug, the old slug's 404 carries
 *     `details.redirectTo` (rooted destination path) so the Phase 9 HTTP layer
 *     — or a client — can redirect without a second lookup (docs/10 §5.4).
 *
 * The service never mutates state. Editorial lifecycle logic stays in the
 * reusable CMS core.
 */
import { Prisma } from '@prisma/client';
import type { SeoMetadata } from '@prisma/client';
import type {
  PageContent,
  PaginationMeta,
  PublicPageDetailDto,
  PublicPageDto,
  PublicPageListQuery,
  PublicPageSeoDto,
  PublicPageSortField,
} from '@shared/cms';
import { PUBLIC_PAGE_SORT_FIELDS } from '@shared/cms';
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
import { findRedirect } from '../redirects/service';

/** Entity type used by `SeoMetadata` rows owned by a page (Phase 7A). */
const SEO_ENTITY_TYPE = 'page';

/** Maximum accepted length for free-text public filters. */
const MAX_SEARCH_LENGTH = 200;

/** Relations every public page DTO is hydrated from. */
const publicPageInclude = {
  cover: true,
} satisfies Prisma.PageInclude;

type PublicPageWithRelations = Prisma.PageGetPayload<{
  include: typeof publicPageInclude;
}>;

export interface PublicPageServiceOptions {
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

function toPageContent(value: Prisma.JsonValue | null): PageContent | null {
  if (value === null) return null;
  return value as PageContent;
}

/**
 * Build the public SEO projection. An explicit `SeoMetadata` value always
 * wins; otherwise fall back to the page's own content and canonical route so
 * the frontend never has to invent a canonical URL.
 */
function toPublicSeo(
  seo: SeoMetadata | null,
  page: PublicPageWithRelations,
  coverImageUrl: string | null,
  siteUrl: string,
): PublicPageSeoDto {
  return {
    title: seo?.title ?? page.title,
    description: seo?.description ?? page.excerpt,
    canonicalUrl: seo?.canonicalUrl ?? `${siteUrl}/${page.slug}`,
    ogImageUrl: seo?.ogImageUrl ?? absoluteUrl(coverImageUrl, siteUrl),
  };
}

function toPublicPageDto(
  page: PublicPageWithRelations,
  seo: SeoMetadata | null,
  options: PublicPageServiceOptions,
): PublicPageDto {
  const coverImageUrl = publicMediaUrl(page.cover, options.storage);

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    excerpt: page.excerpt,
    coverImageUrl,
    coverImageAlt: page.cover?.altText ?? null,
    publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
    updatedAt: page.updatedAt.toISOString(),
    seo: toPublicSeo(seo, page, coverImageUrl, options.siteUrl),
  };
}

function toPublicPageDetailDto(
  page: PublicPageWithRelations,
  seo: SeoMetadata | null,
  options: PublicPageServiceOptions,
): PublicPageDetailDto {
  return {
    ...toPublicPageDto(page, seo, options),
    content: toPageContent(page.content),
  };
}

/** Turn a stored redirect destination into a rooted path for Phase 9. */
function toRootedPath(path: string): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const rooted = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return rooted.replace(/\/+$/, '') || '/';
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

/** Validate sort/order exactly like the other public collections: invalid → 400. */
function resolvePublicSort(query: PublicPageListQuery): ResolvedSort | null {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }
  const requested = resolveSort(rawSort, rawOrder, PUBLIC_PAGE_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }
  return requested;
}

function orderByFor(
  requested: ResolvedSort | null,
): Prisma.PageOrderByWithRelationInput[] {
  // Most recently published first. `publishedAt` is nullable, so nulls are
  // pushed last; title/id keep the order stable across equal timestamps.
  if (requested === null) {
    return [
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { title: 'asc' },
      { id: 'asc' },
    ];
  }
  const field = requested.field as PublicPageSortField;
  const direction: SortOrder = requested.order;
  const primary: Prisma.PageOrderByWithRelationInput =
    field === 'publishedAt'
      ? { publishedAt: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary, { id: 'asc' }];
}

function publicWhere(query: PublicPageListQuery): Prisma.PageWhereInput {
  const where: Prisma.PageWhereInput = { status: 'published' };
  const search = requiredText(query.search, 'search');
  if (search !== undefined) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { excerpt: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** Batch-load SEO rows so the listing never N+1. */
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

export async function listPublicPages(
  query: PublicPageListQuery,
  options: PublicPageServiceOptions,
): Promise<{ data: PublicPageDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where = publicWhere(query);
  const orderBy = orderByFor(resolvePublicSort(query));

  const [total, rows] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: publicPageInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) =>
      toPublicPageDto(row, seoByEntity.get(row.id) ?? null, options),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getPublicPageBySlug(
  slug: string,
  options: PublicPageServiceOptions,
): Promise<PublicPageDetailDto> {
  const page = await prisma.page.findFirst({
    where: { slug, status: 'published' },
    include: publicPageInclude,
  });

  if (!page) {
    // Redirect foundation (docs/10 §5.4): a 404 for a slug that moved carries
    // the rooted destination so Phase 9 can answer a permanent redirect. A
    // draft/scheduled/archived slug never confirms its existence otherwise.
    const redirect = await findRedirect(slug);
    if (redirect) {
      throw notFound('Page not found.', {
        redirectTo: toRootedPath(redirect.toPath),
      });
    }
    throw notFound('Page not found.');
  }

  const seo = await prisma.seoMetadata.findUnique({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: page.id },
    },
  });

  return toPublicPageDetailDto(page, seo, options);
}
