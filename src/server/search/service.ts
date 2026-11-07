/**
 * Public content search (Phase 8, docs/08 §20, docs/10 §20).
 *
 * The first implementation runs on PostgreSQL with case-insensitive `contains`
 * filters (`ILIKE` under Prisma's `mode: 'insensitive'`). Only `published`
 * rows from sermons, events, ministries and pages are searched; drafts and
 * every other lifecycle state are invisible.
 *
 * The response is a single unified list where each row identifies its content
 * type, matching the documented example in docs/08 §20. Pagination is applied
 * after a deterministic merge; at the current content volume an in-memory
 * merge is simpler and exact, and the endpoint can later move to `tsvector`
 * without changing the contract.
 */
import type { PaginationMeta } from '@shared/api';
import type {
  SearchQuery,
  SearchResultDto,
  SearchResultType,
} from '@shared/search';
import {
  paginationOffset,
  resolvePagination,
  totalPages,
} from '@shared/query';
import { prisma } from '../db';
import { validation } from '../cms/errors';

const MAX_QUERY_LENGTH = 200;

const TYPE_ORDER: Record<SearchResultType, number> = {
  SERMON: 0,
  EVENT: 1,
  MINISTRY: 2,
  PAGE: 3,
};

function parseTerm(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('"q" is required and must not be blank.', { field: 'q' });
  }
  const term = value.trim();
  if (term.length > MAX_QUERY_LENGTH) {
    throw validation(`"q" must be at most ${MAX_QUERY_LENGTH} characters.`, {
      field: 'q',
    });
  }
  // PostgreSQL rejects NUL bytes in text parameters; treat them as invalid
  // input instead of letting the driver surface a 500.
  if (term.includes('\u0000')) {
    throw validation('"q" must not contain null characters.', { field: 'q' });
  }
  return term;
}

/**
 * Escape SQL LIKE metacharacters so a user query matches them literally.
 * PostgreSQL's default LIKE escape character is the backslash, and Prisma
 * parameterizes the value, so escaping here is sufficient (docs/10 §20).
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.length > 0) return text;
    }
  }
  return null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function compareResults(a: SearchResultDto, b: SearchResultDto): number {
  const aTime = a.publishedAt ? Date.parse(a.publishedAt) : Number.NEGATIVE_INFINITY;
  const bTime = b.publishedAt ? Date.parse(b.publishedAt) : Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return bTime - aTime;

  const aTitle = a.title.toLowerCase();
  const bTitle = b.title.toLowerCase();
  if (aTitle < bTitle) return -1;
  if (aTitle > bTitle) return 1;

  const typeDelta = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  if (typeDelta !== 0) return typeDelta;

  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export interface SearchResults {
  data: SearchResultDto[];
  meta: PaginationMeta;
}

export async function searchPublicContent(
  query: SearchQuery,
): Promise<SearchResults> {
  const term = parseTerm(query.q);
  const { page, limit } = resolvePagination(query.page, query.limit);

  const contains = {
    contains: escapeLikePattern(term),
    mode: 'insensitive',
  } as const;

  const [sermons, events, ministries, pages] = await Promise.all([
    prisma.sermon.findMany({
      where: {
        status: 'published',
        OR: [{ title: contains }, { description: contains }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.event.findMany({
      where: {
        status: 'published',
        OR: [
          { title: contains },
          { summary: contains },
          { description: contains },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        description: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.ministry.findMany({
      where: {
        status: 'published',
        OR: [
          { name: contains },
          { shortDescription: contains },
          { description: contains },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        shortDescription: true,
        description: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.page.findMany({
      where: {
        status: 'published',
        OR: [{ title: contains }, { excerpt: contains }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const results: SearchResultDto[] = [
    ...sermons.map((row) => ({
      type: 'SERMON' as const,
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: firstNonEmpty(row.description),
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    ...events.map((row) => ({
      type: 'EVENT' as const,
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: firstNonEmpty(row.summary, row.description),
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    ...ministries.map((row) => ({
      type: 'MINISTRY' as const,
      id: row.id,
      title: row.name,
      slug: row.slug,
      excerpt: firstNonEmpty(row.shortDescription, row.description),
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    ...pages.map((row) => ({
      type: 'PAGE' as const,
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: firstNonEmpty(row.excerpt),
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
  ].sort(compareResults);

  const total = results.length;
  return {
    data: results.slice(
      paginationOffset(page, limit),
      paginationOffset(page, limit) + limit,
    ),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}
