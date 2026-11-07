/**
 * Persisted public settings (Phase 9A1, docs/08 §17, docs/05 §46).
 *
 * All public configuration lives in one JSON `Setting` row under the stable
 * key `church.public`. A single blob keeps the related church profile,
 * schedule, social links and giving copy atomic: one read assembles the public
 * DTO and one write updates any section, with no split-brain between keys.
 *
 * The stored shape is deliberately internal. The public DTO omits unconfigured
 * text fields and exposes `null` for unconfigured URLs; the admin DTO keeps
 * the explicit `null`s so an editor can see what still needs to be filled in.
 *
 * Reading is defensive: a corrupted or partially-written blob falls back to
 * the documented defaults instead of throwing (the public site must stay up),
 * and malformed entries are dropped rather than published.
 */
import type { Prisma } from '@prisma/client';
import type {
  AdminChurchDto,
  AdminSettingsDto,
  PublicChurchDto,
  PublicGivingDto,
  PublicScheduleEntryDto,
  PublicSettingsDto,
  PublicSocialLinkDto,
} from '@shared/settings';
import { isHttpUrl } from '../url';

/** Stable key of the public settings row. */
export const PUBLIC_SETTINGS_KEY = 'church.public';

/** Internal church shape: unconfigured text is stored as `null`. */
export interface StoredChurch {
  name: string;
  shortDescription: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

/** Internal persisted shape of the public settings blob. */
export interface StoredPublicSettings {
  church: StoredChurch;
  schedule: PublicScheduleEntryDto[];
  socials: PublicSocialLinkDto[];
  giving: PublicGivingDto;
}

/**
 * Honest seed defaults, mirrored from the current homepage fixtures
 * (`src/web/data/fixtures/profile.ts` and `schedule.ts`, docs/14 §42).
 * Placeholders are kept explicitly non-production: the address says
 * "por confirmar", services are inactive and social/giving URLs are `null`
 * until UCI configures an official value. No real data is invented.
 */
export const DEFAULT_PUBLIC_SETTINGS: StoredPublicSettings = {
  church: {
    name: 'Iglesia UCI',
    shortDescription:
      'Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.',
    address: 'Dirección por confirmar',
    city: 'Villavicencio',
    state: 'Meta',
    // No contact channel is invented: an editor configures these.
    phone: null,
    email: null,
    whatsapp: null,
  },
  schedule: [
    {
      name: 'Servicio de adoración',
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '11:00',
      active: false,
    },
    {
      name: 'Segundo servicio',
      dayOfWeek: 0,
      startTime: '11:00',
      endTime: '13:00',
      active: false,
    },
  ],
  socials: [
    { platform: 'instagram', label: 'Instagram', url: null },
    { platform: 'facebook', label: 'Facebook', url: null },
    { platform: 'youtube', label: 'YouTube', url: null },
  ],
  giving: {
    title: 'UNA IGLESIA GENEROSA',
    message:
      'Tu generosidad nos permite continuar sirviendo, llevando el mensaje y acompañando a nuestra comunidad.',
    ctaLabel: 'QUIERO DAR',
    url: null,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function storedText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text.length > 0 ? text : fallback;
}

function storedNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isDayOfWeek(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

/** 24h `HH:mm`, zero-padded, 00:00–23:59. */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function readSchedule(value: unknown): PublicScheduleEntryDto[] {
  if (!Array.isArray(value)) return DEFAULT_PUBLIC_SETTINGS.schedule;
  const entries: PublicScheduleEntryDto[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const name = storedNullableText(item.name);
    if (!name || !isDayOfWeek(item.dayOfWeek)) continue;
    if (!isTimeOfDay(item.startTime)) continue;
    entries.push({
      name,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: isTimeOfDay(item.endTime) ? item.endTime : null,
      active: item.active === true,
    });
  }
  return entries;
}

function readSocials(value: unknown): PublicSocialLinkDto[] {
  if (!Array.isArray(value)) return DEFAULT_PUBLIC_SETTINGS.socials;
  const socials: PublicSocialLinkDto[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const platform = storedNullableText(item.platform);
    const label = storedNullableText(item.label);
    if (!platform || !label) continue;
    const url =
      typeof item.url === 'string' && isHttpUrl(item.url.trim())
        ? item.url.trim()
        : null;
    socials.push({ platform, label, url });
  }
  return socials;
}

function readGiving(value: unknown): PublicGivingDto {
  if (!isPlainObject(value)) return DEFAULT_PUBLIC_SETTINGS.giving;
  const url =
    typeof value.url === 'string' && isHttpUrl(value.url.trim())
      ? value.url.trim()
      : null;
  return {
    title: storedText(value.title, DEFAULT_PUBLIC_SETTINGS.giving.title),
    message: storedText(
      value.message,
      DEFAULT_PUBLIC_SETTINGS.giving.message,
    ),
    ctaLabel: storedText(
      value.ctaLabel,
      DEFAULT_PUBLIC_SETTINGS.giving.ctaLabel,
    ),
    url,
  };
}

function readChurch(value: unknown): StoredChurch {
  if (!isPlainObject(value)) return { ...DEFAULT_PUBLIC_SETTINGS.church };
  return {
    name: storedText(value.name, DEFAULT_PUBLIC_SETTINGS.church.name),
    shortDescription: storedText(
      value.shortDescription,
      DEFAULT_PUBLIC_SETTINGS.church.shortDescription,
    ),
    address: storedNullableText(value.address),
    city: storedNullableText(value.city),
    state: storedNullableText(value.state),
    phone: storedNullableText(value.phone),
    email: storedNullableText(value.email),
    whatsapp: storedNullableText(value.whatsapp),
  };
}

/** Normalize an arbitrary persisted JSON value into the internal shape. */
export function readStored(value: Prisma.JsonValue | null): StoredPublicSettings {
  if (!isPlainObject(value)) {
    return {
      church: { ...DEFAULT_PUBLIC_SETTINGS.church },
      schedule: DEFAULT_PUBLIC_SETTINGS.schedule.map((entry) => ({ ...entry })),
      socials: DEFAULT_PUBLIC_SETTINGS.socials.map((entry) => ({ ...entry })),
      giving: { ...DEFAULT_PUBLIC_SETTINGS.giving },
    };
  }
  return {
    church: readChurch(value.church),
    schedule: readSchedule(value.schedule),
    socials: readSocials(value.socials),
    giving: readGiving(value.giving),
  };
}

/**
 * Project the stored settings to the public DTO. Unconfigured church text is
 * omitted (never emitted as an empty string) and nothing internal leaks.
 */
export function toPublicDto(stored: StoredPublicSettings): PublicSettingsDto {
  const church: PublicChurchDto = {
    name: stored.church.name,
    shortDescription: stored.church.shortDescription,
    // Contact channels are always present and explicitly `null` when the
    // editor has not configured one, so the site never invents a value.
    phone: stored.church.phone,
    email: stored.church.email,
    whatsapp: stored.church.whatsapp,
  };
  if (stored.church.address) church.address = stored.church.address;
  if (stored.church.city) church.city = stored.church.city;
  if (stored.church.state) church.state = stored.church.state;

  return {
    church,
    schedule: stored.schedule.map((entry) => ({ ...entry })),
    socials: stored.socials.map((entry) => ({ ...entry })),
    giving: { ...stored.giving },
  };
}

/** Project the stored settings to the complete admin DTO. */
export function toAdminDto(stored: StoredPublicSettings): AdminSettingsDto {
  const church: AdminChurchDto = { ...stored.church };
  return {
    church,
    schedule: stored.schedule.map((entry) => ({ ...entry })),
    socials: stored.socials.map((entry) => ({ ...entry })),
    giving: { ...stored.giving },
  };
}
