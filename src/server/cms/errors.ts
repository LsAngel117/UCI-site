/**
 * Typed errors for the reusable CMS core (docs/08 §30).
 *
 * The core is transport-agnostic: services throw `CmsError` carrying the HTTP
 * status and the stable `ApiErrorCode`, and the route layer turns it into the
 * `{ error: { code, message } }` envelope. This keeps the same semantics
 * (missing → 404, stale version → 409, duplicate slug → 409) no matter which
 * content module consumes the core.
 */
import type { ApiErrorCode, ApiErrorEnvelope } from '@shared/api';

export class CmsError extends Error {
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
    this.name = 'CmsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isCmsError(value: unknown): value is CmsError {
  return value instanceof CmsError;
}

/** Resource does not exist (or is out of scope for the caller). */
export function notFound(message = 'The requested resource was not found.'): CmsError {
  return new CmsError('NOT_FOUND', message, 404);
}

/** Business conflict — stale optimistic-concurrency version, invalid transition. */
export function conflict(message: string, details?: unknown): CmsError {
  return new CmsError('CONFLICT', message, 409, details);
}

/** Slug already used inside its collection (docs/05 §27). */
export function slugTaken(slug: string): CmsError {
  return new CmsError('SLUG_TAKEN', `The slug "${slug}" is already in use.`, 409, {
    field: 'slug',
  });
}

/** Malformed or semantically invalid input. */
export function validation(message: string, details?: unknown): CmsError {
  return new CmsError('VALIDATION_ERROR', message, 400, details);
}

/** Render a `CmsError` as the standard error envelope. */
export function cmsErrorEnvelope(error: CmsError): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
