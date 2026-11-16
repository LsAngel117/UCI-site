/**
 * Shared public-search contracts (Phase 8, docs/08 §20, docs/10 §20).
 *
 * The public search endpoint returns a single unified list where every row
 * identifies its content type, matching the documented example in docs/08 §20.
 * Only published content is ever searchable.
 */
import type { PaginationMeta, PaginationParams } from './api';

export const SEARCH_RESULT_TYPES = [
  'SERMON',
  'EVENT',
  'MINISTRY',
  'PAGE',
] as const;

export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

/** One public search hit. Carries no editorial or storage internals. */
export interface SearchResultDto {
  type: SearchResultType;
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** Query shape of `GET /api/v1/search?q=...`. */
export interface SearchQuery extends PaginationParams {
  /** Required non-blank term, at most 200 characters. */
  q?: string;
}

/** Unified, paginated search response. */
export interface SearchResponse {
  data: SearchResultDto[];
  meta: PaginationMeta;
}
