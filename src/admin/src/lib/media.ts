/**
 * Media library helpers (Phase 10C, docs/09 §45–§52, docs/12 §13–§15).
 *
 * Pure, DOM-free rules shared by the library screen, the reusable picker and
 * the unit tests: display formatting, client-side upload validation, filter
 * serialization and permission projection. The server remains the authority on
 * uploads, metadata and authorization (docs/09 §48).
 */
import type { PermissionName } from '@shared/api';
import {
  isAllowedMediaMimeType,
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_DOCUMENT_MIME_TYPES,
  MEDIA_FOLDERS,
  MEDIA_IMAGE_MIME_TYPES,
  MEDIA_SORT_FIELDS,
  type MediaDto,
  type MediaFolder,
  type MediaListQuery,
  type MediaMimeType,
  type MediaSortField,
  type MediaType,
  type MediaVariantDto,
  type UpdateMediaInput,
  type UploadMetadataInput,
} from '@shared/media';
import { ApiError } from './api';
import { describeError } from './errors';

/**
 * Mirrors the server default (`DEFAULT_MAX_UPLOAD_BYTES`). Early validation is
 * only a courtesy; the API rejects anything above its configured limit with
 * `413 FILE_TOO_LARGE`, which the UI surfaces verbatim through `describeMediaError`.
 */
export const MEDIA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_TYPE_OPTIONS: ReadonlyArray<{
  value: MediaType;
  label: string;
}> = [
  { value: 'IMAGE', label: 'Imagen' },
  { value: 'DOCUMENT', label: 'Documento' },
];

export const MEDIA_FOLDER_LABELS: Readonly<Record<MediaFolder, string>> = {
  sermons: 'Sermones',
  events: 'Eventos',
  ministries: 'Ministerios',
  pages: 'Páginas',
  site: 'Sitio',
  documents: 'Documentos',
  uploads: 'Cargas generales',
};

export const MEDIA_FOLDER_OPTIONS: ReadonlyArray<{
  value: MediaFolder;
  label: string;
}> = MEDIA_FOLDERS.map((folder) => ({
  value: folder,
  label: MEDIA_FOLDER_LABELS[folder],
}));

export const MEDIA_MIME_LABELS: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'application/pdf': 'PDF',
};

export const MEDIA_SORT_OPTIONS: ReadonlyArray<{
  value: MediaSortField;
  label: string;
}> = [
  { value: 'createdAt', label: 'Fecha de carga' },
  { value: 'updatedAt', label: 'Última actualización' },
  { value: 'filename', label: 'Nombre de archivo' },
  { value: 'title', label: 'Título' },
  { value: 'size', label: 'Tamaño' },
];

export const MEDIA_ORDER_OPTIONS = [
  { value: 'desc', label: 'Descendente' },
  { value: 'asc', label: 'Ascendente' },
] as const;

/** Filter state owned by the library screen; empty string means "no filter". */
export interface MediaLibraryFilters {
  search: string;
  type: MediaType | '';
  mimeType: MediaMimeType | '';
  folder: MediaFolder | '';
  createdFrom: string;
  createdTo: string;
}

export function emptyMediaFilters(): MediaLibraryFilters {
  return {
    search: '',
    type: '',
    mimeType: '',
    folder: '',
    createdFrom: '',
    createdTo: '',
  };
}

export function mediaFiltersActive(filters: MediaLibraryFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.type !== '' ||
    filters.mimeType !== '' ||
    filters.folder !== '' ||
    filters.createdFrom !== '' ||
    filters.createdTo !== ''
  );
}

/**
 * Serialize the screen filters into the documented list query. Empty strings
 * are dropped so an untouched filter never sends `?type=` (docs/08 §25–26).
 */
export function buildMediaListQuery(
  filters: MediaLibraryFilters,
  page: number,
  limit: number,
  sort: MediaSortField,
  order: 'asc' | 'desc',
): MediaListQuery {
  return {
    page,
    limit,
    sort,
    order,
    search: filters.search.trim() || undefined,
    type: filters.type === '' ? undefined : filters.type,
    mimeType: filters.mimeType === '' ? undefined : filters.mimeType,
    folder: filters.folder === '' ? undefined : filters.folder,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
  };
}

/** MIME options compatible with the selected type (all when no type is set). */
export function mediaMimeOptions(
  type: MediaType | '',
): ReadonlyArray<{ value: MediaMimeType; label: string }> {
  const values =
    type === 'IMAGE'
      ? MEDIA_IMAGE_MIME_TYPES
      : type === 'DOCUMENT'
        ? MEDIA_DOCUMENT_MIME_TYPES
        : MEDIA_ALLOWED_MIME_TYPES;
  return values.map((value) => ({
    value,
    label: MEDIA_MIME_LABELS[value] ?? value,
  }));
}

