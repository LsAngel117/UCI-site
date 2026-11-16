/**
 * Public archive query helpers (Phase 9B1).
 *
 * The public listing routes accept a small, documented set of query parameters
 * (docs/08 §11.1, §12.1, §13.1). The API validates them strictly and rejects
 * malformed values, so the SSR route normalizes the untrusted request first:
 * unknown/invalid values are dropped instead of producing a 400 for a visitor.
 *
 * The helpers are pure and deterministic so the pagination/filter contract can
 * be unit-tested without an HTTP server.
 */
import type { PublicSermonListFilters } from '@shared/cms';

/** Default page size for the public archive listings. */
export const ARCHIVE_PAGE_SIZE = 12;

/**
 * Highest page number accepted from a public query string. A page beyond this
 * (or any malformed value) is normalized to page 1 before it reaches the API:
 * an unbounded number would translate into a gigantic `skip` offset and turn
 * an honest archive into a 500/503 (docs/08 §25).
 */
export const MAX_ARCHIVE_PAGE = 10_000;

/** Maximum accepted length of a free-text filter (mirrors the API). */
const MAX_FILTER_LENGTH = 200;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedSermonFilters {
  filters: PublicSermonListFilters;
  page: number;
  limit: number;
  /** True when at least one filter (not pagination) is active. */
  hasFilters: boolean;
}

function trimmed(value: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > MAX_FILTER_LENGTH) return undefined;
  return text;
}

/**
 * Accept an ISO calendar date (`YYYY-MM-DD`) only. A syntactically valid but
 * impossible date (e.g. `2026-02-31`) is rejected too, matching the API's
 * promise of a real boundary rather than a silently shifted one.
 */
export function parseIsoDate(value: string | null): string | undefined {
  const text = trimmed(value);
  if (text === undefined || !DATE_PATTERN.test(text)) return undefined;

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return text;
}

/**
 * A page is a positive integer within [1, MAX_ARCHIVE_PAGE]; anything else
 * (negative, zero, non-numeric, non-integer or huge) falls back to page 1.
 * Accepting only decimal digits also rejects `1e9`, `0x10` and decimals that
 * `Number()` would otherwise silently convert into an integer.
 */
export function parsePage(value: string | null): number {
  if (value === null) return 1;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return 1;
  const page = Number(text);
  return page >= 1 && page <= MAX_ARCHIVE_PAGE ? page : 1;
}

/** Normalize the sermon archive request (pagination + documented filters). */
export function parseSermonFilters(
  search: URLSearchParams,
  limit: number = ARCHIVE_PAGE_SIZE,
): ParsedSermonFilters {
  const filters: PublicSermonListFilters = {};

  const query = trimmed(search.get('search'));
  if (query !== undefined) filters.search = query;

  const preacher = trimmed(search.get('preacher'));
  if (preacher !== undefined) filters.preacher = preacher;

  const from = parseIsoDate(search.get('from'));
  if (from !== undefined) filters.from = from;

  const to = parseIsoDate(search.get('to'));
  if (to !== undefined) filters.to = to;

  return {
    filters,
    page: parsePage(search.get('page')),
    limit,
    hasFilters: Object.keys(filters).length > 0,
  };
}

/**
 * Build a listing href while preserving the active filters. Canonical/sort
 * parameters are intentionally not part of the UI contract; page 1 is the
 * clean base URL, and only later pages add `page`.
 */
export function buildArchiveHref(
  basePath: string,
  search: URLSearchParams,
  page: number,
): string {
  const params = new URLSearchParams(search);
  params.delete('page');
  if (Number.isInteger(page) && page > 1) {
    params.set('page', String(page));
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}
