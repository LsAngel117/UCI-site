/**
 * `/robots.txt` — crawl directives for the public site (docs/10 §8).
 *
 * Emitted dynamically so the `Sitemap:` line always points at the real public
 * origin (`SITE_URL` / `Astro.site`) instead of a hardcoded placeholder. The
 * sitemap itself is the dynamic `/sitemap.xml` route proxied from the API.
 */
import type { APIRoute } from 'astro';

const DISALLOWED_PATHS = ['/admin', '/panel', '/api', '/preview'] as const;

export const GET: APIRoute = ({ site, url }) => {
  const origin = (site ?? new URL(url.origin)).href.replace(/\/+$/, '');
  const body = [
    'User-agent: *',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
