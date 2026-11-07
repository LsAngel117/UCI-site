/**
 * Reusable CMS editorial contracts (Phase 3, docs/05 §28–33, docs/08 §11.3–11.9).
 *
 * These are the *admin* content DTOs: what the CMS API accepts and returns for
 * publishable entities. They are deliberately content-type-agnostic where the
 * behaviour is shared (lifecycle actions, revision shape, pagination) and only
 * concrete for Sermons, the first content type proven against the core.
 *
 * Nothing in `@shared` imports Prisma or storage internals — the admin UI and
 * the API agree on exactly these shapes (docs/02 §66, docs/08 §48, §55).
 */
import type { ContentStatus } from './types';
import type {
  ApiResponse,
  ListResponse,
  PaginationMeta,
  PaginationParams,
  SortParams,
} from './api';

// Re-export the shared envelope + pagination primitives so a consumer of the
// admin contracts imports from a single place without re-deriving them.
export type { ApiResponse, ListResponse, PaginationMeta, PaginationParams };

// ---------------------------------------------------------------------------
// Editorial actions (docs/05 §30, docs/08 §22–23)
// ---------------------------------------------------------------------------

/**
 * Explicit lifecycle operations. These are the *only* way content changes
 * state: a generic PATCH never does (docs/08 §22). `unpublish` is retained on
 * the core for completeness even though Phase 3 exposes no dedicated endpoint.
 */