/** Validate a date range before it reaches the API (docs/09 §48). */
export function dateRangeError(from: string, to: string): string | null {
  if (!from || !to) return null;
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return 'Ingresá fechas válidas para filtrar por fecha de carga.';
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return 'La fecha «Desde» no puede ser posterior a la fecha «Hasta».';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded =
    value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[unitIndex]}`;
}

export function formatDimensions(
  width: number | null,
  height: number | null,
): string {
  if (width === null || height === null) return '—';
  return `${width} × ${height} px`;
}

export function mediaTypeLabel(type: MediaType): string {
  return MEDIA_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function mimeTypeLabel(mimeType: string): string {
  return MEDIA_MIME_LABELS[mimeType] ?? mimeType;
}

export function folderLabel(folder: string | null): string {
  if (!folder) return 'Sin carpeta';
  return MEDIA_FOLDER_LABELS[folder as MediaFolder] ?? folder;
}

export function mediaDisplayName(media: MediaDto): string {
  return media.title?.trim() || media.filename;
}

/** Best available derivative for a thumbnail, falling back to the original. */
export function thumbnailVariant(media: MediaDto): MediaVariantDto | null {
  return (
    media.variants.find((variant) => variant.label === 'thumbnail') ??
    media.variants.find((variant) => variant.label === 'small') ??
    media.variants[0] ??
    null
  );
}

/** URL used in grid/list previews; documents have no image preview. */
export function mediaPreviewUrl(media: MediaDto): string | null {
  const variant = thumbnailVariant(media);
  if (variant) return variant.url;
  return media.type === 'IMAGE' ? media.url : null;
}

const REFERENCE_ENTITY_LABELS: Readonly<Record<string, string>> = {
  SERMON: 'Sermón',
  PAGE: 'Página',
  EVENT: 'Evento',
  MINISTRY: 'Ministerio',
  MEDIA: 'Archivo multimedia',
  SETTINGS: 'Configuración del sitio',
};

export function referenceEntityLabel(entityType: string): string {
  return REFERENCE_ENTITY_LABELS[entityType.toUpperCase()] ?? entityType;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface MediaPermissions {
  read: boolean;
  upload: boolean;
  update: boolean;
  delete: boolean;
}

export function mediaPermissions(
  hasPermission: (permission: PermissionName) => boolean,
): MediaPermissions {
  return {
    read: hasPermission('media.read'),
    upload: hasPermission('media.upload'),
    update: hasPermission('media.update'),
    delete: hasPermission('media.delete'),
  };
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

export interface UploadFileLike {
  name: string;
  type: string;
  size: number;
}

export type UploadValidation =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Early client validation (docs/09 §48). The server re-validates the declared
 * MIME type, magic bytes and size, so a passing result here means "worth
 * sending", never "authorized" or "guaranteed accepted".
 */
export function validateUploadFile(
  file: UploadFileLike,
  maxBytes: number = MEDIA_UPLOAD_MAX_BYTES,
): UploadValidation {
  if (file.name.trim().length === 0) {
    return { ok: false, message: 'El archivo no tiene nombre.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'El archivo está vacío.' };
  }
  if (!isAllowedMediaMimeType(file.type)) {
    return {
      ok: false,
      message:
        'Formato no permitido. Aceptamos JPG, PNG, WebP, GIF y archivos PDF.',
    };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `El archivo supera el máximo de ${formatBytes(maxBytes)}.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Upload cancellation and picker guards
// ---------------------------------------------------------------------------

export type UploadPhase = 'idle' | 'uploading' | 'processing';

/**
 * Cancelling is only honest while the request body is still being sent. Once
 * the server has the whole file it owns the work, and aborting the XHR hides
 * the result without rolling anything back (Phase 10C follow-up, C1). We never
 * implement server-side rollback here.
 */
export function canCancelUpload(phase: UploadPhase): boolean {
  return phase === 'uploading';
}

/**
 * Copy for a cancelled/interrupted upload. It must never claim the file was not
 * stored, because the server may have persisted it before we stopped waiting.
 */
export const UPLOAD_INTERRUPTED_MESSAGE =
  'Cancelamos la espera. La subida puede completarse igual; refrescá la biblioteca para verla.';

/** Shown once the body is fully sent and the server may already own the file. */
export const UPLOAD_PROCESSING_CANCEL_HINT =
  'El archivo ya se envió. No se puede cancelar; esperá a que termine.';

