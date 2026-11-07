/**
 * Public page SEO assembly (Phase 9B1, docs/10 §6, §10–§12).
 *
 * The public API already resolves each entity's `seo` projection (title,
 * description, canonical URL, OG image). This module turns that projection into
 * the values the document head needs and builds only the Schema.org objects the
 * visible content actually justifies:
 *
 * - sermon  -> Article (+ VideoObject when a YouTube reference exists) + BreadcrumbList
 * - event   -> Event (real dates/location only) + BreadcrumbList
 * - ministry-> BreadcrumbList only (no invented ministry schema type)
 *
 * It is pure and framework-free so the rules are unit-testable without Astro.
 */
import type {
  PublicEventDto,
  PublicMinistryDto,
  PublicPageDetailDto,
  PublicSermonDto,
  PublicSermonVideoDto,
} from '@shared/cms';
import type { JsonLdObject } from '@shared/seo';

export interface SeoContext {
  siteUrl: string;
  siteName: string;
  /** Injectable clock for deterministic Event status (tests). */
  now?: Date;
}

export interface ContentSeo {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImageUrl: string | null;
  jsonLd: JsonLdObject[];
}

function trimmed(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const text = trimmed(value);
    if (text !== undefined) return text;
  }
  return undefined;
}

function toIso(value: string | null | undefined): string | undefined {
  const text = trimmed(value);
  if (text === undefined) return undefined;
  return Number.isNaN(new Date(text).getTime()) ? undefined : text;
}

function parseDate(value: string | null | undefined): Date | undefined {
  const text = trimmed(value);
  if (text === undefined) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Make a storage/relative URL absolute; absolute URLs pass through. */
export function absoluteUrl(
  value: string | null | undefined,
  siteUrl: string,
): string | null {
  const text = trimmed(value);
  if (text === undefined) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return buildCanonicalUrl(siteUrl, text);
}

/** Normalize a public path into an absolute canonical URL. */
export function buildCanonicalUrl(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteUrl.replace(/\/+$/, '');
  const clean = path.split('?')[0]?.split('#')[0] ?? '/';
  const rooted = clean.startsWith('/') ? clean : `/${clean}`;
  if (rooted === '/' || rooted.length === 0) return `${origin}/`;
  return `${origin}${rooted.replace(/\/+$/, '')}`;
}

/** Canonical URL for a paginated listing (filters never create a document). */
export function buildListCanonical(
  siteUrl: string,
  path: string,
  page = 1,
): string {
  const clean = path.split('?')[0]?.split('#')[0] ?? '/';
  const base = buildCanonicalUrl(siteUrl, clean);
  return Number.isInteger(page) && page > 1 ? `${base}?page=${page}` : base;
}

/** Append the site name unless the editorial title already carries it. */
export function withSiteName(title: string, siteName: string): string {
  const clean = title.trim();
  const name = siteName.trim();
  if (name.length === 0 || clean.includes(name)) return clean;
  return `${clean} | ${name}`;
}

function descriptionOf(
  candidates: Array<string | null | undefined>,
  fallback: string,
): string {
  return firstNonEmpty(...candidates, fallback) ?? fallback;
}

function breadcrumbsJsonLd(
  section: { name: string; path: string },
  itemName: string,
  itemUrl: string,
  siteUrl: string,
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: buildCanonicalUrl(siteUrl, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: section.name,
        item: buildCanonicalUrl(siteUrl, section.path),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: itemName,
        item: itemUrl,
      },
    ],
  };
}

/**
 * Two-level trail for a top-level page (`Inicio › <page>`). Used by the
 * institutional CMS pages and the static `/soy-nuevo` and `/contacto` routes.
 */
function topLevelBreadcrumbsJsonLd(
  itemName: string,
  itemUrl: string,
  siteUrl: string,
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: buildCanonicalUrl(siteUrl, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: itemName,
        item: itemUrl,
      },
    ],
  };
}

/** A `WebPage` object describing one institutional/static page. */
function webPageJsonLd(options: {
  name: string;
  description: string;
  url: string;
  publishedAt?: string;
  updatedAt?: string;
  image?: string | null;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: options.name,
    description: options.description,
    url: options.url,
    inLanguage: 'es',
    ...(options.publishedAt ? { datePublished: options.publishedAt } : {}),
    ...(options.updatedAt ? { dateModified: options.updatedAt } : {}),
    ...(options.image ? { image: options.image } : {}),
  };
}

/**
 * JSON-LD for a product-controlled static page (`/soy-nuevo`, `/contacto`).
 * These pages have no CMS row, so the caller supplies the visible copy.
 */
