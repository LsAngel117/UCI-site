/**
 * Pure sermon form model (docs/09 §22–§34).
 *
 * The editor keeps every field as a string/boolean so React controlled inputs
 * stay simple; this module owns the two lossless translations the screen needs:
 * DTO → form and form → create/update payload. Validation lives here too, which
 * makes the rules testable without a DOM and keeps the API as the final
 * authority: the client only catches obvious mistakes early.
 */
import type { PermissionName } from '@shared/api';
import type {
  CreateSermonInput,
  SermonAdminDto,
  SermonSeoInput,
  UpdateSermonInput,
} from '@shared/cms';
import type { ContentStatus } from '@shared/types';
import {
  blocksToContent,
  contentToBlocks,
  validateSermonBlocks,
  type SermonBlock,
} from './sermon-blocks';

/** Editable values of a sermon, all as controlled-input strings. */
export interface SermonFormValues {
  title: string;
  slug: string;
  description: string;
  scriptureReference: string;
  scriptureText: string;
  preacherId: string;
  /** Legacy free-text preacher, kept for sermons created before `Person`. */
  preacherName: string;
  seriesId: string;
  topicIds: string[];
  /** `YYYY-MM-DD`, as accepted by `<input type="date">`. */
  sermonDate: string;
  durationMinutes: string;
  featured: boolean;
  coverMediaId: string;
  notesMediaId: string;
  videoProvider: string;
  videoExternalId: string;
  videoUrl: string;
  audioUrl: string;
  notesContent: string;
  /** Rich body blocks, serialized to `Sermon.content` on save. */
  blocks: SermonBlock[];
  seoTitle: string;
  seoDescription: string;
  seoCanonicalUrl: string;
  seoOgImageUrl: string;
}

export type SermonFormField = keyof SermonFormValues;
export type SermonFormErrors = Partial<Record<SermonFormField, string>>;

export function emptySermonForm(): SermonFormValues {
  return {
    title: '',
    slug: '',
    description: '',
    scriptureReference: '',
    scriptureText: '',
    preacherId: '',
    preacherName: '',
    seriesId: '',
    topicIds: [],
    sermonDate: '',
    durationMinutes: '',
    featured: false,
    coverMediaId: '',
    notesMediaId: '',
    videoProvider: '',
    videoExternalId: '',
    videoUrl: '',
    audioUrl: '',
    notesContent: '',
    blocks: [],
    seoTitle: '',
    seoDescription: '',
    seoCanonicalUrl: '',
    seoOgImageUrl: '',
  };
}

/** `YYYY-MM-DD` part of an ISO timestamp, or an empty string. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const match = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return match ? match[0] : '';
}

/** Local `<input type="datetime-local">` value for an ISO instant. */
export function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join('T');
}

/** Convert a `datetime-local` value (local timezone) to a UTC ISO instant. */
export function isoFromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** True when a valid `datetime-local` value is strictly in the future. */
export function isFutureDateTime(value: string, now = new Date()): boolean {
  const iso = isoFromDateTimeLocal(value);
  if (!iso) return false;
  return new Date(iso).getTime() > now.getTime();
}

/**
 * Normalize arbitrary text into the canonical slug format. Mirrors the server's
 * `normalizeSlug` so the editor can show the value that will actually be
 * stored, while the server remains the source of truth.
 */
