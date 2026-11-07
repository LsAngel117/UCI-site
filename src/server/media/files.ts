/**
 * Upload boundary helpers: MIME allowlist, file-signature sniffing, folder
 * normalization and storage-key generation (docs/12 §21–23, docs/11 §23).
 *
 * The original filename is deliberately absent from every key-generating
 * function. Keys are content-addressed by a generated UUID under a validated
 * folder and upload month, so replacing/renaming a file never changes storage
 * identity and a malicious filename can never influence the path.
 */
import { randomUUID } from 'node:crypto';
import {
  isMediaFolder,
  MEDIA_ALLOWED_MIME_TYPES,
  type MediaFolder,
  type MediaMimeType,
  type MediaType,
} from '@shared/media';
import { validation, unsupportedMediaType } from './errors';
import { assertSafeStorageKey } from './storage';

export interface AllowedUpload {
  mimeType: MediaMimeType;
  extension: string;
  type: MediaType;
}

/**
 * Extension/category metadata for each shared MIME entry. Keyed by the shared
 * union, so adding a MIME type in `@shared/media` forces this map to be
 * updated (no second, drift-prone allowlist).
 */
const UPLOAD_METADATA: Record<
  MediaMimeType,
  { extension: string; type: MediaType }
> = {
  'image/jpeg': { extension: 'jpg', type: 'IMAGE' },
  'image/png': { extension: 'png', type: 'IMAGE' },
  'image/webp': { extension: 'webp', type: 'IMAGE' },
  'image/gif': { extension: 'gif', type: 'IMAGE' },
  'application/pdf': { extension: 'pdf', type: 'DOCUMENT' },
};

/** Allowlist derived from `@shared/media` (single source of truth). */
export const ALLOWED_UPLOADS: readonly AllowedUpload[] =
  MEDIA_ALLOWED_MIME_TYPES.map((mimeType) => ({
    mimeType,
    ...UPLOAD_METADATA[mimeType],
  }));

/** Normalize a declared MIME type (drop parameters, lowercase). */
export function normalizeMimeType(raw: string): string {
  return raw.toLowerCase().split(';')[0]!.trim();
}

/** Resolve an allowed upload descriptor or throw 422. */
export function resolveUploadType(declaredMimeType: string): AllowedUpload {
  const mimeType = normalizeMimeType(declaredMimeType);
  const allowed = ALLOWED_UPLOADS.find((entry) => entry.mimeType === mimeType);
  if (!allowed) {
    throw unsupportedMediaType(
      `Unsupported media type "${mimeType}". Allowed types: ${ALLOWED_UPLOADS.map(
        (entry) => entry.mimeType,
      ).join(', ')}.`,
      { mimeType },
    );
  }
  return allowed;
}

/**
 * Detect a file's real type from its magic bytes. This is a cheap signature
 * check; `sharp` performs the deeper decodability check for images
 * (docs/12 §21 "The extension alone must never determine safety").
 */
export function sniffMimeType(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    data.length >= 6 &&
    (data.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      data.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

/** Reject uploads whose bytes do not match their declared MIME type. */
export function assertContentMatches(
  declaredMimeType: string,
  data: Buffer,
): void {
  const detected = sniffMimeType(data);
  if (detected !== normalizeMimeType(declaredMimeType)) {
    throw unsupportedMediaType(
      'The uploaded file content does not match its declared MIME type.',
      { declared: normalizeMimeType(declaredMimeType), detected },
    );
  }
}

/**
 * Validate and normalize the requested folder. Uploads only accept a folder
 * from the documented allowlist; anything else is a 400.
 */
export function normalizeFolder(
  value: unknown,
  fallback: MediaFolder,
): MediaFolder {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') {
    throw validation('"folder" must be a string.', { field: 'folder' });
  }
  const normalized = value.trim().toLowerCase();
  if (!isMediaFolder(normalized)) {
    throw validation(`Invalid folder "${value}".`, { field: 'folder' });
  }
  return normalized;
}

/**
 * Generate the canonical storage key:
 * `{folder}/{YYYY}/{MM}/{uuid}.{ext}` (docs/12 §22).
 */
export function buildStorageKey(
  folder: MediaFolder,
  extension: string,
  at: Date = new Date(),
  id: string = randomUUID(),
): string {
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const key = `${folder}/${year}/${month}/${id}.${extension}`;
  return assertSafeStorageKey(key);
}