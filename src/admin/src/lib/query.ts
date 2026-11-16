/**
 * Query-string helpers for the admin API client (docs/08 §25–26).
 *
 * Filters arrive from form controls as strings; `buildQuery` drops empty values
 * so an untouched filter never sends `?status=` and never triggers a server
 * validation error. It is pure and shared by every list screen.
 */

export type QueryValue = string | number | boolean | undefined | null;

/** Serialize defined, non-empty values into a leading `?` query string. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Page numbers accepted by the pagination control. The first and last page are
 * always shown, with a small window around the current page; gaps collapse into
 * `null` so the UI can render an ellipsis without inventing page numbers.
 */
export function pageWindow(
  current: number,
  totalPages: number,
  windowSize = 1,
): Array<number | null> {
  if (totalPages <= 0) return [];
  const pages = new Set<number>([1, totalPages]);
  for (
    let page = Math.max(1, current - windowSize);
    page <= Math.min(totalPages, current + windowSize);
    page += 1
  ) {
    pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | null> = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) result.push(null);
    result.push(page);
  });
  return result;
}
