/**
 * Public + administrative settings contracts (Phase 9A1, docs/08 §17,
 * docs/05 §46).
 *
 * The public website consumes `PublicSettingsDto` from the unauthenticated
 * `/api/v1/settings/public` endpoint. The admin panel consumes
 * `AdminSettingsDto` from `/api/v1/admin/settings`. Both are plain DTOs: no
 * Prisma model, no storage key and no secret is ever part of these shapes
 * (docs/02 §66, docs/08 §48, §55).
 *
 * Design notes:
 * - A field that is not configured yet is represented honestly: optional
 *   strings are omitted from the public DTO, while URLs that have no official
 *   value are `null`. Nothing is invented.
 * - Schedule entries are weekly recurring services (docs/05 §5). `dayOfWeek`
 *   is 0 = Sunday … 6 = Saturday and times are 24h `HH:mm`.
 * - The admin DTO is the complete stored configuration (an editor sees the
 *   unconfigured `null` values); the public DTO is the normalized public view.
 */

// ---------------------------------------------------------------------------
// Public DTOs (read-only, unauthenticated)
// ---------------------------------------------------------------------------

/** Public institutional identity (docs/05 §4.1). */
export interface PublicChurchDto {
  name: string;
  shortDescription: string;
  /** Omitted until a real address is configured (docs/04 §6.6). */
  address?: string;
  city?: string;
  state?: string;
  /** `null` until UCI configures each contact channel. */
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

/** A recurring weekly service as published on the website (docs/05 §5). */
export interface PublicScheduleEntryDto {
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** 24h `HH:mm` local time. */
  startTime: string;
  /** 24h `HH:mm` local time, or `null` when the service has no fixed end. */
  endTime: string | null;
  /** False while the schedule is still a placeholder to be confirmed. */
  active: boolean;
}

/** A public social profile. `url` is `null` until UCI configures it. */
export interface PublicSocialLinkDto {
  platform: string;
  label: string;
  url: string | null;
}

/** Public giving call-to-action (docs/05 §24) — never invents financial data. */
export interface PublicGivingDto {
  title: string;
  message: string;
  ctaLabel: string;
  /** `null` until an official giving mechanism is configured. */
  url: string | null;
}

/** Payload of `GET /api/v1/settings/public` inside the `{ data }` envelope. */
export interface PublicSettingsDto {
  church: PublicChurchDto;
  schedule: PublicScheduleEntryDto[];
  socials: PublicSocialLinkDto[];
  giving: PublicGivingDto;
}

// ---------------------------------------------------------------------------
// Administrative DTOs (settings.read / settings.update)
// ---------------------------------------------------------------------------

/**
 * Complete stored church identity. Unconfigured values are explicit `null`
 * so the editor can tell "not set" apart from an empty public field.
 */
export interface AdminChurchDto {
  name: string;
  shortDescription: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

/** Payload of `GET/PATCH /api/v1/admin/settings` inside `{ data }`. */
export interface AdminSettingsDto {
  church: AdminChurchDto;
  schedule: PublicScheduleEntryDto[];
  socials: PublicSocialLinkDto[];
  giving: PublicGivingDto;
}

// ---------------------------------------------------------------------------
// PATCH inputs
// ---------------------------------------------------------------------------

/**
 * Partial church update. Every field is optional; a provided field replaces
 * the stored value, while an omitted field is left untouched. Address fields
 * accept `null` (or a blank string) to clear them.
 */
export interface UpdateChurchInput {
  name?: string;
  shortDescription?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

/** A schedule entry supplied by an editor. The whole array is replaced. */
export interface UpdateScheduleEntryInput {
  name: string;
  dayOfWeek: number;
  startTime: string;
  endTime?: string | null;
  active: boolean;
}

/** A social link supplied by an editor. The whole array is replaced. */
export interface UpdateSocialLinkInput {
  platform: string;
  label: string;
  url: string | null;
}

/** Partial giving update; a provided field replaces the stored value. */
export interface UpdateGivingInput {
  title?: string;
  message?: string;
  ctaLabel?: string;
  url?: string | null;
}

/**
 * Body of `PATCH /api/v1/admin/settings`.
 *
 * Section semantics are intentionally simple and predictable:
 * - `church` and `giving` are partial merges;
 * - `schedule` and `socials` replace their entire collection.
 *
 * An empty object is a valid no-op.
 */
export interface UpdateSettingsInput {
  church?: UpdateChurchInput;
  schedule?: UpdateScheduleEntryInput[];
  socials?: UpdateSocialLinkInput[];
  giving?: UpdateGivingInput;
}
