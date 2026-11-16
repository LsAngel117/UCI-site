/**
 * Human-readable error descriptions for the panel (docs/08 §30).
 *
 * The API is the authority and its message is safe to show, so it is preferred.
 * These helpers only add the context the operator needs for status-specific
 * cases (expired session, missing permission, stale version, offline) without
 * ever pretending an action succeeded.
 */
import { ApiError } from './api';

/** Generic, honest message for any failure. */
export function describeError(
  error: unknown,
  fallback = 'No pudimos completar la solicitud. Intentá de nuevo.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 403) {
      return 'Tu cuenta no tiene permiso para realizar esta acción. La autorización se valida en el servidor.';
    }
    if (error.status === 401) {
      return 'Tu sesión venció. Volvé a iniciar sesión para continuar.';
    }
    if (error.status === 404) {
      return 'El contenido solicitado no existe o fue eliminado.';
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** True when a failed request was a stale-version or duplicate-slug conflict. */
export function isConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.isConflict;
}

/** True when a failed request means the session is no longer valid. */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.isUnauthorized;
}