export function buildStaticPageJsonLd(options: {
  name: string;
  description: string;
  path: string;
  siteUrl: string;
}): JsonLdObject[] {
  const url = buildCanonicalUrl(options.siteUrl, options.path);
  return [
    webPageJsonLd({
      name: options.name,
      description: options.description,
      url,
    }),
    topLevelBreadcrumbsJsonLd(options.name, url, options.siteUrl),
  ];
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export interface ResolvedYoutubeVideo {
  embedUrl: string;
  watchUrl: string;
}

function extractYoutubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && id.length > 0 ? id : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;
    const [kind, id] = parsed.pathname.split('/').filter(Boolean);
    if ((kind === 'embed' || kind === 'shorts' || kind === 'live') && id) {
      return id;
    }
  }

  return null;
}

/**
 * Resolve a safe YouTube embed. Only YouTube sources are embedded; any other
 * provider returns `null` so the page shows an external link instead.
 */
export function youtubeVideo(
  video: PublicSermonVideoDto | null | undefined,
): ResolvedYoutubeVideo | null {
  if (!video) return null;

  const provider = (video.provider ?? '').trim().toLowerCase();
  const providerIsYoutube = [
    'youtube',
    'youtu.be',
    'youtube.com',
    'm.youtube.com',
    'youtube-nocookie.com',
  ].includes(provider);

  const url = trimmed(video.url);
  const urlId = url ? extractYoutubeId(url) : null;
  const externalId = trimmed(video.externalId);

  if (!providerIsYoutube && urlId === null) return null;

  const id = externalId ?? urlId;
  if (!id) return null;

  const encoded = encodeURIComponent(id);
  return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${encoded}`,
    watchUrl: `https://www.youtube.com/watch?v=${encoded}`,
  };
}

// ---------------------------------------------------------------------------
// Entity payloads
// ---------------------------------------------------------------------------

/** SEO payload for a public sermon detail page. */
export function buildSermonSeo(
  sermon: PublicSermonDto,
  context: SeoContext,
): ContentSeo {
  const canonicalUrl =
    absoluteUrl(sermon.seo.canonicalUrl, context.siteUrl) ??
    buildCanonicalUrl(context.siteUrl, `/sermones/${sermon.slug}`);
  const title = withSiteName(sermon.seo.title || sermon.title, context.siteName);
  const description = descriptionOf(
    [sermon.seo.description, sermon.description],
    context.siteName,
  );
  const image = absoluteUrl(
    sermon.seo.ogImageUrl ?? sermon.coverImageUrl,
    context.siteUrl,
  );
  const author = firstNonEmpty(
    sermon.preacher?.displayName,
    sermon.preacherName,
  );

  const article: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: firstNonEmpty(sermon.title, title) ?? title,
    description,
    url: canonicalUrl,
    inLanguage: 'es',
    ...(toIso(sermon.publishedAt)
      ? { datePublished: toIso(sermon.publishedAt) }
      : {}),
    ...(toIso(sermon.updatedAt)
      ? { dateModified: toIso(sermon.updatedAt) }
      : {}),
    ...(author ? { author: { '@type': 'Person', name: author } } : {}),
    ...(image ? { image } : {}),
  };

  const jsonLd: JsonLdObject[] = [article];
  const video = youtubeVideo(sermon.video);
  // A VideoObject requires a real thumbnail (Google rich-result rules); when
  // the sermon has no cover we omit the object rather than emit an incomplete
  // one. The video still renders as HTML on the page.
  if (video && image) {
    const uploadDate =
      toIso(sermon.sermonDate) ??
      toIso(sermon.publishedAt) ??
      toIso(sermon.updatedAt);
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: firstNonEmpty(sermon.title, title) ?? title,
      description,
      ...(uploadDate ? { uploadDate } : {}),
      contentUrl: video.watchUrl,
      embedUrl: video.embedUrl,
      thumbnailUrl: image,
    });
  }

  jsonLd.push(
    breadcrumbsJsonLd(
      { name: 'Sermones', path: '/sermones' },
      sermon.title,
      canonicalUrl,
      context.siteUrl,
    ),
  );

  return { title, description, canonicalUrl, ogImageUrl: image, jsonLd };
}

function eventLocationJsonLd(event: PublicEventDto): JsonLdObject | undefined {
  const name = trimmed(event.locationName);
  const streetAddress = trimmed(event.address);
  const addressLocality = trimmed(event.city);
  if (!name && !streetAddress && !addressLocality) return undefined;

  return {
    '@type': 'Place',
    ...(name ? { name } : {}),
    ...(streetAddress || addressLocality
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(streetAddress ? { streetAddress } : {}),
            ...(addressLocality ? { addressLocality } : {}),
          },
        }
      : {}),
  };
}

