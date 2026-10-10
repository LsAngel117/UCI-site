/**
 * Domain types for the public website.
 *
 * These types model the public-facing content of Iglesia UCI as described in
 * `docs/05-content-model-cms.md` and consumed by the homepage per
 * `docs/04-home-page-spec.md`.
 *
 * They intentionally mirror API DTOs rather than database models: the public
 * frontend must consume DTOs (docs/02 §66), so field names stay presentation
 * friendly and image fields carry resolved URLs, not storage internals.
 *
 * Components must never import these directly to fetch data — they receive
 * props or call the repository in `src/web/data/site.ts`.
 */
import type { ImageMetadata } from 'astro';

/**
 * A resolved image reference.
 *
 * During the static/fixture phase, approved local assets arrive as Astro
 * `ImageMetadata` (imported by the data layer, never by components). When the
 * CMS/API is wired in, the same field will carry a resolved public URL string.
 * `null` means the media is not available yet and the consumer renders
 * `MediaPlaceholder` instead.
 */
export type MediaSource = ImageMetadata | string | null;

/** Editorial lifecycle shared by CMS-managed content (docs/05 §29). */
export type ContentStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'unpublished'
  | 'archived';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  coordinates: Coordinates;
  /** External map / directions URL. */
  mapUrl: string;
  directions?: string;
  /**
   * True once the address is real church data. Placeholder locations stay
   * false so structured data (JSON-LD) omits them instead of publishing
   * unverified information (docs/10 §12.1).
   */
  confirmed: boolean;
  isPrimary: boolean;
  active: boolean;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  /** Resolved public image, or null while media is unavailable. */
  photoUrl: MediaSource;
  shortDescription?: string;
  role?: string;
  publicProfileEnabled: boolean;
  active: boolean;
}

/** Reusable call-to-action descriptor rendered by Button.astro. */
export interface CtaLink {
  label: string;
  href: string;
  /** True for fully qualified URLs that should open in a new tab. */
  external?: boolean;
}

/** Institutional information (docs/05 §4.1). */
export interface ChurchProfile {
  name: string;
  fullName: string;
  shortDescription: string;
  institutionalDescription: string;
  mission: string;
  vision: string;
  motto: string;
  phone: string;
  whatsapp: string;
  email: string;
  location: Location;
  /** Resolved public logo images. */
  logoFullUrl: MediaSource;
  logoCompactUrl: MediaSource;
  institutionalImageUrl: MediaSource;
  socialLinks: SocialLink[];
}

export interface SocialLink {
  platform: string;
  label: string;
  url: string;
}

/**
 * Recurring weekly service (docs/05 §5). Modeled separately from events so a
 * recurring service exists without an individual event per date.
 */
export interface ServiceSchedule {
  id: string;
  name: string;
  /** 0 = Sunday ... 6 = Saturday. */
  dayOfWeek: number;
  /** 24h "HH:mm" local time. */
  startTime: string;
  endTime?: string;
  locationId: string;
  description?: string;
  active: boolean;
  validFrom: string;
  validUntil?: string;
  notes?: string;
}

/** A service schedule resolved to its next concrete occurrence. */
export interface ServiceOccurrence {
  schedule: ServiceSchedule;
  nextDate: Date;
  location: Location;
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
}

export interface SermonSeries {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: MediaSource;
}

export interface ExternalMedia {
  provider: 'youtube' | 'vimeo' | 'external';
  externalId?: string;
  url: string;
}

/** Sermon (docs/05 §8), limited to what the homepage presents. */
export interface Sermon {
  id: string;
  title: string;
  slug: string;
  summary: string;
  preacher: Person;
  date: string;
  series?: SermonSeries;
  topics: Topic[];
  imageUrl: MediaSource;
  video?: ExternalMedia;
  audio?: ExternalMedia;
  notesAvailable: boolean;
  notesUrl?: string;
  scripture: string;
  scriptureReferences: string[];
  durationMinutes?: number;
  featured: boolean;
  status: ContentStatus;
  publishedAt: string;
  updatedAt: string;
}

export interface EventCategory {
  id: string;
  name: string;
  slug: string;
}

