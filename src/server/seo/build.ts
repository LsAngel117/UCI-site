/**
 * SEO assembly service (Phase 8, docs/10 §6–§12).
 *
 * `buildSeo` is a pure, deterministic function: given an entity type, its
 * content plus an optional `SeoMetadata` override, and the site configuration,
 * it produces the exact payload the Phase 9 renderer needs — title,
 * description, canonical URL, Open Graph, robots directives, breadcrumbs and
 * Schema.org JSON-LD objects.
 *
 * The precedence is fixed and documented (docs/10 §11.5):
 *   1. explicit `SeoMetadata` values win verbatim;
 *   2. otherwise derive from the entity's own content;
 *   3. otherwise fall back to the site defaults.
 *
 * Structured data only describes what the content actually justifies
 * (docs/10 §12.1): an `Event` needs real dates/location; a `VideoObject` only
 * appears when a video reference exists. Ministry pages get a breadcrumb list
 * but no invented schema type.
 */
import type {
  JsonLdObject,
  SeoBreadcrumb,
  SeoEntityInput,
  SeoEntityType,
  SeoPayload,
  SiteSeoConfig,
} from '@shared/seo';

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

function toIso(
  value: string | Date | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value.length > 0 ? value : undefined;
}

/** Parse an optional date, returning undefined for absent or invalid values. */
function parseDate(value: string | Date | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Make a config/media URL absolute against the public origin. */
function absoluteUrl(
  value: string | null | undefined,
  siteUrl: string,
): string | null {
  const text = trimmed(value);
  if (text === undefined) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return buildCanonicalUrl(siteUrl, text);
}

/**
 * Resolve the public URL of an external video reference. An explicit URL wins;
 * otherwise a YouTube provider + external id is enough to derive the canonical
 * watch URL (docs/10 §12.7). Anything else cannot be represented honestly.
 */
function resolveVideoUrl(
  video: NonNullable<SeoEntityInput['video']>,
): string | undefined {
  const explicit = trimmed(video.url);
  if (explicit !== undefined) return explicit;
  const provider = trimmed(video.provider)?.toLowerCase();
  const externalId = trimmed(video.externalId);
  if (
    externalId !== undefined &&
    (provider === 'youtube' || provider === 'youtu.be' || provider === 'youtube.com')
  ) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(externalId)}`;
  }
  return undefined;
}

/**
 * Normalize a public path into an absolute canonical URL. Query strings and
 * fragments are removed, the path is rooted, one trailing slash policy is
 * applied (root keeps its slash; other paths do not), and absolute URLs pass
 * through unchanged.
 */
export function buildCanonicalUrl(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteUrl.replace(/\/+$/, '');
  const clean = path.split('?')[0]?.split('#')[0] ?? '/';
  const rooted = clean.startsWith('/') ? clean : `/${clean}`;
  if (rooted === '/' || rooted.length === 0) return `${origin}/`;
  return `${origin}${rooted.replace(/\/+$/, '')}`;
}

/**
 * Canonical URL for a paginated listing (docs/10 §6.3). Filter/sort/tracking
 * query parameters never create a distinct canonical document; only `page`
 * does, and page 1 stays on the base URL.
 */
export function buildListCanonical(
  siteUrl: string,
  path: string,
  page = 1,
): string {
  const clean = path.split('?')[0]?.split('#')[0] ?? '/';
  const base = buildCanonicalUrl(siteUrl, clean);
  const resolvedPage =
    Number.isInteger(page) && page > 1 ? page : 1;
  return resolvedPage > 1 ? `${base}?page=${resolvedPage}` : base;
}

function defaultCanonical(
  entityType: SeoEntityType,
  entity: SeoEntityInput,
  siteUrl: string,
): string {
  if (entityType === 'home') return buildCanonicalUrl(siteUrl, '/');
  const slug = trimmed(entity.slug);
  if (slug === undefined) return buildCanonicalUrl(siteUrl, '/');
  switch (entityType) {
    case 'page':
      return buildCanonicalUrl(siteUrl, slug);
    case 'sermon':
      return buildCanonicalUrl(siteUrl, `/sermones/${slug}`);
    case 'event':
      return buildCanonicalUrl(siteUrl, `/eventos/${slug}`);
    case 'ministry':
      return buildCanonicalUrl(siteUrl, `/ministerios/${slug}`);
  }
}

function resolveTitle(
  entityType: SeoEntityType,
  entity: SeoEntityInput,
  site: SiteSeoConfig,
): string {
  const override = trimmed(entity.seo?.title);
  if (override !== undefined) return override;
  if (entityType === 'home') {
    return firstNonEmpty(site.defaultTitle, site.siteName) ?? site.siteName;
  }
  const base = firstNonEmpty(entity.title, site.siteName) ?? site.siteName;
  return `${base} | ${site.siteName}`;
}

function resolveDescription(
  entity: SeoEntityInput,
  site: SiteSeoConfig,
): string {
  return (
    firstNonEmpty(
      entity.seo?.description,
      entity.description,
      entity.summary,
      entity.shortDescription,
      entity.excerpt,
      site.defaultDescription,
      site.siteName,
    ) ?? site.siteName
  );
}

function resolveImage(
  entity: SeoEntityInput,
  site: SiteSeoConfig,
): string | null {
  return (
    absoluteUrl(entity.seo?.ogImageUrl, site.siteUrl) ??
    absoluteUrl(entity.coverImageUrl, site.siteUrl) ??
    site.defaultOgImage
  );
}

function buildBreadcrumbs(
  entityType: SeoEntityType,
  entity: SeoEntityInput,
  canonicalUrl: string,
  site: SiteSeoConfig,
): SeoBreadcrumb[] {
  if (entityType === 'home') return [];
  const home: SeoBreadcrumb = {
    name: 'Inicio',
    url: buildCanonicalUrl(site.siteUrl, '/'),
    position: 1,
  };
  const title = firstNonEmpty(entity.title, site.siteName) ?? site.siteName;
  switch (entityType) {
    case 'page':
      return [home, { name: title, url: canonicalUrl, position: 2 }];
    case 'sermon':
    case 'event':
    case 'ministry': {
      const section =
        entityType === 'sermon'
          ? { name: 'Sermones', path: '/sermones' }
          : entityType === 'event'
            ? { name: 'Eventos', path: '/eventos' }
            : { name: 'Ministerios', path: '/ministerios' };
      return [
        home,
        {
          name: section.name,
          url: buildCanonicalUrl(site.siteUrl, section.path),
          position: 2,
        },
        { name: title, url: canonicalUrl, position: 3 },
      ];
    }
  }
}

function breadcrumbJsonLd(breadcrumbs: readonly SeoBreadcrumb[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb) => ({
      '@type': 'ListItem',
      position: crumb.position,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function organizationJsonLd(site: SiteSeoConfig): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.siteName,
    url: buildCanonicalUrl(site.siteUrl, '/'),
    ...(trimmed(site.logoUrl) ? { logo: site.logoUrl } : {}),
  };
}

function websiteJsonLd(site: SiteSeoConfig): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.siteName,
    url: buildCanonicalUrl(site.siteUrl, '/'),
    inLanguage: 'es',
  };
}

function eventLocationJsonLd(
  entity: SeoEntityInput,
): JsonLdObject | undefined {
  const name = trimmed(entity.locationName);
  const streetAddress = trimmed(entity.address);
  const addressLocality = trimmed(entity.city);
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

export function buildSeo(
  entityType: SeoEntityType,
  entity: SeoEntityInput,
  siteConfig: SiteSeoConfig,
  now: Date = new Date(),
): SeoPayload {
  const title = resolveTitle(entityType, entity, siteConfig);
  const description = resolveDescription(entity, siteConfig);
  const canonicalUrl =
    trimmed(entity.seo?.canonicalUrl) ??
    defaultCanonical(entityType, entity, siteConfig.siteUrl);
  const image = resolveImage(entity, siteConfig);
  const breadcrumbs = buildBreadcrumbs(
    entityType,
    entity,
    canonicalUrl,
    siteConfig,
  );
  const noindex = entity.noindex === true;
  const robots = {
    index: siteConfig.robotsDefault && !noindex,
    follow: !noindex,
  };
  const openGraph = {
    title,
    description,
    url: canonicalUrl,
    image,
    type: entityType === 'home' ? ('website' as const) : ('article' as const),
    siteName: siteConfig.siteName,
  };

  const jsonLd: JsonLdObject[] = [];
  switch (entityType) {
    case 'home':
      jsonLd.push(organizationJsonLd(siteConfig), websiteJsonLd(siteConfig));
      break;
    case 'page':
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: firstNonEmpty(entity.title, title) ?? title,
        description,
        url: canonicalUrl,
        inLanguage: 'es',
        ...(toIso(entity.updatedAt)
          ? { dateModified: toIso(entity.updatedAt) }
          : {}),
      });
      break;
    case 'sermon': {
      const publishedAt = toIso(entity.publishedAt);
      const updatedAt = toIso(entity.updatedAt);
      const preacher = trimmed(entity.preacherName);
      const article: JsonLdObject = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: firstNonEmpty(entity.title, title) ?? title,
        description,
        url: canonicalUrl,
        inLanguage: 'es',
        ...(publishedAt ? { datePublished: publishedAt } : {}),
        ...(updatedAt ? { dateModified: updatedAt } : {}),
        ...(preacher
          ? { author: { '@type': 'Person', name: preacher } }
          : {}),
        ...(image ? { image } : {}),
      };
      jsonLd.push(article);
      const videoUrl = entity.video
        ? resolveVideoUrl(entity.video)
        : undefined;
      if (videoUrl !== undefined) {
        const uploadDate =
          toIso(entity.sermonDate) ?? publishedAt ?? updatedAt;
        jsonLd.push({
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: firstNonEmpty(entity.title, title) ?? title,
          description,
          ...(uploadDate ? { uploadDate } : {}),
          contentUrl: videoUrl,
          embedUrl: videoUrl,
          ...(image ? { thumbnailUrl: image } : {}),
        });
      }
      break;
    }
    case 'event': {
      const start = parseDate(entity.startAt);
      const end = parseDate(entity.endAt);
      const startDate = start?.toISOString();
      const endDate = end?.toISOString();
      // Only claim the event is still scheduled when a real start date exists
      // and the event has not already finished (docs/10 §12.5). Never invent a
      // status for undated or past events.
      const upcoming =
        start !== undefined && (end ?? start).getTime() >= now.getTime();
      const location = eventLocationJsonLd(entity);
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: firstNonEmpty(entity.title, title) ?? title,
        description,
        url: canonicalUrl,
        ...(upcoming ? { eventStatus: 'https://schema.org/EventScheduled' } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(location ? { location } : {}),
        ...(image ? { image } : {}),
      });
      break;
    }
    case 'ministry':
      break;
  }

  if (breadcrumbs.length > 0) jsonLd.push(breadcrumbJsonLd(breadcrumbs));

  return {
    title,
    description,
    canonicalUrl,
    openGraph,
    robots,
    breadcrumbs,
    jsonLd,
  };
}