/** SEO payload for a public event detail page. */
export function buildEventSeo(
  event: PublicEventDto,
  context: SeoContext,
): ContentSeo {
  const canonicalUrl =
    absoluteUrl(event.seo.canonicalUrl, context.siteUrl) ??
    buildCanonicalUrl(context.siteUrl, `/eventos/${event.slug}`);
  const title = withSiteName(event.seo.title || event.title, context.siteName);
  const description = descriptionOf(
    [event.seo.description, event.summary, event.description],
    context.siteName,
  );
  const image = absoluteUrl(
    event.seo.ogImageUrl ?? event.coverImageUrl,
    context.siteUrl,
  );

  const start = parseDate(event.startAt);
  const end = parseDate(event.endAt);
  const now = context.now ?? new Date();
  const upcoming =
    start !== undefined && (end ?? start).getTime() >= now.getTime();
  const location = eventLocationJsonLd(event);

  const jsonLd: JsonLdObject[] = [];
  // Event structured data demands a real start date; a dateless event is only
  // a promotional page, so it gets the breadcrumb trail and no invented Event
  // (docs/10 §12.5). `eventStatus` is only claimed while the event is ahead.
  if (start) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: firstNonEmpty(event.title, title) ?? title,
      description,
      url: canonicalUrl,
      ...(upcoming
        ? { eventStatus: 'https://schema.org/EventScheduled' }
        : {}),
      startDate: start.toISOString(),
      ...(end ? { endDate: end.toISOString() } : {}),
      ...(location ? { location } : {}),
      ...(image ? { image } : {}),
    });
  }

  jsonLd.push(
    breadcrumbsJsonLd(
      { name: 'Eventos', path: '/eventos' },
      event.title,
      canonicalUrl,
      context.siteUrl,
    ),
  );

  return {
    title,
    description,
    canonicalUrl,
    ogImageUrl: image,
    jsonLd,
  };
}

/** SEO payload for a public ministry detail page. */
export function buildMinistrySeo(
  ministry: PublicMinistryDto,
  context: SeoContext,
): ContentSeo {
  const canonicalUrl =
    absoluteUrl(ministry.seo.canonicalUrl, context.siteUrl) ??
    buildCanonicalUrl(context.siteUrl, `/ministerios/${ministry.slug}`);
  const title = withSiteName(
    ministry.seo.title || ministry.name,
    context.siteName,
  );
  const description = descriptionOf(
    [ministry.seo.description, ministry.shortDescription, ministry.description],
    context.siteName,
  );
  const image = absoluteUrl(
    ministry.seo.ogImageUrl ?? ministry.coverImageUrl,
    context.siteUrl,
  );

  return {
    title,
    description,
    canonicalUrl,
    ogImageUrl: image,
    jsonLd: [
      breadcrumbsJsonLd(
        { name: 'Ministerios', path: '/ministerios' },
        ministry.name,
        canonicalUrl,
        context.siteUrl,
      ),
    ],
  };
}

/**
 * SEO payload for a public CMS page served at `/{slug}` (Phase 9B2, docs/08
 * §10.1, docs/10 §6). The API always resolves a canonical URL, but the route
 * still falls back to `/{slug}` so a partially configured row can never emit
 * an empty canonical.
 *
 * Structured data is a `WebPage` (the page genuinely is one) plus the visible
 * top-level breadcrumb trail. No `Article` is claimed: institutional pages are
 * not articles, and inventing author/publisher data would be dishonest.
 */
export function buildPageSeo(
  page: PublicPageDetailDto,
  context: SeoContext,
): ContentSeo {
  const canonicalUrl =
    absoluteUrl(page.seo.canonicalUrl, context.siteUrl) ??
    buildCanonicalUrl(context.siteUrl, `/${page.slug}`);
  const title = withSiteName(page.seo.title || page.title, context.siteName);
  const description = descriptionOf(
    [page.seo.description, page.excerpt],
    context.siteName,
  );
  const image = absoluteUrl(
    page.seo.ogImageUrl ?? page.coverImageUrl,
    context.siteUrl,
  );

  const jsonLd: JsonLdObject[] = [
    webPageJsonLd({
      name: page.title,
      description,
      url: canonicalUrl,
      publishedAt: toIso(page.publishedAt),
      updatedAt: toIso(page.updatedAt),
      image,
    }),
    topLevelBreadcrumbsJsonLd(page.title, canonicalUrl, context.siteUrl),
  ];

  return { title, description, canonicalUrl, ogImageUrl: image, jsonLd };
}
