/**
 * Shared API contracts (docs/02 §66, docs/07 §22).
 *
 * These are the minimal, framework-agnostic shapes shared across the public
 * website, the admin panel and the Node API. They describe API responses
 * (DTOs), never database models or storage internals.
 */

/** Consistent API error body (docs/02 §38, docs/07 §23). */
export interface ApiErrorBody {
  /** Stable, machine-readable error code (e.g. `NOT_FOUND`). */
  code: string;
  /** Human-readable message, safe to show to clients. */
  message: string;
  /** Optional machine-readable details (field errors, etc.). */
  details?: unknown;
}

/** Envelope wrapping every error response: `{ error: { code, message } }`. */
export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

/** Response of `GET /api/v1/health` (docs/14 §30). */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}
