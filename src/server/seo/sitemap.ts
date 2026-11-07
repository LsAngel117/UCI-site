/**
 * Dynamic XML sitemap (Phase 8, docs/10 §9).
 *
 * Only published, publicly reachable content is listed. Drafts, scheduled,
 * unpublished and archived rows never appear because the query filters on
 * `status = 'published'`. Technical routes (/admin, /panel, /api, /preview,
 * /login) and the public section routes (/sermones, /eventos, /ministerios,
 * /nosotros, /soy-nuevo, /contacto) are never content routes at all, and a
 * page whose slug collides with one of them is deliberately skipped so the
 * sitemap cannot advertise a duplicate canonical URL.
 *
 * A published entity with an editorial `SeoMetadata.canonicalUrl` override is
 * listed at that canonical instead of its default slug route (docs/10 §5.4
 * §9.3).
 *
 * `lastmod` comes from each row's `updatedAt` (docs/10 §9.4); the homepage has
 * no single owning row, so it is emitted without a `lastmod` rather than
 * fabricating one. URLs use the configured `siteUrl` so they are absolute.
 *
 * The `robotsDefault` site setting is a site-wide indexation kill switch: when
 * an administrator disables it, every public page is noindex, so the sitemap
 * is emitted empty instead of advertising pages search engines must ignore.
 */
import { prisma } from '../db';
import { getSiteSeoSettings } from './settings';

/** Technical path prefixes that must never be advertised in the sitemap. */
const RESERVED_SLUGS = new Set([
  'admin',
  'panel',
  'api',
  'preview',
  'login',
  // Public section routes: a page with one of these slugs would duplicate the
  // section's own canonical URL.
  'sermones',
  'eventos',
  'ministerios',
  'nosotros',
  'soy-nuevo',
  'contacto',
]);

/** True when a page slug would collide with a technical or section route. */
export function isReservedSitemapSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Render entries as a standard sitemap 0.9 document (deterministic). */
export function renderSitemap(entries: readonly SitemapEntry[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const entry of entries) {
    const parts = [`<loc>${escapeXml(entry.loc)}</loc>`];
    if (entry.lastmod) {
      parts.push(`<lastmod>${entry.lastmod}</lastmod>`);
    }
    lines.push(`  <url>${parts.join('')}</url>`);
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

interface SitemapRow {
  id: string;
  slug: string;
  updatedAt: Date;
}

const publishedSelect = {
  id: true,
  slug: true,
  updatedAt: true,
} as const;

/**
 * Load the editorial canonical overrides for one entity type (docs/10 §5.4,
 * §9.3). Only absolute http(s) values are honored; any malformed stored value
 * is ignored so the sitemap can never advertise junk.
 */
async function loadCanonicalOverrides(
  entityType: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.seoMetadata.findMany({
    where: { entityType, entityId: { in: [...ids] } },
    select: { entityId: true, canonicalUrl: true },
  });
  const overrides = new Map<string, string>();
  for (const row of rows) {
    const canonical = row.canonicalUrl?.trim();
    if (canonical && /^https?:\/\//i.test(canonical)) {
      overrides.set(row.entityId, canonical);
    }
  }
  return overrides;
}

/**
 * Collect the indexable public URLs and render the sitemap. The order is
 * stable: homepage, then pages, sermons, events and ministries (each sorted by
 * slug), so the output is reproducible across requests.
 */
export async function buildSitemap(siteUrl: string): Promise<string> {
  const settings = await getSiteSeoSettings();
  if (!settings.robotsDefault) return renderSitemap([]);
  const base = siteUrl.replace(/\/+$/, '');
  const [pages, sermons, events, ministries] = await Promise.all([
    prisma.page.findMany({
      where: { status: 'published' },
      select: publishedSelect,
      orderBy: { slug: 'asc' },
    }),
    prisma.sermon.findMany({
      where: { status: 'published' },
      select: publishedSelect,
      orderBy: { slug: 'asc' },
    }),
    prisma.event.findMany({
      where: { status: 'published' },
      select: publishedSelect,
      orderBy: { slug: 'asc' },
    }),
    prisma.ministry.findMany({
      where: { status: 'published' },
      select: publishedSelect,
      orderBy: { slug: 'asc' },
    }),
  ]);

  const entries: SitemapEntry[] = [{ loc: `${base}/` }];
  const seen = new Set<string>([`${base}/`]);

  const add = (loc: string, row: SitemapRow): void => {
    if (seen.has(loc)) return;
    seen.add(loc);
    entries.push({ loc, lastmod: row.updatedAt.toISOString() });
  };

  const [pageCanonicals, sermonCanonicals, eventCanonicals, ministryCanonicals] =
    await Promise.all([
      loadCanonicalOverrides('page', pages.map((row) => row.id)),
      loadCanonicalOverrides('sermon', sermons.map((row) => row.id)),
      loadCanonicalOverrides('event', events.map((row) => row.id)),
      loadCanonicalOverrides('ministry', ministries.map((row) => row.id)),
    ]);

  for (const page of pages) {
    if (isReservedSitemapSlug(page.slug)) continue;
    add(pageCanonicals.get(page.id) ?? `${base}/${page.slug}`, page);
  }
  for (const sermon of sermons) {
    add(sermonCanonicals.get(sermon.id) ?? `${base}/sermones/${sermon.slug}`, sermon);
  }
  for (const event of events) {
    add(eventCanonicals.get(event.id) ?? `${base}/eventos/${event.slug}`, event);
  }
  for (const ministry of ministries) {
    add(ministryCanonicals.get(ministry.id) ?? `${base}/ministerios/${ministry.slug}`, ministry);
  }

  return renderSitemap(entries);
}
