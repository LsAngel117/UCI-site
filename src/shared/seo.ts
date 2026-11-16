/**
 * Shared SEO contracts (Phase 8, docs/10 §6–§12, docs/08 §18).
 *
 * These describe the SEO payload the backend produces for a public entity and
 * the site-wide defaults an administrator can edit. They are deliberately
 * framework- and database-agnostic: nothing here imports Prisma or storage
 * internals, so the Phase 9 renderer can consume the same shapes the API
 * returns (docs/02 §66, docs/08 §48).
 */

/** Entity kinds the SEO assembly service understands. */
export const SEO_ENTITY_TYPES = [
  'home',
  'page',
  'sermon',
  'event',
  'ministry',
] as const;

export type SeoEntityType = (typeof SEO_ENTITY_TYPES)[number];

/**
 * Editorial SEO values stored per entity (`SeoMetadata`). `null`/absent means
 * "derive from content", never an empty override.
 */
export interface SeoOverride {
  title?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
}

/**
 * Site-wide SEO configuration used as the fallback layer by `buildSeo`.
 * `siteUrl` is the canonical production origin without a trailing slash.
 */
export interface SiteSeoConfig {
  siteUrl: string;
  /** Human site name used in titles and Organization JSON-LD. */
  siteName: string;
  /** Default homepage title (also the title fallback for content). */
  defaultTitle: string;
  /** Default meta description used when content provides none. */
  defaultDescription: string;
  /** Controlled default social-sharing image (docs/10 §10.3). */
  defaultOgImage: string | null;
  /** Site-wide indexation default; `false` makes every payload noindex. */
  robotsDefault: boolean;
  /** Optional logo URL for Organization structured data. */
  logoUrl?: string | null;
}

/** External video reference used to justify a `VideoObject`. */
export interface SeoVideoInput {
  url: string | null;
  provider?: string | null;
  externalId?: string | null;
}

/**
 * Content input accepted by `buildSeo`. It is a superset of the fields the
 * different entity types use; only the fields relevant to the requested
 * `SeoEntityType` are read, which keeps the function a single deterministic
 * switch instead of five near-duplicates.
 */
export interface SeoEntityInput {
  title: string;
  slug?: string | null;
  description?: string | null;
  excerpt?: string | null;
  summary?: string | null;
  shortDescription?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  /** Stored `SeoMetadata` row, when one exists. */
  seo?: SeoOverride | null;
  /** Explicit non-indexation (preview or editorial decision). */
  noindex?: boolean;
  /** Sermon-only: external recording reference. */
  video?: SeoVideoInput | null;
  preacherName?: string | null;
  sermonDate?: string | Date | null;
  durationMinutes?: number | null;
  /** Event-only: temporal/location data for `Event` structured data. */
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  locationName?: string | null;
  address?: string | null;
  city?: string | null;
}

export interface SeoRobots {
  index: boolean;
  follow: boolean;
}

/** One visible breadcrumb (already absolute) for the renderer. */
export interface SeoBreadcrumb {
  name: string;
  url: string;
  position: number;
}

export interface SeoOpenGraph {
  title: string;
  description: string;
  url: string;
  image: string | null;
  type: 'website' | 'article';
  /** Site name rendered as `og:site_name` (docs/10 §10.2). */
  siteName: string;
}

/** A Schema.org object (serializable, ready for a JSON-LD script tag). */
export type JsonLdObject = Record<string, unknown>;

/** Deterministic SEO payload produced for a public entity. */
export interface SeoPayload {
  title: string;
  description: string;
  canonicalUrl: string;
  openGraph: SeoOpenGraph;
  robots: SeoRobots;
  breadcrumbs: SeoBreadcrumb[];
  /** Primary entity object(s) first, then `BreadcrumbList` last. */
  jsonLd: JsonLdObject[];
}

/** Site-wide SEO defaults returned by `GET /api/v1/admin/seo`. */
export interface SiteSeoDto {
  title: string;
  description: string;
  defaultOgImage: string | null;
  robotsDefault: boolean;
}

/** Partial update accepted by `PATCH /api/v1/admin/seo`. */
export interface UpdateSiteSeoInput {
  title?: string;
  description?: string;
  defaultOgImage?: string | null;
  robotsDefault?: boolean;
}
