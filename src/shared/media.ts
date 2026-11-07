/**
 * Media contracts (Phase 4, docs/08 §15–16, docs/12).
 *
 * These are the admin-facing DTOs and boundary validators for the media
 * subsystem. They contain no Prisma types and no filesystem/storage details:
 * `storageKey` is the stable storage reference, `url` is derived by the
 * storage adapter, and binaries never cross this boundary.
 *
 * External video (docs/08 §16) is deliberately a *value contract*, not a
 * database model. A YouTube reference is metadata owned by a content record
 * (a sermon, event, ...) and never a local upload. Giving it its own table
 * would imply local binary ownership and duplicate the content relation; the
 * local copy of title/thumbnail metadata can live on the consuming entity when
 * that module lands. `parseExternalVideo` is the single validation point.
 */
import type {
  ApiResponse,
  ListResponse,
  PaginationParams,
  SortParams,
} from './api';

// ---------------------------------------------------------------------------
// Media types, MIME allowlist and folders
// ---------------------------------------------------------------------------

/**
 * Stored media categories. External video is intentionally absent: it has no
 * binary asset row (see `ExternalVideo` below).
 */
export const MEDIA_TYPES = ['IMAGE', 'DOCUMENT'] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

/** Type guard for untrusted boundary values. */
export function isMediaType(value: unknown): value is MediaType {
  return (
    typeof value === 'string' &&
    (MEDIA_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Upload allowlist (docs/12 §24–25). SVG is deliberately excluded: it can
 * carry active content and requires sanitization before public exposure.
 */
export const MEDIA_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MEDIA_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

export const MEDIA_ALLOWED_MIME_TYPES = [
  ...MEDIA_IMAGE_MIME_TYPES,
  ...MEDIA_DOCUMENT_MIME_TYPES,
] as const;

export type MediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export function isAllowedMediaMimeType(
  value: unknown,
): value is MediaMimeType {
  return (
    typeof value === 'string' &&
    (MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Logical folders that map to the documented storage layout
 * (docs/12 §7). `uploads` is the generic bucket for assets not yet attached to
 * a content module. The folder is always validated against this allowlist
 * before it can reach a storage key.
 */
export const MEDIA_FOLDERS = [
  'sermons',
  'events',
  'ministries',
  'pages',
  'site',
  'documents',
  'uploads',
] as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export function isMediaFolder(value: unknown): value is MediaFolder {
  return (
    typeof value === 'string' &&
    (MEDIA_FOLDERS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Media DTOs (docs/08 §15.2)
// ---------------------------------------------------------------------------

/** Generated image derivative (docs/12 §28). */
export interface MediaVariantDto {
  id: string;
  /** Stable derivative label: `thumbnail`, `small`, `medium`. */
  label: string;
  /** Encoding format; currently always `webp`. */
  format: string;
  width: number | null;
  height: number | null;
  size: number | null;
  /** Stable storage reference (never a user filename). */
  storageKey: string;
  /** Public URL derived from the storage provider at read time. */
  url: string;
}

/** Full admin representation of a media asset. */
export interface MediaDto {
  id: string;
  type: MediaType;
  /** Original filename, preserved as metadata only (docs/12 §22). */
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Stable storage reference; binaries live outside PostgreSQL. */
  storageKey: string;
  /** Public URL derived by the storage adapter. */
  url: string;
  provider: string;
  folder: string | null;
  title: string | null;
  description: string | null;
  caption: string | null;
  /** Alt text. Exposed as `alt` to match the API contract (docs/08 §15.2). */
  alt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  variants: MediaVariantDto[];
}

/** Optional editorial metadata supplied alongside a multipart upload. */
export interface UploadMetadataInput {
  folder?: MediaFolder | string;
  alt?: string;
  title?: string;
  description?: string;
  caption?: string;
}

/** PATCH body for editorial metadata only (docs/08 §15.4). */
export interface UpdateMediaInput {
  alt?: string | null;
  title?: string | null;
  description?: string | null;
  caption?: string | null;
}

/** Filters accepted by the admin media library (docs/08 §15.1). */
export interface MediaListFilters {
  /** Case-insensitive match on filename/title/caption/description. */
  search?: string;
  type?: MediaType;
  mimeType?: string;
  folder?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface MediaListQuery
  extends PaginationParams,
    SortParams,
    MediaListFilters {}

/** Sort allowlist for the media library (docs/12 §54). */
export const MEDIA_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'filename',
  'size',
  'title',
] as const;

export type MediaSortField = (typeof MEDIA_SORT_FIELDS)[number];

/** `POST /api/v1/admin/media/upload` success envelope. */
export type UploadResponse = ApiResponse<MediaDto>;

/** `GET /api/v1/admin/media` success envelope. */
export type MediaListResponse = ListResponse<MediaDto>;

/** A content record currently referencing a media asset (docs/08 §15.6). */
export interface MediaReferenceDto {
  id: string;
  entityType: string;
  entityId: string;
  purpose: string | null;
  createdAt: string;
}

/** `GET /api/v1/admin/media/:id/references` payload. */
export interface MediaReferencesResponse {
  mediaId: string;
  references: MediaReferenceDto[];
}

/** `DELETE /api/v1/admin/media/:id` payload. */
export interface MediaDeleteResponse {
  id: string;
  deleted: true;
}

// ---------------------------------------------------------------------------
// External video (docs/08 §16, docs/12 §38–40)
// ---------------------------------------------------------------------------

export const EXTERNAL_VIDEO_PROVIDERS = ['YOUTUBE'] as const;

export type ExternalVideoProvider =
  (typeof EXTERNAL_VIDEO_PROVIDERS)[number];

export interface ExternalVideo {
  provider: ExternalVideoProvider;
  /** Provider video id (`externalId` in the roadmap). */
  externalId: string;
  /** Canonical watch URL for the provider. */
  url: string;
  /** Locally stored thumbnail URL for resilience (never a local binary). */
  thumbnailUrl: string | null;
  /** Optional locally stored title (docs/12 §40). */
  title: string | null;
}

export interface ExternalVideoInput {
  provider?: string;
  url?: string;
  externalId?: string;
  title?: string | null;
  thumbnailUrl?: string | null;
}

export type ExternalVideoParseResult =
  | { ok: true; video: ExternalVideo }
  | { ok: false; message: string };

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Canonical YouTube thumbnail for a video id. */
export function youtubeThumbnailUrl(externalId: string): string {
  return `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`;
}

/** Extract the 11-character id from a YouTube URL, or null. */
export function youtubeIdFromUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null;
  }

  const fromQuery = parsed.searchParams.get('v');
  if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) return fromQuery;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const marker = segments[0];
  if (marker === 'embed' || marker === 'shorts' || marker === 'live') {
    const id = segments[1];
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  return null;
}

/**
 * Validate and normalize an external-video reference. No network call is made:
 * the id, canonical URL and thumbnail are derived from the input alone so a
 * content module can render without the YouTube API (docs/12 §40).
 */
export function parseExternalVideo(
  input: unknown,
): ExternalVideoParseResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, message: 'External video must be an object.' };
  }
  const candidate = input as ExternalVideoInput;
  const provider = (candidate.provider ?? 'YOUTUBE').toUpperCase();
  if (provider !== 'YOUTUBE') {
    return {
      ok: false,
      message: `Unsupported external video provider "${provider}". Only YOUTUBE is supported.`,
    };
  }

  let externalId: string | null = null;
  if (candidate.externalId !== undefined) {
    if (
      typeof candidate.externalId !== 'string' ||
      !YOUTUBE_ID_PATTERN.test(candidate.externalId)
    ) {
      return { ok: false, message: 'Invalid YouTube video id.' };
    }
    externalId = candidate.externalId;
  }

  if (externalId === null) {
    if (typeof candidate.url !== 'string') {
      return {
        ok: false,
        message: 'An external video requires a YouTube URL or video id.',
      };
    }
    externalId = youtubeIdFromUrl(candidate.url);
    if (externalId === null) {
      return { ok: false, message: 'The URL is not a valid YouTube video URL.' };
    }
  }

  let title: string | null = null;
  if (candidate.title !== undefined && candidate.title !== null) {
    if (typeof candidate.title !== 'string') {
      return { ok: false, message: '"title" must be a string or null.' };
    }
    title = candidate.title.trim().slice(0, 300) || null;
  }

  let thumbnailUrl: string | null = youtubeThumbnailUrl(externalId);
  if (candidate.thumbnailUrl !== undefined && candidate.thumbnailUrl !== null) {
    if (
      typeof candidate.thumbnailUrl !== 'string' ||
      !/^https?:\/\//i.test(candidate.thumbnailUrl)
    ) {
      return {
        ok: false,
        message: '"thumbnailUrl" must be an http(s) URL or null.',
      };
    }
    thumbnailUrl = candidate.thumbnailUrl;
  }

  return {
    ok: true,
    video: {
      provider: 'YOUTUBE',
      externalId,
      url: `https://www.youtube.com/watch?v=${externalId}`,
      thumbnailUrl,
      title,
    },
  };
}