/**
 * The picker renders the library inside a closed `<dialog>`; the browser must
 * not fetch until the dialog is actually open (Phase 10C follow-up, C2).
 */
export function shouldFetchMediaLibrary(active: boolean): boolean {
  return active;
}

/**
 * The picker filters the library by `accept`, but a manually typed id can still
 * point at another media type. The server only checks that the asset exists, so
 * warn in the UI instead of silently storing an incompatible reference (C3).
 */
export function mediaTypeMismatchMessage(
  actual: MediaType,
  expected: MediaType,
): string | null {
  if (actual === expected) return null;
  const article = (type: MediaType) => (type === 'IMAGE' ? 'una' : 'un');
  return `El archivo elegido es ${article(actual)} ${mediaTypeLabel(actual).toLowerCase()}; este campo requiere ${article(expected)} ${mediaTypeLabel(expected).toLowerCase()}.`;
}

// ---------------------------------------------------------------------------
// Metadata forms
// ---------------------------------------------------------------------------

export interface MediaMetadataForm {
  alt: string;
  title: string;
  description: string;
  caption: string;
}

export interface MediaMetadataErrors {
  alt?: string;
  title?: string;
  description?: string;
  caption?: string;
}

export const MEDIA_METADATA_MAX_LENGTHS = {
  alt: 500,
  title: 200,
  description: 5000,
  caption: 500,
} as const;

export function mediaToMetadataForm(media: MediaDto): MediaMetadataForm {
  return {
    alt: media.alt ?? '',
    title: media.title ?? '',
    description: media.description ?? '',
    caption: media.caption ?? '',
  };
}

export function emptyMetadataForm(): MediaMetadataForm {
  return { alt: '', title: '', description: '', caption: '' };
}

/**
 * Validate editorial metadata using the same limits as the API, and convert
 * blank fields to `null` so clearing a field actually removes the value.
 */
export function validateMediaMetadata(form: MediaMetadataForm): {
  errors: MediaMetadataErrors;
  input: UpdateMediaInput | null;
} {
  const errors: MediaMetadataErrors = {};
  const entries = Object.entries(MEDIA_METADATA_MAX_LENGTHS) as Array<
    [keyof MediaMetadataForm, number]
  >;
  for (const [field, max] of entries) {
    if (form[field].trim().length > max) {
      errors[field] = `Máximo ${max} caracteres.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, input: null };
  }

  return {
    errors,
    input: {
      alt: form.alt.trim() || null,
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      caption: form.caption.trim() || null,
    },
  };
}

export interface UploadMetadataForm extends MediaMetadataForm {
  folder: string;
}

export function emptyUploadMetadata(): UploadMetadataForm {
  return { ...emptyMetadataForm(), folder: 'uploads' };
}

/** Drop blank optional fields so the multipart payload stays minimal. */
export function normalizeUploadMetadata(
  form: UploadMetadataForm,
): UploadMetadataInput {
  const metadata: UploadMetadataInput = {};
  if (form.folder !== '') metadata.folder = form.folder;
  const alt = form.alt.trim();
  const title = form.title.trim();
  const description = form.description.trim();
  const caption = form.caption.trim();
  if (alt) metadata.alt = alt;
  if (title) metadata.title = title;
  if (description) metadata.description = description;
  if (caption) metadata.caption = caption;
  return metadata;
}

// ---------------------------------------------------------------------------
// Error descriptions
// ---------------------------------------------------------------------------

export function isMediaReferenced(error: unknown): boolean {
  return (
    error instanceof ApiError && error.code === 'MEDIA_REFERENCED'
  );
}

/**
 * Media-specific error copy. Permission, session and not-found failures fall
 * back to the shared `describeError` so behavior stays consistent across screens.
 */
export function describeMediaError(
  error: unknown,
  maxBytes: number = MEDIA_UPLOAD_MAX_BYTES,
): string {
  if (error instanceof ApiError) {
    if (error.code === 'MEDIA_REFERENCED') {
      return 'El archivo todavía está en uso. Revisá las referencias antes de eliminarlo.';
    }
    if (error.status === 413 || error.code === 'FILE_TOO_LARGE') {
      return `El archivo supera el máximo permitido de ${formatBytes(maxBytes)}.`;
    }
    if (error.status === 422 || error.code === 'UNSUPPORTED_MEDIA_TYPE') {
      return 'El formato del archivo no está permitido. Aceptamos JPG, PNG, WebP, GIF y PDF.';
    }
  }
  return describeError(error);
}

/** Exposed for tests that assert the documented sort allowlist is respected. */
export const MEDIA_SORT_ALLOWLIST = MEDIA_SORT_FIELDS;
