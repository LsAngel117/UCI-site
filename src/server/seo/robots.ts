/**
 * robots.txt generation (Phase 8, docs/10 §8).
 *
 * The public site permits crawling of intended content while keeping the
 * administrative, API and preview surfaces out of search results. This is a
 * discovery hint, never a security boundary (docs/10 §8.2): authentication
 * remains the real access control.
 */
const DISALLOWED_PATHS = ['/admin', '/panel', '/api', '/preview'] as const;

/** Render the plain-text robots.txt document for a public origin. */
export function buildRobotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return [
    'User-agent: *',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}
