/**
 * Safe query-parameter helpers for collection endpoints (docs/08 §25–27).
 *
 * The sort resolver below is the security boundary for sorting: it only ever
 * returns fields present in an explicit allowlist, so a client-supplied `sort`
 * value can never be interpolated into SQL/Prisma as arbitrary input
 * (docs/08 §26: "Clients must not be able to inject arbitrary SQL expressions
 * through sorting parameters").
 */

export type SortOrder = 'asc' | 'desc';

export interface ResolvedSort {
  /** Guaranteed to be one of the caller-provided `allowedFields`. */
  field: string;
  order: SortOrder;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** True for the two supported sort directions. */
export function isSortOrder(value: unknown): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

/**
 * Resolve a client sort request against an allowlist.
 *
 * Returns `null` when no sort is requested (caller uses its default ordering)
 * or when the requested field is not allowed (caller should reject with 400).
 * The returned `field` is always a member of `allowedFields`, so it is safe to
 * use as a Prisma `orderBy` key.
 */
export function resolveSort(
  sort: unknown,
  order: unknown,
  allowedFields: readonly string[],
): ResolvedSort | null {
  if (typeof sort !== 'string' || sort.length === 0) return null;
  if (!allowedFields.includes(sort)) return null;
  const resolvedOrder: SortOrder = order === 'desc' ? 'desc' : 'asc';
  return { field: sort, order: resolvedOrder };
}

export interface ResolvedPagination {
  page: number;
  limit: number;
}

/**
 * Parse `page`/`limit` with sane defaults and a hard maximum `limit`
 * (docs/08 §25: "The API must define a reasonable maximum `limit`").
 * Invalid or missing values fall back to defaults rather than throwing.
 */
export function resolvePagination(
  page: unknown,
  limit: unknown,
): ResolvedPagination {
  const parsedPage = typeof page === 'string' ? Number(page) : Number(page);
  const parsedLimit = typeof limit === 'string' ? Number(limit) : Number(limit);

  const resolvedPage =
    Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : DEFAULT_PAGE;

  let resolvedLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1
    ? parsedLimit
    : DEFAULT_LIMIT;
  if (resolvedLimit > MAX_LIMIT) resolvedLimit = MAX_LIMIT;

  return { page: resolvedPage, limit: resolvedLimit };
}

/** Offset implied by a resolved pagination (for `skip` in Prisma queries). */
export function paginationOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** Total pages implied by a total count and page size (matches docs/08 §25). */
export function totalPages(total: number, limit: number): number {
  return limit > 0 ? Math.ceil(total / limit) : 0;
}