/** Event (docs/05 §11). */
export interface Event {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  imageUrl: MediaSource;
  category: EventCategory;
  startDate: string;
  endDate?: string;
  startTime: string;
  endTime?: string;
  location: Location;
  organizer?: Person;
  registrationUrl?: string;
  featured: boolean;
  status: ContentStatus;
}

/** Ministry (docs/05 §13). */
export interface Ministry {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  imageUrl: MediaSource;
  leaders: Person[];
  schedule?: string;
  locationId?: string;
  featured: boolean;
  status: ContentStatus;
}

/** Public story / testimony (docs/05 §14). */
export interface Story {
  id: string;
  title: string;
  displayName: string;
  person?: Person;
  quote: string;
  fullStory: string;
  imageUrl: MediaSource;
  date: string;
  /** Editorial consent/approval flag — only approved stories may publish. */
  editorialApproved: boolean;
  featured: boolean;
  status: ContentStatus;
}

/** Navigation entry (docs/05 §45, docs/02 §21). */
export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  external?: boolean;
  order: number;
  visible: boolean;
  children?: NavigationItem[];
}

export interface SiteNavigation {
  primary: NavigationItem[];
  actions: NavigationItem[];
  footer: NavigationItem[];
}

/** Giving configuration (docs/05 §24) — never invent financial data. */
export interface GivingConfig {
  title: string;
  message: string;
  ctaLabel: string;
  /** Null until UCI configures an official giving mechanism. */
  url: string | null;
}

/** Structured content for the homepage Hero (docs/04 §6.2). */
export interface HeroContent {
  label: string;
  /** First heading line, rendered unaccented. */
  headingLineOne: string;
  /** Accented (gold) second heading line — the single source for the emphasis. */
  headingAccent: string;
  supportingText: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  /** Approved hero worship image, or null while media is unavailable (docs/04 §6.3). */
  backgroundImageUrl: MediaSource;
}

/** Structured content for the Somos UCI section (docs/04 §7). */
export interface AboutSection {
  label: string;
  heading: string;
  body: string;
  cta: CtaLink;
}

/** A single editable pillar (docs/04 §8). */
export interface Pillar {
  id: string;
  name: string;
  description: string;
  imageUrl: MediaSource;
}

/** Structured copy for an "En UCI" three-pillars section (docs/04 §8). */
export interface PillarsSection {
  label: string;
  heading: string;
  pillars: Pillar[];
}

/** A titled paragraph block answering a first-time-visitor question (docs/04 §10.3). */
export interface VisitaBlock {
  id: string;
  /** Icon key resolved by the consuming section against the Lucide set. */
  icon: string;
  title: string;
  body: string;
}

/** Structured copy for the first-time-visitor section (docs/04 §10). */
export interface PrimeraVezContent {
  label: string;
  heading: string;
  supportingText: string;
  blocks: VisitaBlock[];
  cta: CtaLink;
}

/** Structured copy for the practical next-service section (docs/04 §9). */
export interface ProximoServicioContent {
  label: string;
  heading: string;
  supportingText: string;
  cta: CtaLink;
}

/** Structured copy + data for the latest-sermon feature (docs/04 §11). */
export interface UltimoSermonContent {
  label: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  archiveHref: string;
}

/** Structured copy for the sermon archive preview (docs/04 §12). */
export interface ExploraMensajesContent {
  label: string;
  heading: string;
  filters: string[];
  cta: CtaLink;
}

/** Structured copy for the upcoming-events section (docs/04 §13). */
export interface ProximosEventosContent {
  label: string;
  heading: string;
  emptyMessage: string;
  cta: CtaLink;
}

/** Structured copy for the ministries section (docs/04 §14). */
export interface MinisteriosContent {
  label: string;
  heading: string;
  supportingText: string;
  cta: CtaLink;
}

/** Structured copy for the stories section (docs/04 §15). */
export interface HistoriasContent {
  label: string;
  heading: string;
}

/** Structured copy for the final cinematic CTA (docs/04 §17). */
export interface FinalCtaContent {
  heading: string;
  supportingText: string;
  cta: CtaLink;
}

/** SEO metadata (docs/05 §26). */
export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
}