export const LIFECYCLE_ACTIONS = [
  'publish',
  'schedule',
  'archive',
  'unpublish',
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/** Type guard for validating untrusted action values at the boundary. */
export function isLifecycleAction(value: unknown): value is LifecycleAction {
  return (
    typeof value === 'string' &&
    (LIFECYCLE_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Publish request body. Publishing is an explicit, body-less business
 * operation (`POST /api/v1/admin/sermons/:id/publish`): it takes no request
 * body and therefore **no `version`** — a stale version never blocks it
 * (docs/08 §22). Contrast `UpdateSermonInput` below, whose `version` is the
 * required optimistic-concurrency guard.
 */
export type PublishInput = Record<string, never>;

/** Schedule request body (`POST /api/v1/admin/sermons/:id/schedule`). */
export interface ScheduleInput {
  /** ISO-8601 instant; must be a valid future timestamp (docs/08 §37). */
  publishAt: string;
}

// ---------------------------------------------------------------------------
// Revisions (docs/05 §32, docs/08 §11.9)
// ---------------------------------------------------------------------------

/**
 * A self-contained snapshot of a content entity's editable fields. Stored in
 * `Revision.snapshot` so a revision can be restored without reconstructing it
 * from the live row. Serialized to JSON in storage, so all values are
 * primitives (dates as ISO strings).
 *
 * The Phase 5A domain fields are optional so revisions stored before the
 * sermon domain landed (which only carried the Phase 3 keys) remain valid and
 * restorable: a key that is absent is left untouched on restore.
 */
export interface SermonSnapshot {
  title: string;
  slug: string;
  description: string | null;
  scriptureReference: string | null;
  scriptureText: string | null;
  preacherName: string | null;
  /** ISO-8601 date string, or null. */
  sermonDate: string | null;
  preacherId?: string | null;
  seriesId?: string | null;
  coverMediaId?: string | null;
  notesMediaId?: string | null;
  videoProvider?: string | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  notesContent?: string | null;
  durationMinutes?: number | null;
  featured?: boolean;
}

/** Generic revision summary returned by the revisions endpoints. */
export interface RevisionDto {
  id: string;
  /** Parent entity id (the revision belongs to exactly one entity). */
  entityId: string;
  version: number;
  title: string;
  /** The stored snapshot (shape depends on the entity type). */
  snapshot: unknown;
  createdById: string | null;
  createdAt: string;
}

/** Sermon revision with a typed snapshot. */
export interface SermonRevisionDto extends RevisionDto {
  snapshot: SermonSnapshot;
}

// ---------------------------------------------------------------------------
// Admin content DTOs (docs/08 §11.3–11.9)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sermon domain contracts (Phase 5A, docs/05 §8–10)
//
// Person / SermonSeries / Topic are sermon-owned taxonomy. They are exposed as
// plain DTOs (no Prisma types) so the admin UI and the API share one shape.
// ---------------------------------------------------------------------------

/** A person referenced by content (a preacher today; reusable later). */
export interface PersonDto {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string | null;
  /** Media asset id used as the person's photo; null when unset. */
  photoMediaId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  /** Defaults to `"firstName lastName"` when omitted. */
  displayName?: string;
  role?: string | null;
  photoMediaId?: string | null;
  active?: boolean;
}

export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  role?: string | null;
  photoMediaId?: string | null;
  active?: boolean;
}

/** A series grouping related sermons (docs/05 §9). */
export interface SermonSeriesDto {
  id: string;
  name: string;
  slug: string;
  /** ISO-8601 date string, or null. */
  startDate: string | null;
  /** ISO-8601 date string, or null. */
  endDate: string | null;
  coverMediaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSermonSeriesInput {
  name: string;
  /** Auto-generated from the name when omitted. */
  slug?: string;
  startDate?: string | null;
  endDate?: string | null;
  coverMediaId?: string | null;
}

export interface UpdateSermonSeriesInput {
  name?: string;
  slug?: string;
  startDate?: string | null;
  endDate?: string | null;
  coverMediaId?: string | null;
}

/** Cross-cutting classification for sermons (docs/05 §10). */
export interface TopicDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTopicInput {
  name: string;
  /** Auto-generated from the name when omitted. */
  slug?: string;
}

export interface UpdateTopicInput {
  name?: string;
  slug?: string;
}

/** SEO metadata for a sermon (`SeoMetadata`, entityType `sermon`). */
export interface SermonSeoDto {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
}

/** SEO input on create/update. Unspecified keys keep their stored value. */
export interface SermonSeoInput {
  title?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
}

/** Full admin representation of a sermon. */
export interface SermonAdminDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  scriptureReference: string | null;
  scriptureText: string | null;
  /** Legacy denormalized preacher name (kept when no `Person` is linked). */
  preacherName: string | null;
  /** ISO-8601 date string, or null. */
  sermonDate: string | null;
  preacherId: string | null;
  preacher: PersonDto | null;
  seriesId: string | null;
  series: SermonSeriesDto | null;
  topics: TopicDto[];
  coverMediaId: string | null;
  notesMediaId: string | null;
  videoProvider: string | null;
  videoExternalId: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  notesContent: string | null;
  durationMinutes: number | null;
  featured: boolean;
  seo: SermonSeoDto | null;
  status: ContentStatus;
  /** Optimistic-concurrency counter (docs/08 §38). */
  version: number;
  publishedAt: string | null;
  publishAt: string | null;
  unpublishedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create-sermon body. `status` is deliberately absent — creation always
 * produces a draft; only explicit lifecycle actions may publish (docs/08 §22).
 */
export interface CreateSermonInput {
  title: string;
  /** Auto-generated from the title when omitted (docs/05 §27). */
  slug?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: string | null;
  preacherId?: string | null;
  seriesId?: string | null;
  /** Replace-set of topic ids linked to the sermon. */
  topicIds?: string[];
  coverMediaId?: string | null;
  notesMediaId?: string | null;
  videoProvider?: string | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  notesContent?: string | null;
  durationMinutes?: number | null;
  featured?: boolean;
  seo?: SermonSeoInput | null;
}

/**
 * Update-sermon body. `version` is REQUIRED: it is the optimistic-concurrency
 * guard, and a mismatch is a 409 CONFLICT (docs/08 §38). `status` is absent by
 * design — a PATCH never changes lifecycle state (docs/08 §22).
 *
 * `topicIds`, when present, replaces the whole topic set; omitting it leaves the
 * existing topics untouched.
 */
export interface UpdateSermonInput {
  version: number;
  title?: string;
  slug?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: string | null;
  preacherId?: string | null;
  seriesId?: string | null;
  topicIds?: string[];
  coverMediaId?: string | null;
  notesMediaId?: string | null;
  videoProvider?: string | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  notesContent?: string | null;
  durationMinutes?: number | null;
  featured?: boolean;
  seo?: SermonSeoInput | null;
}

// ---------------------------------------------------------------------------
// Events & Ministries contracts (Phase 6A, docs/05 §11–13)
//
// Same admin conventions as sermons: the DTOs never carry Prisma types, a
// PATCH carries the optimistic-concurrency `version`, and lifecycle state is
// only changed through explicit actions (never through create/update).
// ---------------------------------------------------------------------------

/** Shared SEO shape (one `SeoMetadata` row per content entity). */
export interface SeoDto {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
}

/** SEO input on create/update. Unspecified keys keep their stored value. */
export interface SeoInput {
  title?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
}

/** Event SEO contracts (`SeoMetadata` entityType `event`). */
export type EventSeoDto = SeoDto;
export type EventSeoInput = SeoInput;

/** Ministry SEO contracts (`SeoMetadata` entityType `ministry`). */
export type MinistrySeoDto = SeoDto;
export type MinistrySeoInput = SeoInput;

/** Editorial category for events (docs/05 §12). */
export interface EventCategoryDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventCategoryInput {
  name: string;
  /** Auto-generated from the name when omitted (docs/05 §27). */
  slug?: string;
}

export interface UpdateEventCategoryInput {
  name?: string;
  slug?: string;
}

/** Event content as returned by the admin API (no audit/concurrency fields). */
export interface EventDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  categoryId: string | null;
  category: EventCategoryDto | null;
  /** ISO-8601 instant, or null. */
  startAt: string | null;
  /** ISO-8601 instant, or null. */
  endAt: string | null;
  locationName: string | null;
  address: string | null;
  city: string | null;
  coverMediaId: string | null;
  registrationUrl: string | null;
  featured: boolean;
  seo: SeoDto | null;
  status: ContentStatus;
  publishedAt: string | null;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full admin representation of an event (adds audit + concurrency fields). */
export interface EventAdminDto extends EventDto {
  /** Optimistic-concurrency counter (docs/08 §38). */
  version: number;
  unpublishedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
}

/**
 * Create-event body. `status` is deliberately absent — creation always
 * produces a draft; only explicit lifecycle actions may publish (docs/08 §22).
 */
export interface CreateEventInput {
  title: string;
  /** Auto-generated from the title when omitted (docs/05 §27). */
  slug?: string;
  summary?: string | null;
  description?: string | null;
  categoryId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  locationName?: string | null;
  address?: string | null;
  city?: string | null;
  coverMediaId?: string | null;
  registrationUrl?: string | null;
  featured?: boolean;
  seo?: SeoInput | null;
}

/** Update-event body. `version` is REQUIRED (optimistic concurrency). */
export interface UpdateEventInput {
  version: number;
  title?: string;
  slug?: string;
  summary?: string | null;
  description?: string | null;
  categoryId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  locationName?: string | null;
  address?: string | null;
  city?: string | null;
  coverMediaId?: string | null;
  registrationUrl?: string | null;
  featured?: boolean;
  seo?: SeoInput | null;
}

/** Admin event listing filters (`GET /api/v1/admin/events`). */
export interface EventListFilters {
  status?: ContentStatus;
  /** Case-insensitive match on title/summary/description. */
  search?: string;
  categoryId?: string;
  /** Inclusive `publishedAt` lower bound (ISO date/datetime). */
  publishedFrom?: string;
  /** Inclusive `publishedAt` upper bound (ISO date/datetime). */
  publishedTo?: string;
  /** Inclusive `startAt` lower bound (ISO date/datetime). */
  startFrom?: string;
  /** Inclusive `startAt` upper bound (ISO date/datetime). */
  startTo?: string;
}

export interface EventListQuery
  extends PaginationParams, SortParams, EventListFilters {}

/** Filters for the admin event-category picker. */
export interface EventCategoryListFilters {
  /** Case-insensitive match on name/slug. */
  search?: string;
}

export interface EventCategoryListQuery
  extends PaginationParams, SortParams, EventCategoryListFilters {}

/** Ministry content as returned by the admin API (no audit/concurrency fields). */
export interface MinistryDto {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  coverMediaId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  meetingInfo: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  featured: boolean;
  seo: SeoDto | null;
  status: ContentStatus;
  publishedAt: string | null;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full admin representation of a ministry. */
export interface MinistryAdminDto extends MinistryDto {
  version: number;
  unpublishedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
}

/** Create-ministry body. Creation always produces a draft. */
export interface CreateMinistryInput {
  name: string;
  /** Auto-generated from the name when omitted (docs/05 §27). */
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  coverMediaId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  meetingInfo?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  featured?: boolean;
  seo?: SeoInput | null;
}

/** Update-ministry body. `version` is REQUIRED (optimistic concurrency). */
export interface UpdateMinistryInput {
  version: number;
  name?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  coverMediaId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  meetingInfo?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  featured?: boolean;
  seo?: SeoInput | null;
}

/** Admin ministry listing filters (`GET /api/v1/admin/ministries`). */
export interface MinistryListFilters {
  status?: ContentStatus;
  /** Case-insensitive match on name/shortDescription/description. */
  search?: string;
  /** Inclusive `publishedAt` lower bound (ISO date/datetime). */
  publishedFrom?: string;
  /** Inclusive `publishedAt` upper bound (ISO date/datetime). */
  publishedTo?: string;
}

export interface MinistryListQuery
  extends PaginationParams, SortParams, MinistryListFilters {}

// ---------------------------------------------------------------------------
// Pages & Navigation contracts (Phase 7A, docs/08 §10/§14, docs/05 §20/§45)
//
// Pages are structured institutional content (docs/05 §20): `content` is a
// JSON object with a shape known to the frontend, never an arbitrary visual
// page builder. Navigation items are CMS-driven menu entries scoped by
// `location` (HEADER / FOOTER) and optionally nested through `parentId`.
// ---------------------------------------------------------------------------

/** A value representable in JSON — no Prisma types leak into `@shared`. */
export type PageContentValue =
  | string
  | number
  | boolean
  | null
  | PageContentValue[]
  | { [key: string]: PageContentValue };

/**
 * Structured editorial content for a page. The frontend consumes a known
 * shape (docs/05 §20); storing it as a plain JSON object lets each structured
 * page model evolve without a migration while still forbidding Prisma types in
 * the contract.
 */
export interface PageContent {
  [key: string]: PageContentValue;
}

/** Page SEO contracts (`SeoMetadata` entityType `page`). */
export type PageSeoDto = SeoDto;
export type PageSeoInput = SeoInput;

/** Page content as returned by the public/admin API (no audit fields). */
export interface PageDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: PageContent | null;
  coverMediaId: string | null;
  seo: SeoDto | null;
  status: ContentStatus;
  publishedAt: string | null;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full admin representation of a page (adds audit + concurrency fields). */
export interface PageAdminDto extends PageDto {
  /** Optimistic-concurrency counter (docs/08 §38). */
  version: number;
  unpublishedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
}

/** Snapshot frozen into a `PageRevision` (all primitives / JSON). */
export interface PageSnapshot {
  title: string;
  slug: string;
  excerpt: string | null;
  content: PageContent | null;
  /** Absent on revisions stored before the page cover landed. */
  coverMediaId?: string | null;
}

/** Page revision with a typed snapshot. */
export interface PageRevisionDto extends RevisionDto {
  snapshot: PageSnapshot;
}

/** Create-page body. Creation always produces a draft (docs/08 §10.4). */
export interface CreatePageInput {
  title: string;
  /** Auto-generated from the title when omitted (docs/05 §27). */
  slug?: string;
  excerpt?: string | null;
  content?: PageContent | null;
  coverMediaId?: string | null;
  seo?: SeoInput | null;
}

/** Update-page body. `version` is REQUIRED (optimistic concurrency). */
export interface UpdatePageInput {
  version: number;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: PageContent | null;
  coverMediaId?: string | null;
  seo?: SeoInput | null;
}

/** Admin page listing filters (`GET /api/v1/admin/pages`, docs/08 §10.3). */
export interface PageListFilters {
  status?: ContentStatus;
  /** Case-insensitive match on title/slug/excerpt. */
  search?: string;
  /** Filter by the author (createdBy) user id. */
  author?: string;
  publishedFrom?: string;
  publishedTo?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface PageListQuery
  extends PaginationParams, SortParams, PageListFilters {}

/**
 * Redirect foundation (docs/08 §14). A row maps an old slug to its new one so
 * the HTTP layer (Phase 9) can answer a permanent redirect.
 */
export interface RedirectDto {
  id: string;
  fromPath: string;
  toPath: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

/** Allowed navigation menus (docs/08 §14: e.g. HEADER / FOOTER). */
export const NAVIGATION_LOCATIONS = ['HEADER', 'FOOTER'] as const;
export type NavigationLocation = (typeof NAVIGATION_LOCATIONS)[number];

/** Allowed link targets. */
export const NAVIGATION_TARGETS = ['_self', '_blank'] as const;
export type NavigationTarget = (typeof NAVIGATION_TARGETS)[number];

/** A navigation item as exposed to the public API (no timestamps). */
export interface NavigationDto {
  id: string;
  label: string;
  href: string;
  external: boolean;
  location: NavigationLocation;
  target: NavigationTarget | null;
  order: number;
  visible: boolean;
  parentId: string | null;
}

/** Full admin representation of a navigation item. */
export interface NavigationAdminDto extends NavigationDto {
  createdAt: string;
  updatedAt: string;
}

/** Create-navigation body. */
export interface CreateNavigationInput {
  label: string;
  href: string;
  external?: boolean;
  location?: NavigationLocation | string;
  target?: NavigationTarget | string | null;
  order?: number;
  visible?: boolean;
  parentId?: string | null;
}

/** Update-navigation body (all fields optional). */
export interface UpdateNavigationInput {
  label?: string;
  href?: string;
  external?: boolean;
  location?: NavigationLocation | string;
  target?: NavigationTarget | string | null;
  order?: number;
  visible?: boolean;
  parentId?: string | null;
}

/** One reorder entry (`POST /api/v1/admin/navigation/reorder`). */
export interface NavigationReorderItem {
  id: string;
  position: number;
}

/** Reorder body (docs/08 §14.2). */
export interface NavigationReorderInput {
  items: NavigationReorderItem[];
}

/** Admin navigation listing filters. */
export interface NavigationListFilters {
  location?: NavigationLocation | string;
  visible?: boolean | string;
  parentId?: string;
}

export interface NavigationListQuery extends NavigationListFilters {}

// ---------------------------------------------------------------------------
// Public pages & navigation contracts (Phase 7B, docs/08 §10.1–10.2, §14.1,
// docs/10 §5–6)
//
// The public API exposes only published pages and visible navigation items,
// and only public data: internal author/version/lifecycle columns are
// deliberately absent. SEO always resolves to a canonical URL so the frontend
// never has to invent one (docs/10 §6). Navigation is projected as a nested
// tree so the frontend can render a menu without touching Prisma.
// ---------------------------------------------------------------------------

/** Sort allowlist for the public page listing (docs/08 §10.2, §26). */
export const PUBLIC_PAGE_SORT_FIELDS = [
  'publishedAt',
  'title',
  'updatedAt',
] as const;

export type PublicPageSortField = (typeof PUBLIC_PAGE_SORT_FIELDS)[number];

/**
 * Public page SEO metadata. `title`/`description` fall back to the page's own
 * content and `canonicalUrl` to the canonical public route (`/:slug`) when no
 * explicit `SeoMetadata` row exists (docs/10 §6.1–6.2).
 */
export interface PublicPageSeoDto {
  title: string;
  description: string | null;
  canonicalUrl: string;
  ogImageUrl: string | null;
}

/** A page as exposed by the public listing (no content — keep it small). */
export interface PublicPageDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  /** Resolved public cover URL, or null when unset. */
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  seo: PublicPageSeoDto;
}

/** Public page detail — adds the structured editorial body. */
export interface PublicPageDetailDto extends PublicPageDto {
  content: PageContent | null;
}

/** Filters accepted by the public page listing (docs/08 §10.2). */
export interface PublicPageListFilters {
  /** Case-insensitive match on title, slug or excerpt. */
  search?: string;
}

/** Query shape of `GET /api/v1/pages` (filters + pagination + sort). */
export interface PublicPageListQuery
  extends PaginationParams, SortParams, PublicPageListFilters {}

/**
 * A navigation item as exposed by the public API. Children are already nested
 * and ordered so the frontend renders the tree directly; editorial fields
 * (`visible`, `order`, `parentId`, `location`) are not part of the contract.
 */
export interface PublicNavigationItemDto {
  id: string;
  label: string;
  href: string;
  external: boolean;
  target: NavigationTarget | null;
  children: PublicNavigationItemDto[];
}

/** Query shape of `GET /api/v1/navigation` (docs/08 §14.1). */
export interface PublicNavigationQuery {
  /** Menu to render; defaults to `HEADER` when omitted. */
  location?: NavigationLocation | string;
}

// ---------------------------------------------------------------------------
// Public sermon contracts (Phase 5B, docs/08 §11.1–11.2, docs/10 §5–6)
//
// The public API exposes only published sermons and only public data: internal
// author/version/lifecycle columns are deliberately absent. IDs and slugs of
// the public taxonomy are included so the frontend can link and build
// structured data (docs/10 §12) without touching Prisma (docs/08 §48).
// ---------------------------------------------------------------------------

/** Sort allowlist for the public sermon archive (docs/08 §11.1, §26). */
export const PUBLIC_SERMON_SORT_FIELDS = [
  'sermonDate',
  'title',
  'publishedAt',
] as const;

export type PublicSermonSortField =
  (typeof PUBLIC_SERMON_SORT_FIELDS)[number];

/** Public preacher summary (never the full admin Person). */
export interface PublicSermonPreacherDto {
  id: string;
  displayName: string;
  role: string | null;
  /** Resolved public photo URL, or null when unset. */
  photoUrl: string | null;
}

/** Public series summary. */
export interface PublicSermonSeriesDto {
  id: string;
  name: string;
  slug: string;
  /** Resolved public cover URL, or null when unset. */
  coverImageUrl: string | null;
}

/** Public topic summary. */
export interface PublicSermonTopicDto {
  id: string;
  name: string;
  slug: string;
}

/**
 * External video reference. Shaped for a schema.org `VideoObject` on the
 * frontend (Phase 9); the API only exposes the data, never the JSON-LD.
 */
export interface PublicSermonVideoDto {
  provider: string;
  externalId: string | null;
  url: string | null;
}

/**
 * Public SEO metadata (docs/10 §11). `title`/`description` fall back to the
 * sermon's own content and `canonicalUrl` to the canonical public route when
 * no explicit `SeoMetadata` row exists, so every public sermon always has a
 * canonical URL (docs/10 §6.1–6.2).
 */
export interface PublicSermonSeoDto {
  title: string;
  description: string | null;
  canonicalUrl: string;
  ogImageUrl: string | null;
}

/** A sermon as exposed by the public API (list and related items). */
export interface PublicSermonDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  scriptureReference: string | null;
  scriptureText: string | null;
  /** Legacy denormalized preacher name, kept when no Person is linked. */
  preacherName: string | null;
  preacher: PublicSermonPreacherDto | null;
  /** ISO-8601 date string, or null. */
  sermonDate: string | null;
  series: PublicSermonSeriesDto | null;
  topics: PublicSermonTopicDto[];
  /** Resolved public cover URL, or null when unset. */
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  video: PublicSermonVideoDto | null;
  audioUrl: string | null;
  notesContent: string | null;
  /** Resolved public URL of the downloadable notes asset, or null. */
  notesUrl: string | null;
  durationMinutes: number | null;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  seo: PublicSermonSeoDto;
}

/** Public sermon detail: the list shape plus related sermons. */
export interface PublicSermonDetailDto extends PublicSermonDto {
  /** Published sermons in the same series or sharing at least one topic. */
  related: PublicSermonDto[];
}

/** Filters accepted by the public sermon archive (docs/08 §11.1). */
export interface PublicSermonListFilters {
  /** Case-insensitive match on title, description or preacher. */
  search?: string;
  /** Case-insensitive match on the preacher name (or preacher id). */
  preacher?: string;
  /** Inclusive `sermonDate` lower bound (ISO date/datetime). */
  from?: string;
  /** Inclusive `sermonDate` upper bound (ISO date/datetime). */
  to?: string;
}

/** Query shape of `GET /api/v1/sermons` (filters + pagination + sort). */
export interface PublicSermonListQuery
  extends PaginationParams, SortParams, PublicSermonListFilters {}

/** Admin listing filters (`GET /api/v1/admin/sermons`, docs/08 §11.3). */
export interface SermonListFilters {
  status?: ContentStatus;
  /** Filter by the author (createdBy) user id. */
  author?: string;
  /** Case-insensitive match on the preacher name. */
  preacher?: string;
  publishedFrom?: string;
  publishedTo?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** Query shape accepted by the admin sermon listing (filters + pagination + sort). */
export interface SermonListQuery
  extends PaginationParams, SortParams, SermonListFilters {}

// ---------------------------------------------------------------------------
// Public events & ministries contracts (Phase 6B, docs/08 §12.1–12.2, §13.1–13.2)
//
// The public API exposes only published content and only public data: internal
// author/version/lifecycle columns are deliberately absent. Category, cover and
// SEO are resolved for the frontend so it never touches Prisma (docs/08 §48).
// ---------------------------------------------------------------------------

/** Sort allowlist for the public event archive (docs/08 §12.1, §26). */
export const PUBLIC_EVENT_SORT_FIELDS = [
  'startAt',
  'publishedAt',
  'title',
] as const;

export type PublicEventSortField = (typeof PUBLIC_EVENT_SORT_FIELDS)[number];

/** Public event-category summary (never the full admin category). */
export interface PublicEventCategoryDto {
  id: string;
  name: string;
  slug: string;
}

/**
 * Public event SEO metadata (docs/10 §11). `title`/`description` fall back to
 * the event's own content and `canonicalUrl` to the canonical public route
 * (`/eventos/:slug`) when no explicit `SeoMetadata` row exists, so every public
 * event always has a canonical URL (docs/10 §6.1–6.2).
 */
export interface PublicEventSeoDto {
  title: string;
  description: string | null;
  canonicalUrl: string;
  ogImageUrl: string | null;
}

/** An event as exposed by the public API (list and detail). */
export interface PublicEventDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: PublicEventCategoryDto | null;
  /** ISO-8601 instant, or null. */
  startAt: string | null;
  /** ISO-8601 instant, or null. */
  endAt: string | null;
  locationName: string | null;
  address: string | null;
  city: string | null;
  /** Resolved public cover URL, or null when unset. */
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  registrationUrl: string | null;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  seo: PublicEventSeoDto;
}

/**
 * Filters accepted by the public event archive (docs/08 §12.1). `category`
 * accepts a category id or slug; `upcoming` restricts to events that have not
 * started yet.
 */
export interface PublicEventListFilters {
  /** Category id or slug. */
  category?: string;
  /** Inclusive `startAt` lower bound (ISO date/datetime). */
  from?: string;
  /** Inclusive `startAt` upper bound (ISO date/datetime). */
  to?: string;
  /** Restrict to events whose `startAt` is at or after now. */
  upcoming?: boolean | string;
}

/** Query shape of `GET /api/v1/events` (filters + pagination + sort). */
export interface PublicEventListQuery
  extends PaginationParams, SortParams, PublicEventListFilters {}

/** Sort allowlist for the public ministry directory (docs/08 §13.1, §26). */
export const PUBLIC_MINISTRY_SORT_FIELDS = [
  'name',
  'publishedAt',
  'updatedAt',
] as const;

export type PublicMinistrySortField =
  (typeof PUBLIC_MINISTRY_SORT_FIELDS)[number];

/**
 * Public ministry SEO metadata. Same fallback contract as events, with the
 * canonical public route `/ministerios/:slug` (docs/10 §6.1–6.2).
 */
export interface PublicMinistrySeoDto {
  title: string;
  description: string | null;
  canonicalUrl: string;
  ogImageUrl: string | null;
}

/** A ministry as exposed by the public API (list and detail). */
export interface PublicMinistryDto {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  /** Resolved public cover URL, or null when unset. */
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  meetingInfo: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  seo: PublicMinistrySeoDto;
}

/** Filters accepted by the public ministry directory (docs/08 §13.1). */
export interface PublicMinistryListFilters {
  /** Case-insensitive match on name, shortDescription or description. */
  search?: string;
  /** Restrict to featured ministries when true. */
  featured?: boolean | string;
}

/** Query shape of `GET /api/v1/ministries` (filters + pagination + sort). */
export interface PublicMinistryListQuery
  extends PaginationParams, SortParams, PublicMinistryListFilters {}

// ---------------------------------------------------------------------------
// Sermon taxonomy listing (Phase 5A, T5)
// ---------------------------------------------------------------------------

/** Filters for the admin people picker (`GET /api/v1/admin/people`). */
export interface PersonListFilters {
  /** Case-insensitive match on display/first/last name. */
  search?: string;
  active?: boolean;
}

export interface PersonListQuery
  extends PaginationParams, SortParams, PersonListFilters {}

/** Filters for the admin series picker (`GET /api/v1/admin/series`). */
export interface SermonSeriesListFilters {
  /** Case-insensitive match on name/slug. */
  search?: string;
}

export interface SermonSeriesListQuery
  extends PaginationParams, SortParams, SermonSeriesListFilters {}

/** Filters for the admin topic picker (`GET /api/v1/admin/topics`). */
export interface TopicListFilters {
  /** Case-insensitive match on name/slug. */
  search?: string;
}

export interface TopicListQuery
  extends PaginationParams, SortParams, TopicListFilters {}

// ---------------------------------------------------------------------------
// ActionResult — paper trail attached to editorial mutations
// ---------------------------------------------------------------------------

/**
 * The revision produced by an editorial action, when one was created. Returned
 * alongside the entity so a client can link straight to the new revision
 * without a follow-up list request.
 */
export interface ActionResult<T> {
  entity: T;
  revision?: RevisionDto;
}
