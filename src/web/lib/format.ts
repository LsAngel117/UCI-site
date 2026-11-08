/**
 * Church-local date/time formatting for the public website (Phase 9B1, B1).
 *
 * Sermon dates are calendar dates stored as ISO instants; they must keep their
 * intended day regardless of the viewer's timezone, so they are formatted in
 * UTC. Event start/end values are real instants and are displayed in the
 * church's local IANA timezone, which comes from `settings/public.timezone`
 * (docs/05 §43). When that setting is missing or invalid the documented default
 * (`America/Bogota`) is used, so the site never renders an invented timezone.
 */
export const DEFAULT_CHURCH_TIME_ZONE = 'America/Bogota';

const sermonDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const eventDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const eventDayFormatters = new Map<string, Intl.DateTimeFormat>();
const eventMonthFormatters = new Map<string, Intl.DateTimeFormat>();
const eventTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const weekdayDateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Resolve a configured IANA timezone, falling back to the church default when
 * the value is missing or not accepted by the runtime.
 */
export function resolveChurchTimeZone(value?: string | null): string {
  if (typeof value !== 'string') return DEFAULT_CHURCH_TIME_ZONE;
  const timeZone = value.trim();
  if (timeZone.length === 0) return DEFAULT_CHURCH_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_CHURCH_TIME_ZONE;
  }
}

function eventDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = resolveChurchTimeZone(timeZone);
  const cached = eventDateTimeFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  eventDateTimeFormatters.set(zone, formatter);
  return formatter;
}

function eventDayFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = resolveChurchTimeZone(timeZone);
  const cached = eventDayFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: zone,
    day: '2-digit',
  });
  eventDayFormatters.set(zone, formatter);
  return formatter;
}

function eventMonthFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = resolveChurchTimeZone(timeZone);
  const cached = eventMonthFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: zone,
    month: 'short',
  });
  eventMonthFormatters.set(zone, formatter);
  return formatter;
}

function eventTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = resolveChurchTimeZone(timeZone);
  const cached = eventTimeFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  eventTimeFormatters.set(zone, formatter);
  return formatter;
}

function weekdayDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = resolveChurchTimeZone(timeZone);
  const cached = weekdayDateFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  weekdayDateFormatters.set(zone, formatter);
  return formatter;
}

function parse(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Long sermon date (`12 de abril de 2026`), or `null` when absent/invalid. */
export function formatSermonDate(value: string | null | undefined): string | null {
  const date = parse(value);
  return date ? sermonDateFormatter.format(date) : null;
}

/** Long event instant in church-local time, or `null` when absent/invalid. */
export function formatEventDateTime(
  value: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const date = parse(value);
  return date ? eventDateTimeFormatter(resolveChurchTimeZone(timeZone)).format(date) : null;
}

export function formatEventDay(
  value: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const date = parse(value);
  return date ? eventDayFormatter(resolveChurchTimeZone(timeZone)).format(date) : null;
}

export function formatEventMonth(
  value: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const date = parse(value);
  if (!date) return null;
  return eventMonthFormatter(resolveChurchTimeZone(timeZone))
    .format(date)
    .replace('.', '')
    .toUpperCase();
}

export function formatEventTime(
  value: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const date = parse(value);
  return date ? eventTimeFormatter(resolveChurchTimeZone(timeZone)).format(date) : null;
}

/**
 * Weekday + day label for a service occurrence (`domingo 9`), rendered in the
 * church timezone so the strip never disagrees with the schedule.
 */
export function formatWeekdayDate(
  value: string | Date | null | undefined,
  timeZone?: string | null,
): string | null {
  const date = parse(value);
  if (!date) return null;
  const label = weekdayDateFormatter(resolveChurchTimeZone(timeZone)).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** True when the event already ended (or started, for a point-in-time event). */
export function isPastEvent(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = parse(endAt) ?? parse(startAt);
  return end !== null && end.getTime() < now.getTime();
}
