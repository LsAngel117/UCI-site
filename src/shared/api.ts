/**
 * Shared API contracts (docs/02 §66, docs/07 §22, docs/08 §25–30).
 *
 * These are the minimal, framework-agnostic shapes shared across the public
 * website, the admin panel and the Node API. They describe API responses
 * (DTOs), never database models or storage internals. Nothing in `@shared`
 * imports Prisma types (docs/08 §48, §55).
 */

/**
 * Canonical API error codes (docs/08 §30). The `code` is the programmatic
 * contract clients switch on, so the set is closed and declared here to keep
 * the API and the admin UI in agreement. Every server error envelope uses one
 * of these values.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SLUG_TAKEN',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'REQUEST_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Stable, machine-readable error code (e.g. `NOT_FOUND`, `VALIDATION_ERROR`). */
export interface ApiError {
  /**
   * One of `API_ERROR_CODES`. Typed as the union so new code paths cannot
   * invent an undocumented code, while remaining assignable to the historical
   * `string` consumers.
   */
  code: ApiErrorCode | (string & {});
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

// ---------------------------------------------------------------------------
// Authentication & authorization contracts (docs/08 §7, docs/11 §5–11).
//
// These describe the auth API's DTOs. They never carry database models or
// storage internals — no Prisma types cross this boundary (docs/08 §48, §55).
// Password hashes and session tokens are deliberately absent: the token is
// transported only through a secure HttpOnly cookie (docs/11 §5.1).
// ---------------------------------------------------------------------------

/**
 * Canonical permission vocabulary (docs/11 §9).
 *
 * This runtime tuple is the single source of truth for permission identifiers;
 * `PermissionName` is its string-literal union. The client-facing union, the
 * authorization layer and the seed all derive from it, so a permission is
 * declared in exactly one place. Kept as plain strings — adding a permission
 * here is the only change needed for it to flow through the whole stack.
 */
export const PERMISSIONS = [
  'users.read',
  'users.create',
  'users.update',
  'users.disable',
  'roles.read',
  'roles.update',
  'pages.read',
  'pages.create',
  'pages.update',
  'pages.publish',
  'pages.archive',
  'pages.delete',
  'sermons.read',
  'sermons.create',
  'sermons.update',
  'sermons.publish',
  'sermons.archive',
  'sermons.delete',
  'events.read',
  'events.create',
  'events.update',
  'events.publish',
  'events.archive',
  'events.delete',
  'ministries.read',
  'ministries.create',
  'ministries.update',
  'ministries.publish',
  'ministries.archive',
  'media.read',
  'media.upload',
  'media.update',
  'media.delete',
  'navigation.read',
  'navigation.update',
  'seo.read',
  'seo.update',
  'settings.read',
  'settings.update',
  'audit.read',
] as const;

export type PermissionName = (typeof PERMISSIONS)[number];

/**
 * Type guard for validating untrusted values against the permission allowlist
 * (mirrors `isContentStatus` in `types.ts`). Unknown strings are rejected so
 * the authorization layer can never be fooled into trusting arbitrary input.
 */
export function isPermissionName(value: unknown): value is PermissionName {
  return (
    typeof value === 'string' &&
    (PERMISSIONS as readonly string[]).includes(value)
  );
}

/** Request body of `POST /api/v1/auth/login` (docs/08 §7.1). */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Authenticated identity as exposed to clients (docs/08 §7.1–7.2).
 *
 * Never carries credentials, password hashes or session internals
 * (docs/11 §5.3, §13, §20). `role` is the primary role name for UI
 * presentation only — authorization never trusts it (docs/07 §59).
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Success payload of `POST /api/v1/auth/login` (docs/08 §7.1). */
export interface LoginResponse {
  user: AuthUser;
}

/**
 * Response body of `GET /api/v1/auth/me`: the identity plus every permission
 * resolved server-side for the current session (docs/08 §7.2, docs/11 §10).
 */
export interface CurrentUserResponse extends AuthUser {
  permissions: PermissionName[];
}
