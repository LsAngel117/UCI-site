/**
 * Site data repository — the ONLY data access point for public components.
 *
 * Structural copy (hero, section labels/headings/CTAs, pillars, first-visit
 * content, giving copy, final CTA) is product-controlled and stays here as
 * constants (docs/04 §20). Dynamic content is fetched from the public API at
 * request time through `src/web/lib/api.ts` (docs/15 §15, Phase 9A):
 *
 * - sermons / events / ministries come from the published public endpoints;
 * - church profile, schedule, socials and giving come from `settings/public`;
 * - header/footer navigation comes from `navigation?location=...`.
 *
 * Components never import fixtures or the API client directly. They receive
 * data through props (the homepage) or through these getters (other routes).
 *
 * Degradation rule: when the API is unreachable the homepage must still render
 * honestly. Dynamic collections degrade to empty arrays and detail values to
 * `null`; product-controlled copy and navigation fall back to the approved
 * structural defaults. Nothing is invented to fill a gap.
 */
import { pillarsFixture } from './fixtures/profile';
import { homepageHeadingsFixture } from './fixtures/content';
import heroWorship from '../assets/home/hero-worship.png';
import {
  getEvents,
  getMinistries,
  getNavigation as fetchNavigation,
  getSermons,
  getSettingsPublic,
  getStories,
} from '../lib/api';
import {
  buildChurchProfile,
  buildGivingConfig,
  buildNextService,
  buildServiceSchedules,
  buildSiteNavigation,
  buildVisibleSchedules,
  toMinutes,
} from './mappers';
import type { ListResponse } from '@shared/api';
import type {
  NavigationLocation,
  PublicEventDto,
  PublicMinistryDto,
  PublicNavigationItemDto,
  PublicSermonDto,
  PublicStoryDto,
} from '@shared/cms';
import type { PublicSettingsDto } from '@shared/settings';
import type {
  AboutSection,
  ChurchProfile,
  Event,
  ExploraMensajesContent,
  FinalCtaContent,
  GivingConfig,
  HeroContent,
  HistoriasContent,
  Location,
  MinisteriosContent,
  Ministry,
  Person,
  Pillar,
  PillarsSection,
  PrimeraVezContent,
  ProximoServicioContent,
  ProximosEventosContent,
  Sermon,
  ServiceOccurrence,
  ServiceSchedule,
  SiteNavigation,
  Story,
  UltimoSermonContent,
} from '@shared/types';

import { DEFAULT_CHURCH_TIME_ZONE } from '../lib/format';

/** Church-local rendering timezone for API instants (docs/05 §43). */
const DEFAULT_TIME_ZONE = DEFAULT_CHURCH_TIME_ZONE;

