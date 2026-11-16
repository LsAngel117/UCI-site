/**
 * Pure settings/DTO → domain mappers (Phase 9A).
 *
 * These functions carry the honest-degradation contract:
 * - the structural fixtures are used ONLY when the source is unavailable
 *   (`settings === null` / a navigation list is `null`);
 * - when a source exists, a field the editor cleared is rendered empty, never
 *   back-filled with an old fixture value;
 * - an empty CMS collection is respected as an intentional empty state.
 *
 * The module imports no image assets and performs no network/database access,
 * so every rule here is unit-testable on its own.
 */
import type { PublicNavigationItemDto } from '@shared/cms';
import type { PublicSettingsDto } from '@shared/settings';
import type {
  ChurchProfile,
  GivingConfig,
  Location,
  NavigationItem,
  ServiceOccurrence,
  ServiceSchedule,
  SiteNavigation,
} from '@shared/types';
import { churchProfileFixture, givingConfigFixture } from './fixtures/church';
import {
  primaryActionsFixture,
  primaryNavigationFixture,
} from './fixtures/navigation';

const DAY_MS = 86_400_000;

export function toMinutes(time: string): number {
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

/**
 * Merge `settings/public` into the structural church profile.
 *
 * When `settings` is present, every configured/cleared value comes from it:
 * cleared address fields stay empty, unconfigured contact stays empty and
 * unconfigured social links are dropped (never rendered as `#`). The fixture
 * is only the controlled fallback for an unavailable API, and even then it
 * carries no fictitious contact data.
 */
export function buildChurchProfile(
  settings: PublicSettingsDto | null,
): ChurchProfile {
  if (!settings) {
    return {
      ...churchProfileFixture,
      location: { ...churchProfileFixture.location },
    };
  }

  const { church } = settings;
  const address = church.address?.trim() ?? '';
  const city = church.city?.trim() ?? '';
  const state = church.state?.trim() ?? '';
  const isPlaceholderAddress = /por confirmar/i.test(address);

  const confirmed = Boolean(address && city) && !isPlaceholderAddress;
  const mapUrl = confirmed
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [address, city, state, 'Colombia'].filter(Boolean).join(', '),
      )}`
    : '';

  const location: Location = {
    ...churchProfileFixture.location,
    // Settings carry no venue name; an empty name keeps the placeholder out of
    // the public footer ("Sede principal (placeholder)" must never render).
    name: '',
    address,
    city,
    state,
    mapUrl,
    confirmed,
  };

  // An unconfigured URL is `null`; filter it out rather than rendering `#`.
  const socialLinks = settings.socials
    .filter(
      (social) =>
        typeof social.url === 'string' && social.url.trim().length > 0,
    )
    .map((social) => ({
      platform: social.platform,
      label: social.label,
      url: social.url as string,
    }));

  return {
    ...churchProfileFixture,
    name: church.name.trim(),
    shortDescription: church.shortDescription.trim(),
    phone: church.phone?.trim() ?? '',
    whatsapp: church.whatsapp?.trim() ?? '',
    email: church.email?.trim() ?? '',
    location,
    socialLinks,
  };
}

/** Map published weekly schedule entries onto the domain schedule shape. */
export function buildServiceSchedules(
  settings: PublicSettingsDto | null,
): ServiceSchedule[] {
  if (!settings) return [];

  return settings.schedule.map((entry) => ({
    id: `svc-${entry.dayOfWeek}-${entry.startTime.replace(':', '')}`,
    name: entry.name,
    dayOfWeek: entry.dayOfWeek,
    startTime: entry.startTime,
    endTime: entry.endTime ?? undefined,
    locationId: churchProfileFixture.location.id,
    active: entry.active,
    // Settings carry no validity window; the schedule is always current.
    validFrom: '1970-01-01T00:00:00.000Z',
  }));
}

/** Next active occurrence across the configured schedules. */
export function buildNextService(
  schedules: ServiceSchedule[],
  location: Location,
  from: Date = new Date(),
): ServiceOccurrence | null {
  const occurrences = schedules
    .map((schedule) => {
      const nextDate = nextOccurrenceDate(schedule, from);
      return nextDate ? { schedule, nextDate } : null;
    })
    .filter(
      (value): value is { schedule: ServiceSchedule; nextDate: Date } =>
        value !== null,
    );

  if (occurrences.length === 0) return null;

  occurrences.sort(
    (a, b) =>
      a.nextDate.getTime() - b.nextDate.getTime() ||
      toMinutes(a.schedule.startTime) - toMinutes(b.schedule.startTime),
  );

  return {
    schedule: occurrences[0]!.schedule,
    nextDate: occurrences[0]!.nextDate,
    location,
  };
}

/** Giving copy from settings, falling back to the approved structural copy. */
export function buildGivingConfig(
  settings: PublicSettingsDto | null,
): GivingConfig {
  if (!settings) return givingConfigFixture;
  return settings.giving;
}

/** Active recurring service schedules for informational display (footer). */
export function buildVisibleSchedules(
  settings: PublicSettingsDto | null,
): ServiceSchedule[] {
  return buildServiceSchedules(settings).filter((schedule) => schedule.active);
}

function mapNavigationItems(
  items: PublicNavigationItemDto[],
): NavigationItem[] {
  return items.map((item, index) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    external: item.external,
    order: index + 1,
    visible: true,
    children: item.children?.length
      ? mapNavigationItems(item.children)
      : undefined,
  }));
}

/**
 * Build the header/footer navigation.
 *
 * A `null` menu means the API was unavailable, so the approved structural
 * destinations keep the site navigable. An empty array is a deliberate CMS
 * state (an editor cleared the menu) and is respected as-is. The two header
 * actions are structurally product-controlled CTAs.
 */
export function buildSiteNavigation(
  header: PublicNavigationItemDto[] | null,
  footer: PublicNavigationItemDto[] | null,
): SiteNavigation {
  const primary =
    header === null
      ? primaryNavigationFixture
          .filter((item) => item.visible)
          .map((item, index) => ({ ...item, order: index + 1 }))
      : mapNavigationItems(header);

  const footerItems =
    footer === null
      ? primary.map((item) => ({
          ...item,
          children: item.children?.map((child) => ({ ...child })),
        }))
      : mapNavigationItems(footer);

  return {
    primary,
    actions: primaryActionsFixture.filter((item) => item.visible),
    footer: footerItems,
  };
}
