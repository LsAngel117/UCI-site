/**
 * Cache-Control policy shared by the Astro SSR site and the Fastify API/panel
 * (Phase 12C, docs/15 §18.9).
 *
 * The two runtimes serve different things from the same origin topology, so
 * the policy lives in one dependency-free module:
 *
 *   - HTML documents are always revalidated (`no-cache, must-revalidate`) so a
 *     deployment or editorial change is picked up on the next navigation;
 *   - hashed build assets and `/media` uploads are immutable and may be cached
 *     for a year (their URLs change when their bytes change);
 *   - every `/api/` response is `no-store`: some of them are authenticated and
 *     a shared cache must never retain them;
 *   - discovery documents keep their existing short public windows.
 *
 * Route handlers may still set a more specific `Cache-Control`; both runtimes
 * only stamp this policy when the header is absent.
 */

export const CACHE_CONTROL = {
  HTML: 'no-cache, must-revalidate',
  STATIC: 'public, max-age=31536000, immutable',
  MEDIA: 'public, max-age=31536000, immutable',
  API: 'no-store',
  SITEMAP: 'public, max-age=300, s-maxage=300',
  ROBOTS: 'public, max-age=3600',
} as const;

export interface CachePolicyInput {
  /** Request pathname without the query string (e.g. `/panel/login`). */
  pathname: string;
  /** Response `Content-Type`, if known. */
  contentType?: string | null;
}

/** Return the Cache-Control value for a response, or `null` to leave it alone. */
export function cacheControlFor(input: CachePolicyInput): string | null {
  const pathname = input.pathname.split('?')[0] || '/';

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return CACHE_CONTROL.API;
  }
  if (pathname === '/sitemap.xml') return CACHE_CONTROL.SITEMAP;
  if (pathname === '/robots.txt') return CACHE_CONTROL.ROBOTS;

  if (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/panel/assets/') ||
    pathname === '/_image' ||
    pathname.startsWith('/favicon')
  ) {
    return CACHE_CONTROL.STATIC;
  }
  if (pathname === '/media' || pathname.startsWith('/media/')) {
    return CACHE_CONTROL.MEDIA;
  }

  const contentType = (input.contentType ?? '').toLowerCase();
  if (contentType.includes('text/html')) return CACHE_CONTROL.HTML;

  return null;
}

/** Stamp the policy onto a `Headers` object unless the route already decided. */
export function applyCacheControl(
  headers: Headers,
  input: CachePolicyInput,
): void {
  const value = cacheControlFor(input);
  if (value !== null && !headers.has('cache-control')) {
    headers.set('Cache-Control', value);
  }
}
