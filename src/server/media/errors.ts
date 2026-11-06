/**
 * Typed errors for the media subsystem (docs/08 §30).
 *
 * Like the CMS core, the media layer is transport-agnostic: storage and service
 * code throw `MediaError` carrying the HTTP status and stable `ApiErrorCode`,
 * and the route layer renders the `{ error: { code, message } }` envelope.
 */
import type { ApiErrorCode, ApiErrorEnvelope } from '@shared/api';

export class MediaError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isMediaError(value: unknown): value is MediaError {
  return value instanceof MediaError;
}

/** Asset (or reference target) does not exist. */
export function notFound(message = 'Media asset not found.'): MediaError {
  return new MediaError('NOT_FOUND', message, 404);
}

/** Declared MIME type is not allowed, or the bytes do not match it. */
export function unsupportedMediaType(
  message = 'This file type is not allowed.',
  details?: unknown,
): MediaError {
  return new MediaError('UNSUPPORTED_MEDIA_TYPE', message, 422, details);
}

/** Upload exceeds the configured byte limit. */
export function fileTooLarge(maxBytes: number): MediaError {
  return new MediaError(
    'FILE_TOO_LARGE',
    `The uploaded file exceeds the maximum size of ${maxBytes} bytes.`,
    413,
    { maxBytes },
  );
}

/** Destructive deletion was blocked by active content references. */
export function mediaReferenced(referenceCount: number): MediaError {
  return new MediaError(
    'MEDIA_REFERENCED',
    'This media asset is still referenced by content. Remove those references or retry with force=true.',
    409,
    { referenceCount },
  );
}

/** Malformed or semantically invalid input. */
export function validation(
  message: string,
  details?: unknown,
): MediaError {
  return new MediaError('VALIDATION_ERROR', message, 400, details);
}

/** Render a `MediaError` as the standard error envelope. */
export function mediaErrorEnvelope(error: MediaError): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}