export function normalizeSlugInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sermonToForm(sermon: SermonAdminDto): SermonFormValues {
  return {
    title: sermon.title,
    slug: sermon.slug,
    description: sermon.description ?? '',
    scriptureReference: sermon.scriptureReference ?? '',
    scriptureText: sermon.scriptureText ?? '',
    preacherId: sermon.preacherId ?? '',
    preacherName: sermon.preacherName ?? '',
    seriesId: sermon.seriesId ?? '',
    topicIds: sermon.topics.map((topic) => topic.id),
    sermonDate: toDateInputValue(sermon.sermonDate),
    durationMinutes:
      sermon.durationMinutes === null ? '' : String(sermon.durationMinutes),
    featured: sermon.featured,
    coverMediaId: sermon.coverMediaId ?? '',
    notesMediaId: sermon.notesMediaId ?? '',
    videoProvider: sermon.videoProvider ?? '',
    videoExternalId: sermon.videoExternalId ?? '',
    videoUrl: sermon.videoUrl ?? '',
    audioUrl: sermon.audioUrl ?? '',
    notesContent: sermon.notesContent ?? '',
    blocks: contentToBlocks(sermon.content),
    seoTitle: sermon.seo?.title ?? '',
    seoDescription: sermon.seo?.description ?? '',
    seoCanonicalUrl: sermon.seo?.canonicalUrl ?? '',
    seoOgImageUrl: sermon.seo?.ogImageUrl ?? '',
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

/** True when the form has no unsaved difference from its baseline. */
export function formsEqual(
  left: SermonFormValues,
  right: SermonFormValues,
): boolean {
  const scalarKeys: Array<Exclude<SermonFormField, 'topicIds'>> = [
    'title',
    'slug',
    'description',
    'scriptureReference',
    'scriptureText',
    'preacherId',
    'preacherName',
    'seriesId',
    'sermonDate',
    'durationMinutes',
    'featured',
    'coverMediaId',
    'notesMediaId',
    'videoProvider',
    'videoExternalId',
    'videoUrl',
    'audioUrl',
    'notesContent',
    'seoTitle',
    'seoDescription',
    'seoCanonicalUrl',
    'seoOgImageUrl',
  ];
  return (
    scalarKeys.every((key) => left[key] === right[key]) &&
    sameStringSet(left.topicIds, right.topicIds) &&
    JSON.stringify(blocksToContent(left.blocks)) ===
      JSON.stringify(blocksToContent(right.blocks))
  );
}

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const [year, month, day] = value.split('-').map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 120;

/** Field-level validation for the editor. Empty means "no client-side error". */
export function validateSermonForm(
  values: SermonFormValues,
): SermonFormErrors {
  const errors: SermonFormErrors = {};

  if (values.title.trim().length === 0) {
    errors.title = 'El título es obligatorio.';
  }

  const slug = values.slug.trim();
  if (slug.length > 0) {
    const normalized = normalizeSlugInput(slug);
    if (
      normalized.length === 0 ||
      normalized.length > SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(normalized)
    ) {
      errors.slug =
        'Usá minúsculas, números y guiones (por ejemplo: obediencia-y-fe).';
    }
  }

  if (values.durationMinutes.trim().length > 0) {
    const duration = Number(values.durationMinutes);
    if (!Number.isInteger(duration) || duration < 0) {
      errors.durationMinutes = 'La duración debe ser un número entero de minutos.';
    }
  }

  if (values.sermonDate.trim().length > 0 && !isValidDateInput(values.sermonDate)) {
    errors.sermonDate = 'Ingresá una fecha válida.';
  }

  const blockErrors = validateSermonBlocks(values.blocks);
  const firstBlockError = Object.values(blockErrors)[0];
  if (firstBlockError) errors.blocks = firstBlockError;

  const urlFields: Array<[SermonFormField, string]> = [
    ['videoUrl', 'Ingresá una URL http(s) válida.'],
    ['audioUrl', 'Ingresá una URL http(s) válida.'],
    ['seoCanonicalUrl', 'La URL canónica debe ser http(s).'],
    ['seoOgImageUrl', 'La imagen Open Graph debe ser una URL http(s).'],
  ];
  for (const [field, message] of urlFields) {
    const value = values[field];
    if (typeof value === 'string' && value.trim().length > 0 && !isHttpUrl(value.trim())) {
      errors[field] = message;
    }
  }

  return errors;
}

function seoInput(values: SermonFormValues): SermonSeoInput {
  // Every key is sent so clearing a field actually clears the stored value;
  // the server treats an omitted key as "keep the existing value" (docs/08 §30).
  return {
    title: trimOrNull(values.seoTitle),
    description: trimOrNull(values.seoDescription),
    canonicalUrl: trimOrNull(values.seoCanonicalUrl),
    ogImageUrl: trimOrNull(values.seoOgImageUrl),
  };
}

function commonFields(values: SermonFormValues) {
  return {
    title: values.title.trim(),
    description: trimOrNull(values.description),
    scriptureReference: trimOrNull(values.scriptureReference),
    scriptureText: trimOrNull(values.scriptureText),
    preacherName: trimOrNull(values.preacherName),
    sermonDate: trimOrNull(values.sermonDate),
    preacherId: trimOrNull(values.preacherId),
    seriesId: trimOrNull(values.seriesId),
    topicIds: [...values.topicIds],
    coverMediaId: trimOrNull(values.coverMediaId),
    notesMediaId: trimOrNull(values.notesMediaId),
    videoProvider: trimOrNull(values.videoProvider),
    videoExternalId: trimOrNull(values.videoExternalId),
    videoUrl: trimOrNull(values.videoUrl),
    audioUrl: trimOrNull(values.audioUrl),
    notesContent: trimOrNull(values.notesContent),
    content: blocksToContent(values.blocks),
    durationMinutes:
      values.durationMinutes.trim().length > 0
        ? Number(values.durationMinutes)
        : null,
    featured: values.featured,
    seo: seoInput(values),
  };
}

export function formToCreateInput(values: SermonFormValues): CreateSermonInput {
  const slug = values.slug.trim();
  return {
    ...commonFields(values),
    // An omitted slug lets the server generate one from the title (docs/05 §27).
    ...(slug.length > 0 ? { slug } : {}),
  };
}

export function formToUpdateInput(
  values: SermonFormValues,
  version: number,
): UpdateSermonInput {
  const slug = values.slug.trim();
  return {
    version,
    ...commonFields(values),
    // An empty slug keeps the stored one; only an explicit value is validated.
    ...(slug.length > 0 ? { slug } : {}),
  };
}

export interface SermonPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  publish: boolean;
  archive: boolean;
}

export type HasPermission = (permission: PermissionName) => boolean;

export function sermonPermissions(hasPermission: HasPermission): SermonPermissions {
  return {
    read: hasPermission('sermons.read'),
    create: hasPermission('sermons.create'),
    update: hasPermission('sermons.update'),
    publish: hasPermission('sermons.publish'),
    archive: hasPermission('sermons.archive'),
  };
}

export type SermonLifecycleAction = 'publish' | 'schedule' | 'archive';

/**
 * Lifecycle actions the current state can accept. This mirrors the server's
 * transition table for UX only — the server still validates every action and
 * answers 409 when the local view was stale (docs/08 §22).
 */
const LIFECYCLE_FROM: Record<SermonLifecycleAction, readonly ContentStatus[]> = {
  publish: ['draft', 'scheduled', 'unpublished', 'archived'],
  schedule: ['draft', 'scheduled', 'unpublished'],
  archive: ['draft', 'scheduled', 'published', 'unpublished'],
};

export function availableLifecycleActions(
  status: ContentStatus,
  permissions: SermonPermissions,
): SermonLifecycleAction[] {
  const actions: SermonLifecycleAction[] = [];
  if (permissions.publish && LIFECYCLE_FROM.publish.includes(status)) {
    actions.push('publish');
  }
  if (permissions.publish && LIFECYCLE_FROM.schedule.includes(status)) {
    actions.push('schedule');
  }
  if (permissions.archive && LIFECYCLE_FROM.archive.includes(status)) {
    actions.push('archive');
  }
  return actions;
}
