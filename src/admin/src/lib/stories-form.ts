/**
 * Pure story form model (improvement B2, docs/09 §22–§38).
 *
 * Keeps the editor DTO ↔ form translation and validation out of React so the
 * rules are testable without a DOM. The API remains the final authority.
 */
import type { PermissionName } from '@shared/api';
import type {
  CreateStoryInput,
  StoryAdminDto,
  StorySeoInput,
  UpdateStoryInput,
} from '@shared/cms';
import type { ContentStatus } from '@shared/types';

export interface StoryFormValues {
  title: string;
  slug: string;
  displayName: string;
  quote: string;
  fullStory: string;
  coverMediaId: string;
  /** `YYYY-MM-DD`, as accepted by `<input type="date">`. */
  date: string;
  editorialApproved: boolean;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  seoCanonicalUrl: string;
  seoOgImageUrl: string;
}

export type StoryFormField = keyof StoryFormValues;
export type StoryFormErrors = Partial<Record<StoryFormField, string>>;

export function emptyStoryForm(): StoryFormValues {
  return {
    title: '',
    slug: '',
    displayName: '',
    quote: '',
    fullStory: '',
    coverMediaId: '',
    date: '',
    editorialApproved: false,
    featured: false,
    seoTitle: '',
    seoDescription: '',
    seoCanonicalUrl: '',
    seoOgImageUrl: '',
  };
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const match = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return match ? match[0] : '';
}

export function storyToForm(story: StoryAdminDto): StoryFormValues {
  return {
    title: story.title,
    slug: story.slug,
    displayName: story.displayName,
    quote: story.quote,
    fullStory: story.fullStory,
    coverMediaId: story.coverMediaId ?? '',
    date: toDateInputValue(story.date),
    editorialApproved: story.editorialApproved,
    featured: story.featured,
    seoTitle: story.seo?.title ?? '',
    seoDescription: story.seo?.description ?? '',
    seoCanonicalUrl: story.seo?.canonicalUrl ?? '',
    seoOgImageUrl: story.seo?.ogImageUrl ?? '',
  };
}

export function storyFormsEqual(
  left: StoryFormValues,
  right: StoryFormValues,
): boolean {
  const keys: StoryFormField[] = [
    'title',
    'slug',
    'displayName',
    'quote',
    'fullStory',
    'coverMediaId',
    'date',
    'editorialApproved',
    'featured',
    'seoTitle',
    'seoDescription',
    'seoCanonicalUrl',
    'seoOgImageUrl',
  ];
  return keys.every((key) => left[key] === right[key]);
}

export function normalizeStorySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

export function validateStoryForm(values: StoryFormValues): StoryFormErrors {
  const errors: StoryFormErrors = {};

  if (values.title.trim().length === 0) {
    errors.title = 'El título es obligatorio.';
  }

  const slug = values.slug.trim();
  if (slug.length > 0) {
    const normalized = normalizeStorySlug(slug);
    if (
      normalized.length === 0 ||
      normalized.length > SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(normalized)
    ) {
      errors.slug =
        'Usá minúsculas, números y guiones (por ejemplo: una-vida-restaurada).';
    }
  }

  if (values.date.trim().length > 0 && !isValidDateInput(values.date)) {
    errors.date = 'Ingresá una fecha válida.';
  }

  const urlFields: Array<[StoryFormField, string]> = [
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

function seoInput(values: StoryFormValues): StorySeoInput {
  return {
    title: trimOrNull(values.seoTitle),
    description: trimOrNull(values.seoDescription),
    canonicalUrl: trimOrNull(values.seoCanonicalUrl),
    ogImageUrl: trimOrNull(values.seoOgImageUrl),
  };
}

function commonFields(values: StoryFormValues) {
  const displayName = values.displayName.trim();
  return {
    title: values.title.trim(),
    // An empty displayName lets the server fall back to the title instead of
    // rejecting the payload (the field is non-empty when provided).
    ...(displayName.length > 0 ? { displayName } : {}),
    quote: values.quote.trim(),
    fullStory: values.fullStory.trim(),
    coverMediaId: trimOrNull(values.coverMediaId),
    date: trimOrNull(values.date),
    editorialApproved: values.editorialApproved,
    featured: values.featured,
    seo: seoInput(values),
  };
}

export function formToCreateStoryInput(
  values: StoryFormValues,
): CreateStoryInput {
  const slug = values.slug.trim();
  return {
    ...commonFields(values),
    ...(slug.length > 0 ? { slug } : {}),
  };
}

export function formToUpdateStoryInput(
  values: StoryFormValues,
  version: number,
): UpdateStoryInput {
  const slug = values.slug.trim();
  return {
    version,
    ...commonFields(values),
    ...(slug.length > 0 ? { slug } : {}),
  };
}

export interface StoryPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  publish: boolean;
  archive: boolean;
}

export type HasPermission = (permission: PermissionName) => boolean;

/** Stories reuse the `pages.*` vocabulary, matching the server routes. */
export function storyPermissions(hasPermission: HasPermission): StoryPermissions {
  return {
    read: hasPermission('pages.read'),
    create: hasPermission('pages.create'),
    update: hasPermission('pages.update'),
    publish: hasPermission('pages.publish'),
    archive: hasPermission('pages.archive'),
  };
}

export type StoryLifecycleAction = 'publish' | 'schedule' | 'archive';

const LIFECYCLE_FROM: Record<StoryLifecycleAction, readonly ContentStatus[]> = {
  publish: ['draft', 'scheduled', 'unpublished', 'archived'],
  schedule: ['draft', 'scheduled', 'unpublished'],
  archive: ['draft', 'scheduled', 'published', 'unpublished'],
};

export function availableStoryLifecycleActions(
  status: ContentStatus,
  permissions: StoryPermissions,
): StoryLifecycleAction[] {
  const actions: StoryLifecycleAction[] = [];
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
