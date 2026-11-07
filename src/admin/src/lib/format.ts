/**
 * Display formatting shared by the content screens (docs/09 §16, §21).
 *
 * Dates are shown in the church's local calendar to avoid the classic "the
 * sermon date moved one day" bug: a `YYYY-MM-DD` value is rendered as that
 * calendar day, not reinterpreted in the viewer's timezone. Instants (audit,
 * publication) do use the browser timezone because they are real moments.
 */
import type { ContentStatus } from '@shared/types';

export const STATUS_OPTIONS: ReadonlyArray<{
  value: ContentStatus;
  label: string;
}> = [
  { value: 'draft', label: 'Borrador' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'published', label: 'Publicado' },
  { value: 'unpublished', label: 'Despublicado' },
  { value: 'archived', label: 'Archivado' },
];

export function statusLabel(status: ContentStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

/** Calendar-day label for a date-only field; never shifts the day. */
export function formatCalendarDate(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '—';
  const [, year, month, day] = match;
  // `T12:00:00` avoids a timezone-induced off-by-one in any viewer.
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Date + time label for a real instant (publication, audit). */
export function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