function warnUnavailable(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[uci] ${scope} unavailable — rendering an honest empty state (${message}).`,
  );
}

// ---------------------------------------------------------------------------
// Structural copy (product-controlled, static — docs/04 §20)
// ---------------------------------------------------------------------------

export function getPillars(): Pillar[] {
  return pillarsFixture;
}

/**
 * Hero content with the approved worship image injected.
 *
 * The fixture owns the copy and keeps `backgroundImageUrl` null so the data
 * layer stays free of binary imports (docs/04 §6.3). This repository function
 * is the single place that binds the real asset.
 */
export function getHeroContent(): HeroContent {
  return {
    ...homepageHeadingsFixture.hero,
    backgroundImageUrl: heroWorship,
  };
}

export function getAboutSection(): AboutSection {
  return homepageHeadingsFixture.about;
}

/** Pillars with approved imagery and the structural section copy. */
export function getPillarsSection(): PillarsSection {
  return {
    ...homepageHeadingsFixture.pillars,
    pillars: pillarsFixture,
  };
}

export function getProximoServicioContent(): ProximoServicioContent {
  return homepageHeadingsFixture.proximoServicio;
}

export function getPrimeraVezContent(): PrimeraVezContent {
  return homepageHeadingsFixture.primeraVez;
}

export function getUltimoSermonContent(): UltimoSermonContent {
  return homepageHeadingsFixture.ultimoSermon;
}

export function getExploraMensajesContent(): ExploraMensajesContent {
  return homepageHeadingsFixture.exploraMensajes;
}

export function getProximosEventosContent(): ProximosEventosContent {
  return homepageHeadingsFixture.proximosEventos;
}

export function getMinisteriosContent(): MinisteriosContent {
  return homepageHeadingsFixture.ministerios;
}

export function getHistoriasContent(): HistoriasContent {
  return homepageHeadingsFixture.historias;
}

export function getFinalCtaContent(): FinalCtaContent {
  return homepageHeadingsFixture.finalCta;
}

/**
 * Featured story from the public stories endpoint (improvement B2). The API
 * already returns only published + editorially approved testimonies, so the
 * repository never decides visibility itself. No featured row and an empty
 * collection both resolve to `null` and render the honest empty state.
 */
export async function getFeaturedStory(): Promise<Story | null> {
  try {
    const response = await getStories({ limit: 6, sort: 'publishedAt', order: 'desc' });
    const featured =
      response.data.find((story) => story.featured) ?? response.data[0] ?? null;
    return featured ? mapStory(featured) : null;
  } catch (error) {
    warnUnavailable('stories', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Settings / navigation → domain mappers
// ---------------------------------------------------------------------------
//
// The pure mappers live in `./mappers` so they can be unit-tested without
// loading image assets. Re-exported here to keep the repository's public API.
export {
  buildChurchProfile,
  buildGivingConfig,
  buildNextService,
  buildServiceSchedules,
  buildSiteNavigation,
  buildVisibleSchedules,
  toMinutes,
};

// ---------------------------------------------------------------------------
// Public API DTO → domain mapping
// ---------------------------------------------------------------------------

function mapPreacher(dto: PublicSermonDto): Person {
  if (dto.preacher) {
    return {
      id: dto.preacher.id,
      firstName: '',
      lastName: '',
      displayName: dto.preacher.displayName,
      photoUrl: dto.preacher.photoUrl,
      role: dto.preacher.role ?? undefined,
      publicProfileEnabled: true,
      active: true,
    };
  }

  const displayName = dto.preacherName?.trim() || 'Predicador por confirmar';
  return {
    id: `preacher-${dto.id}`,
    firstName: '',
    lastName: '',
    displayName,
    photoUrl: null,
    publicProfileEnabled: false,
    active: true,
  };
}

export function mapSermon(dto: PublicSermonDto): Sermon {
  const publishedAt = dto.publishedAt ?? dto.updatedAt;
  const videoProvider =
    dto.video?.provider === 'youtube'
      ? 'youtube'
      : dto.video?.provider === 'vimeo'
        ? 'vimeo'
        : 'external';

  return {
    id: dto.id,
    title: dto.title,
    slug: dto.slug,
    summary: dto.description ?? '',
    preacher: mapPreacher(dto),
    date: dto.sermonDate ?? publishedAt,
    series: dto.series
      ? {
          id: dto.series.id,
          name: dto.series.name,
          slug: dto.series.slug,
          coverImageUrl: dto.series.coverImageUrl,
        }
      : undefined,
    topics: dto.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
    })),
    imageUrl: dto.coverImageUrl,
    video: dto.video
      ? {
          provider: videoProvider,
          externalId: dto.video.externalId ?? undefined,
          url: dto.video.url ?? '',
        }
      : undefined,
    audio: dto.audioUrl
      ? { provider: 'external', url: dto.audioUrl }
      : undefined,
    notesAvailable: Boolean(dto.notesUrl || dto.notesContent),
    notesUrl: dto.notesUrl ?? undefined,
    scripture: dto.scriptureReference ?? '',
    scriptureReferences: dto.scriptureReference
      ? [dto.scriptureReference]
      : [],
    durationMinutes: dto.durationMinutes ?? undefined,
    featured: dto.featured,
    status: 'published',
    publishedAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapSermons(dtos: PublicSermonDto[]): Sermon[] {
  return dtos.map(mapSermon);
}

export function mapStory(dto: PublicStoryDto): Story {
  return {
    id: dto.id,
    title: dto.title,
    displayName: dto.displayName,
    quote: dto.quote,
    fullStory: dto.fullStory,
    imageUrl: dto.coverImageUrl,
    date: dto.date ?? dto.publishedAt ?? dto.updatedAt,
    editorialApproved: true,
    featured: dto.featured,
    status: 'published',
  };
}

const eventDateFormatters = new Map<string, Intl.DateTimeFormat>();
const eventTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function eventDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = eventDateFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  eventDateFormatters.set(timeZone, formatter);
  return formatter;
}

function eventTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = eventTimeFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  eventTimeFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Map a public event. The API exposes one ISO instant (`startAt`/`endAt`) and
 * optional location text; the homepage presents separate date/time fields.
 * Events without a start instant are not publishable agenda items and are
 * dropped rather than rendered with an invented date.
 */
export function mapEvent(
  dto: PublicEventDto,
  timeZone: string = DEFAULT_TIME_ZONE,
): Event | null {
  if (!dto.startAt) return null;

  let zone = DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    zone = timeZone;
  } catch {
    // Invalid configured zone: fall back to the documented default.
  }

  const start = new Date(dto.startAt);
  if (Number.isNaN(start.getTime())) return null;

  const end = dto.endAt ? new Date(dto.endAt) : null;

  const location: Location = {
    id: `event-location-${dto.id}`,
    name: dto.locationName?.trim() || 'Ubicación por confirmar',
    address: dto.address?.trim() || 'Dirección por confirmar',
    city: dto.city?.trim() || '',
    state: '',
    country: 'Colombia',
    coordinates: { latitude: 0, longitude: 0 },
    mapUrl: '',
    confirmed: false,
    isPrimary: false,
    active: true,
  };

  return {
    id: dto.id,
    title: dto.title,
    slug: dto.slug,
    summary: dto.summary ?? '',
    description: dto.description ?? '',
    imageUrl: dto.coverImageUrl,
    category: dto.category
      ? { id: dto.category.id, name: dto.category.name, slug: dto.category.slug }
      : { id: `category-${dto.id}`, name: 'Evento', slug: 'evento' },
    startDate: eventDateFormatter(zone).format(start),
    endDate:
      end && !Number.isNaN(end.getTime())
        ? eventDateFormatter(zone).format(end)
        : undefined,
    startTime: eventTimeFormatter(zone).format(start),
    endTime:
      end && !Number.isNaN(end.getTime())
        ? eventTimeFormatter(zone).format(end)
        : undefined,
    location,
    registrationUrl: dto.registrationUrl ?? undefined,
    featured: dto.featured,
    status: 'published',
  };
}

export function mapEvents(
  dtos: PublicEventDto[],
  timeZone: string = DEFAULT_TIME_ZONE,
): Event[] {
  return dtos
    .map((dto) => mapEvent(dto, timeZone))
    .filter((event): event is Event => event !== null);
}

export function mapMinistry(dto: PublicMinistryDto): Ministry {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    shortDescription: dto.shortDescription ?? '',
    description: dto.description ?? '',
    imageUrl: dto.coverImageUrl,
    leaders: [],
    schedule: dto.meetingInfo ?? undefined,
    featured: dto.featured,
    status: 'published',
  };
}

export function mapMinistries(dtos: PublicMinistryDto[]): Ministry[] {
  return dtos.map(mapMinistry);
}

// ---------------------------------------------------------------------------
// Async data getters (API-backed, honestly degrading)
// ---------------------------------------------------------------------------

/** Public settings, or `null` when the API is unavailable. */
export async function getSettings(): Promise<PublicSettingsDto | null> {
  try {
    return await getSettingsPublic();
  } catch (error) {
    warnUnavailable('settings/public', error);
    return null;
  }
}

async function fetchNavigationSafe(
  location: NavigationLocation,
): Promise<PublicNavigationItemDto[] | null> {
  try {
    return await fetchNavigation(location);
  } catch (error) {
    warnUnavailable(`navigation (${location})`, error);
    return null;
  }
}

export async function getChurchProfile(
  settings?: PublicSettingsDto | null,
): Promise<ChurchProfile> {
  const resolved =
    settings === undefined ? await getSettings() : settings;
  return buildChurchProfile(resolved);
}

/** Active recurring service schedules for informational display (footer). */
export async function getServiceSchedules(
  settings?: PublicSettingsDto | null,
): Promise<ServiceSchedule[]> {
  const resolved =
    settings === undefined ? await getSettings() : settings;
  return buildVisibleSchedules(resolved);
}

export async function getNextService(
  from: Date = new Date(),
  settings?: PublicSettingsDto | null,
): Promise<ServiceOccurrence | null> {
  const resolved =
    settings === undefined ? await getSettings() : settings;
  const church = buildChurchProfile(resolved);
  const schedules = buildServiceSchedules(resolved);
  return buildNextService(schedules, church.location, from);
}

/**
 * Site navigation. Header and footer are fetched together; the approved
 * structural menu is the fallback when a menu is unavailable or empty.
 */
export async function getNavigation(): Promise<SiteNavigation> {
  const [header, footer] = await Promise.all([
    fetchNavigationSafe('HEADER'),
    fetchNavigationSafe('FOOTER'),
  ]);
  return buildSiteNavigation(header, footer);
}

async function fetchSermonsSafe(
  limit: number,
): Promise<ListResponse<PublicSermonDto> | null> {
  try {
    return await getSermons({
      limit,
      sort: 'sermonDate',
      order: 'desc',
    });
  } catch (error) {
    warnUnavailable('sermons', error);
    return null;
  }
}

/** Featured sermon, falling back to the most recent published sermon. */
export async function getFeaturedSermon(): Promise<Sermon | null> {
  const response = await fetchSermonsSafe(12);
  if (!response || response.data.length === 0) return null;

  const featured = response.data.find((sermon) => sermon.featured);
  return mapSermon(featured ?? response.data[0]!);
}

/** Published sermons, most recent first, for the archive preview (docs/04 §12). */
export async function getRecentSermons(limit = 4): Promise<Sermon[]> {
  const response = await fetchSermonsSafe(Math.max(limit, 4));
  if (!response) return [];
  return mapSermons(response.data.slice(0, limit));
}

/** Upcoming published events, soonest first. */
export async function getUpcomingEvents(
  limit = 3,
  timeZone?: string,
): Promise<Event[]> {
  try {
    const zone =
      timeZone ?? (await getSettings())?.timezone ?? DEFAULT_TIME_ZONE;
    const response = await getEvents({
      upcoming: true,
      limit,
      sort: 'startAt',
      order: 'asc',
    });
    return mapEvents(response.data, zone);
  } catch (error) {
    warnUnavailable('events', error);
    return [];
  }
}

/** Featured published ministries for the homepage subset (docs/04 §14.6). */
export async function getFeaturedMinistries(limit = 3): Promise<Ministry[]> {
  try {
    const response = await getMinistries({
      featured: true,
      limit,
      sort: 'publishedAt',
      order: 'desc',
    });
    return mapMinistries(response.data);
  } catch (error) {
    warnUnavailable('ministries', error);
    return [];
  }
}

/** Giving copy from `settings/public`, with the approved structural fallback. */
export async function getGivingConfig(
  settings?: PublicSettingsDto | null,
): Promise<GivingConfig> {
  const resolved =
    settings === undefined ? await getSettings() : settings;
  return buildGivingConfig(resolved);
}

async function fetchStoriesSafe(
  limit: number,
): Promise<ListResponse<PublicStoryDto> | null> {
  try {
    return await getStories({
      limit,
      sort: 'publishedAt',
      order: 'desc',
    });
  } catch (error) {
    warnUnavailable('stories', error);
    return null;
  }
}

/**
 * Everything the homepage needs, fetched in parallel.
 *
 * One round of concurrent requests keeps the page fast and — critically —
 * bounds the failure latency when the API is down: every request shares the
 * same timeout window instead of blocking the render sequentially.
 */
export interface HomeData {
  church: ChurchProfile;
  /** Church-local IANA timezone from settings (B1). */
  timezone: string;
  hero: HeroContent;
  nextService: ServiceOccurrence | null;
  schedules: ServiceSchedule[];
  navigation: SiteNavigation;
  giving: GivingConfig;
  featuredSermon: Sermon | null;
  recentSermons: Sermon[];
  upcomingEvents: Event[];
  featuredMinistries: Ministry[];
  featuredStory: Story | null;
}

export async function getHomeData(from: Date = new Date()): Promise<HomeData> {
  const [settings, headerNav, footerNav, sermonResponse, events, ministries, stories] =
    await Promise.all([
      getSettings(),
      fetchNavigationSafe('HEADER'),
      fetchNavigationSafe('FOOTER'),
      fetchSermonsSafe(12),
      getUpcomingEvents(3),
      getFeaturedMinistries(3),
      fetchStoriesSafe(6),
    ]);

  const timezone = settings?.timezone ?? DEFAULT_TIME_ZONE;

  const church = buildChurchProfile(settings);
  const schedules = buildServiceSchedules(settings);
  const sermonDtos = sermonResponse?.data ?? [];
  const featuredSermonDto =
    sermonDtos.find((sermon) => sermon.featured) ?? sermonDtos[0] ?? null;

  const featuredStoryDto =
    stories?.data.find((story) => story.featured) ?? stories?.data[0] ?? null;

  return {
    church,
    timezone,
    hero: getHeroContent(),
    nextService: buildNextService(schedules, church.location, from),
    schedules: buildVisibleSchedules(settings),
    navigation: buildSiteNavigation(headerNav, footerNav),
    giving: buildGivingConfig(settings),
    featuredSermon: featuredSermonDto ? mapSermon(featuredSermonDto) : null,
    recentSermons: mapSermons(sermonDtos.slice(0, 4)),
    upcomingEvents: events,
    featuredMinistries: ministries,
    featuredStory: featuredStoryDto ? mapStory(featuredStoryDto) : null,
  };
}
