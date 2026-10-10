/**
 * Shared API contracts (docs/02 §66, docs/07 §22, docs/08 §25–30).
 *
 * These are the minimal, framework-agnostic shapes shared across the public
 * website, the admin panel and the Node API. They describe API responses
 * (DTOs), never database models or storage internals. Nothing in `@shared`
 * imports Prisma types (docs/08 §48, §55).
 */

/** Stable, machine-readable error code (e.g. `NOT_FOUND`, `VALIDATION_ERROR`). */
export interface ApiError {
  code: string;
  /** Human-readable message, safe to show to clients. */
  message: string;
  /** Optional machine-readable details (field errors, etc.). */
  details?: unknown;
}

/** Back-compat alias — prefer `ApiError` in new code. */
export type ApiErrorBody = ApiError;

/** Envelope wrapping every error response: `{ error: { code, message } }`. */
export interface ApiErrorEnvelope {
  error: ApiError;
}

/** Pagination metadata returned with every collection (docs/08 §25). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Client pagination query parameters. Optional — server applies defaults. */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Client sort query parameters (docs/08 §26). See `query.ts` for safe parsing. */
export interface SortParams {
  /** Only fields from the endpoint's allowlist are accepted. */
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Single-resource success envelope: `{ data: ... }` (docs/08 §29). */
export interface ApiResponse<T> {
  data: T;
}

/** Collection success envelope: `{ data: [...], meta: {...} }` (docs/08 §25, §29). */
export interface ListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Response of `GET /api/v1/health` (docs/14 §30).
 *
 * Single endpoint carrying both liveness and readiness: `status` reports the
 * process (`ok`), and `database` reports the PostgreSQL readiness probe. A
 * database outage degrades `status` to `degraded` rather than failing the
 * liveness check (docs/07 §36).
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  /** `ok` when `SELECT 1` succeeds; `unavailable` otherwise. */
  database?: 'ok' | 'unavailable';
}
