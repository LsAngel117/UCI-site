/**
 * Site data repository — the ONLY data access point for public components.
 *
 * Components must receive data through props or through these functions; they
 * never import fixtures or (later) the API client directly. When the CMS/API
 * arrives, replace the fixture lookups inside these functions with API calls
 * while keeping the public function signatures stable (docs/02 §66, docs/07 §48).
 *
 * All returned values are already filtered to publicly publishable content.
 */
import {
  churchProfileFixture,
  givingConfigFixture,
  pillarsFixture,
  primaryActionsFixture,
  primaryNavigationFixture,
} from './fixtures/profile';
import { serviceSchedulesFixture } from './fixtures/schedule';
import {
  eventsFixture,
  homepageHeadingsFixture,
  ministriesFixture,
  sermonsFixture,
  storiesFixture,
} from './fixtures/content';
import heroWorship from '../assets/home/hero-worship.png';
import type {
  AboutSection,
  ChurchProfile,
  Event,
  ExploraMensajesContent,
  FinalCtaContent,
  GivingConfig,
  HeroContent,
  HistoriasContent,
  MinisteriosContent,
  Ministry,
  NavigationItem,
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

const DAY_MS = 86_400_000;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Resolve the next concrete occurrence of a recurring weekly service. */
function nextOccurrenceDate(schedule: ServiceSchedule, from: Date): Date | null {
  if (!schedule.active) return null;

  const candidate = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    Math.floor(toMinutes(schedule.startTime) / 60),
    toMinutes(schedule.startTime) % 60,
    0,
    0,
  );

  let dayDelta = (schedule.dayOfWeek - candidate.getDay() + 7) % 7;
  // If the service is today but already started, move to next week.
  if (dayDelta === 0 && candidate.getTime() <= from.getTime()) {
    dayDelta = 7;
  }

  const next = new Date(candidate.getTime() + dayDelta * DAY_MS);

  const validFrom = new Date(schedule.validFrom);
  if (next < validFrom) return validFrom;
  if (schedule.validUntil && next > new Date(schedule.validUntil)) return null;

  return next;
}

export function getChurchProfile(): ChurchProfile {
  return churchProfileFixture;
}

/** Active recurring service schedules for informational display (e.g. footer). */
export function getServiceSchedules(): ServiceSchedule[] {
  return serviceSchedulesFixture.filter((schedule) => schedule.active);
}

/**
 * Next service occurrence across all active recurring schedules.
 * Returns null when no schedule is configured (callers decide the fallback).
 */
export function getNextService(from: Date = new Date()): ServiceOccurrence | null {
  const profile = getChurchProfile();

  const occurrences = serviceSchedulesFixture
    .map((schedule) => {
      const nextDate = nextOccurrenceDate(schedule, from);
      return nextDate ? { schedule, nextDate } : null;
    })
    .filter((value): value is { schedule: ServiceSchedule; nextDate: Date } =>
      value !== null,
    );

  if (occurrences.length === 0) return null;

  occurrences.sort(
    (a, b) =>
      a.nextDate.getTime() - b.nextDate.getTime() ||
      toMinutes(a.schedule.startTime) - toMinutes(b.schedule.startTime),
  );

  return {
    schedule: occurrences[0].schedule,
    nextDate: occurrences[0].nextDate,
    location: profile.location,
  };
}

/** Featured sermon, falling back to the most recent published sermon. */
export function getFeaturedSermon(): Sermon | null {
  const published = sermonsFixture.filter((sermon) => sermon.status === 'published');
  const featured = published.find((sermon) => sermon.featured);
  if (featured) return featured;

  return (
    [...published].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )[0] ?? null
  );
}

/** Published sermons, most recent first, for the archive preview (docs/04 §12). */
export function getRecentSermons(limit = 4): Sermon[] {
  return sermonsFixture
    .filter((sermon) => sermon.status === 'published')
    .sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .slice(0, limit);
}

/** Upcoming published events, soonest first. Past events are excluded. */
export function getUpcomingEvents(limit = 3, from: Date = new Date()): Event[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  return eventsFixture
    .filter((event) => {
      if (event.status !== 'published') return false;
      return new Date(event.startDate).getTime() >= today.getTime();
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, limit);
}

/** Featured published ministries for the homepage subset (docs/04 §14.6). */
export function getFeaturedMinistries(limit = 3): Ministry[] {
  return ministriesFixture
    .filter((ministry) => ministry.status === 'published' && ministry.featured)
    .slice(0, limit);
}

/**
 * Featured story — only published, editorially approved stories may surface.
 * Returns null when no approved story exists (docs/04 §15.5).
 */
export function getFeaturedStory(): Story | null {
  return (
    storiesFixture.find(
      (story) =>
        story.status === 'published' &&
        story.editorialApproved &&
        story.featured,
    ) ?? null
  );
}

export function getNavigation(): SiteNavigation {
  const primary = primaryNavigationFixture.filter((item) => item.visible);

  return {
    primary,
    actions: primaryActionsFixture.filter((item) => item.visible),
    // Footer reuses the same product-controlled destinations.
    footer: primary.map((item) => ({ ...item })) as NavigationItem[],
  };
}

export function getPillars(): Pillar[] {
  return pillarsFixture;
}

export function getGivingConfig(): GivingConfig {
  return givingConfigFixture;
}

/**
 * Hero content with the approved worship image injected.
 *
 * The fixture owns the copy and keeps `backgroundImageUrl` null so the data
 * layer stays free of binary imports (docs/04 §6.3). This repository function
 * is the single place that binds the real asset, and will later map the CMS
 * image URL instead — the component contract does not change.
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

export { toMinutes };