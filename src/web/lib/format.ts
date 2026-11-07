/**
 * Church-local date/time formatting for the public website (Phase 9B1).
 *
 * Sermon dates are calendar dates stored as ISO instants; they must keep their
 * intended day regardless of the viewer's timezone, so they are formatted in
 * UTC. Event start/end values are real instants and are displayed in the
 * church's local timezone (America/Bogota, docs/05 §43).
 */
const CHURCH_TIME_ZONE = 'America/Bogota';

const sermonDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const eventDateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: CHURCH_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const eventDayFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: CHURCH_TIME_ZONE,
  day: '2-digit',
});

const eventMonthFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: CHURCH_TIME_ZONE,
  month: 'short',
});

const eventTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: CHURCH_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parse(value: string | null | undefined): Date | null {
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
): string | null {
  const date = parse(value);
  return date ? eventDateTimeFormatter.format(date) : null;
}

export function formatEventDay(value: string | null | undefined): string | null {
  const date = parse(value);
  return date ? eventDayFormatter.format(date) : null;
}

export function formatEventMonth(
  value: string | null | undefined,
): string | null {
  const date = parse(value);
  return date ? eventMonthFormatter.format(date).replace('.', '').toUpperCase() : null;
}

export function formatEventTime(
  value: string | null | undefined,
): string | null {
  const date = parse(value);
  return date ? eventTimeFormatter.format(date) : null;
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
