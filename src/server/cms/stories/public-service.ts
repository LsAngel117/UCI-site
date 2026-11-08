/**
 * Public Stories service (improvement A2, docs/05 §14, docs/10 §5–6).
 *
 * Read-only projection with deliberately strict visibility:
 *
 *   - only `status = published` AND `editorialApproved = true` rows are served
 *     (docs/05 §14: a testimony must be consented/approved to be public);
 *   - drafts, scheduled, archived, unapproved and missing slugs share the same
 *     404 so an unpublished story cannot be discovered by guessing;
 *   - SEO always resolves to a canonical `/historias/:slug` URL, falling back
 *     to the story's own content when no `SeoMetadata` row exists.
 */
import { Prisma } from '@prisma/client';
import type { SeoMetadata } from '@prisma/client';
import type {
  PaginationMeta,
  PublicStoryDetailDto,
  PublicStoryDto,
  PublicStoryListQuery,
  PublicStorySeoDto,
  PublicStorySortField,
} from '@shared/cms';
import { PUBLIC_STORY_SORT_FIELDS } from '@shared/cms';
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

const SEO_ENTITY_TYPE = 'story';
const MAX_SEARCH_LENGTH = 200;

const publicStoryInclude = {
  cover: true,
} satisfies Prisma.StoryInclude;

type PublicStoryWithRelations = Prisma.StoryGetPayload<{
  include: typeof publicStoryInclude;
}>;

export interface PublicStoryServiceOptions {
  storage: MediaStorage;
  siteUrl: string;
}

function publicMediaUrl(
  asset: { storageKey: string } | null,
  storage: MediaStorage,
): string | null {
  return asset ? storage.getPublicUrl(asset.storageKey) : null;
}

function absoluteUrl(value: string | null, siteUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function toPublicSeo(
  seo: SeoMetadata | null,
  story: PublicStoryWithRelations,
  coverImageUrl: string | null,
  siteUrl: string,
): PublicStorySeoDto {
  return {
    title: seo?.title ?? story.title,
    description: seo?.description ?? story.quote,
    canonicalUrl: seo?.canonicalUrl ?? `${siteUrl}/historias/${story.slug}`,
    ogImageUrl: seo?.ogImageUrl ?? absoluteUrl(coverImageUrl, siteUrl),
  };
}

function toPublicStoryDto(
  story: PublicStoryWithRelations,
  seo: SeoMetadata | null,
  options: PublicStoryServiceOptions,
): PublicStoryDto {
  const coverImageUrl = publicMediaUrl(story.cover, options.storage);
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    displayName: story.displayName,
    quote: story.quote,
    fullStory: story.fullStory,
    coverImageUrl,
    coverImageAlt: story.cover?.altText ?? null,
    date: story.date ? story.date.toISOString() : null,
    featured: story.featured,
    publishedAt: story.publishedAt ? story.publishedAt.toISOString() : null,
    updatedAt: story.updatedAt.toISOString(),
    seo: toPublicSeo(seo, story, coverImageUrl, options.siteUrl),
  };
}

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

function resolvePublicSort(query: PublicStoryListQuery): ResolvedSort | null {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }
  const requested = resolveSort(rawSort, rawOrder, PUBLIC_STORY_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }
  return requested;
}

function orderByFor(
  requested: ResolvedSort | null,
): Prisma.StoryOrderByWithRelationInput[] {
  if (requested === null) {
    return [
      { featured: 'desc' },
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { date: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ];
  }
  const field = requested.field as PublicStorySortField;
  const direction: SortOrder = requested.order;
  const primary: Prisma.StoryOrderByWithRelationInput =
    field === 'publishedAt' || field === 'date'
      ? { [field]: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary, { id: 'asc' }];
}

const PUBLISHED_APPROVED = {
  status: 'published',
  editorialApproved: true,
} satisfies Prisma.StoryWhereInput;

function publicWhere(query: PublicStoryListQuery): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = { ...PUBLISHED_APPROVED };
  const search = requiredText(query.search, 'search');
  if (search !== undefined) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
      { quote: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

async function loadSeoMap(ids: string[]): Promise<Map<string, SeoMetadata>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.seoMetadata.findMany({
    where: { entityType: SEO_ENTITY_TYPE, entityId: { in: ids } },
  });
  return new Map(rows.map((row) => [row.entityId, row]));
}

export async function listPublicStories(
  query: PublicStoryListQuery,
  options: PublicStoryServiceOptions,
): Promise<{ data: PublicStoryDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where = publicWhere(query);
  const orderBy = orderByFor(resolvePublicSort(query));

  const [total, rows] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
      include: publicStoryInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) =>
      toPublicStoryDto(row, seoByEntity.get(row.id) ?? null, options),
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getPublicStoryBySlug(
  slug: string,
  options: PublicStoryServiceOptions,
): Promise<PublicStoryDetailDto> {
  const story = await prisma.story.findFirst({
    where: { slug, ...PUBLISHED_APPROVED },
    include: publicStoryInclude,
  });
  if (!story) throw notFound('Story not found.');

  const seo = await prisma.seoMetadata.findUnique({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: story.id },
    },
  });

  return toPublicStoryDto(story, seo, options);
}
