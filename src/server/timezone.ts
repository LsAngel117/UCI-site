/**
 * Church timezone helpers (improvement A1, docs/05 §43).
 *
 * The church operates on a single local calendar (America/Bogota by default),
 * but the API stores every instant in UTC. Formatting and parsing editorial
 * dates therefore needs one canonical timezone, configured via `APP_TIMEZONE`
 * and never hardcoded inside a feature module.
 *
 * `Intl.DateTimeFormat` is the runtime source of truth for IANA validation: an
 * unknown zone throws a `RangeError`, so a typo fails fast at startup instead
 * of silently falling back to the server's local zone.
 */

/** Default church-local timezone (docs/05 §43). */
export const DEFAULT_TIMEZONE = 'America/Bogota';

/** True when `value` is an IANA timezone supported by the runtime. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    // Constructing the formatter validates the identifier.
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Normalize and validate a configured timezone, failing fast when invalid. */
export function requireValidTimeZone(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_TIMEZONE;
  if (!isValidTimeZone(value)) {
    throw new Error(
      `Invalid APP_TIMEZONE value "${value}". Expected a valid IANA timezone (e.g. "America/Bogota").`,
    );
  }
  return value;
}

/** Wall-clock components of a date-time in a specific IANA timezone. */
export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/** Split an instant into wall-clock parts for `timeZone`. */
export function zonedPartsAt(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((entry) => entry.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    millisecond: date.getUTCMilliseconds(),
  };
}

/**
 * Offset between the timezone's wall clock and UTC at `instant`, in
 * milliseconds. `wallClockAsUtc - instant` (e.g. Bogota is -5h).
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedPartsAt(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Compare at whole-second precision; `instant` carries no sub-second in the
  // callers that use this helper.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert wall-clock components in `timeZone` to the corresponding UTC instant.
 *
 * The offset can change across a DST boundary, so the conversion is solved
 * twice: first with the offset at the naive instant, then with the offset at
 * the resulting instant. This mirrors the standard two-pass approach used by
 * most date libraries and is exact outside the ambiguous DST hour.
 */
export function zonedPartsToUtc(
  parts: ZonedDateTimeParts,
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const firstOffset = timeZoneOffsetMs(new Date(naive), timeZone);
  let candidate = new Date(naive - firstOffset);
  const secondOffset = timeZoneOffsetMs(candidate, timeZone);
  if (secondOffset !== firstOffset) {
    candidate = new Date(naive - secondOffset);
  }
  return candidate;
}

/**
 * Local wall-clock date-time without an explicit offset. Examples accepted:
 * `2026-11-10T19:00`, `2026-11-10 19:00:30`, `2026-11-10T19:00:00.000` and
 * `2026-11-10` (midnight). Strings that already carry `Z`/`±hh:mm` are NOT
 * handled here on purpose: those are absolute instants and the caller should
 * use `new Date(value)` directly.
 */
const NAIVE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

export function parseZonedDateTime(
  raw: string,
  timeZone: string,
): Date | null {
  const match = NAIVE_DATE_TIME.exec(raw.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const millisecond =
    match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0'));

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  return zonedPartsToUtc(
    { year, month, day, hour, minute, second, millisecond },
    timeZone,
  );
}

/** True when a string already carries an explicit UTC/offset marker. */
export function hasExplicitOffset(raw: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim());
}
