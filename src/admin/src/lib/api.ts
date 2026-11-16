/**
 * Admin API client (docs/08 §7, docs/09 §5, §7).
 *
 * Same-origin fetch against the versioned API. The session token lives only in
 * the HttpOnly `uci_session` cookie, so every request sends
 * `credentials: 'include'` and nothing is ever read from or written to
 * localStorage (docs/09 §5). Responses follow the API envelopes:
 *
 *   success: { data: ... }
 *   list:    { data: [...], meta: {...} }
 *   error:   { error: { code, message } }
 *
 * `apiRequest` unwraps a single-resource envelope; `apiRequestList` keeps the
 * pagination metadata so list screens can render the documented contract
 * (docs/08 §25). Both are thin wrappers around one transport function so error
 * handling and credentials can never drift between call sites.
 */
import type {
  ApiErrorEnvelope,
  ApiResponse,
  CurrentUserResponse,
  ListResponse,
  LoginRequest,
  LoginResponse,
  PaginationMeta,
  PasswordResetResponse,
} from '@shared/api';

/** Same-origin prefix. Vite proxies `/api` to the API in dev (vite.config). */
const API_PREFIX = '/api/v1';

/** A failed API call with enough context for the UI to react precisely. */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** Stable machine-readable code from the error envelope (docs/08 §30). */
  readonly code: string;
  /**
   * Optional machine-readable details from the error envelope (docs/08 §30).
   * Administration safeguards put their stable reason here (for example
   * `{ reason: 'LAST_ACTIVE_ADMIN' }`) so the UI can explain the rejection
   * without parsing human text.
   */
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The session expired or was never established (docs/09 §7). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** The record changed since the client loaded it (optimistic concurrency). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Lets a screen cancel an in-flight request when its filters change. */
  signal?: AbortSignal;
}

/** True for a fetch/DOM abort, which callers handle as "no result", not "error". */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Perform one request and return the parsed envelope. Every non-2xx response is
 * translated into an `ApiError` carrying the server's stable code and message.
 */
async function send(
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
  };

  if (options.signal) init.signal = options.signal;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch (error) {
    // A cancelled request is not a failure — let the caller ignore it.
    if (isAbortError(error)) throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
    );
  }

  if (response.status === 204) {
    return undefined;
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_ERROR',
      envelope?.error?.message ?? 'La solicitud no se pudo completar.',
      envelope?.error?.details,
    );
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload)
  ) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'El servidor devolvió una respuesta inesperada.',
    );
  }

  return payload;
}

/** Perform a request whose envelope carries one `data` value. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const payload = await send(path, options);
  if (payload === undefined) return undefined as T;
  return (payload as ApiResponse<T>).data;
}

/**
 * Perform a request whose envelope carries `data` plus pagination `meta`.
 * The meta is validated so a malformed collection response fails loudly instead
 * of rendering an empty table that looks like real "no results" (docs/08 §25).
 */
export async function apiRequestList<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ListResponse<T>> {
  const raw = await send(path, options);
  const payload = (raw ?? {}) as { data?: unknown; meta?: unknown };

  if (!Array.isArray(payload.data) || !isPaginationMeta(payload.meta)) {
    throw new ApiError(
      200,
      'INVALID_RESPONSE',
      'El servidor devolvió una lista inesperada.',
    );
  }

  return { data: payload.data as T[], meta: payload.meta };
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.page === 'number' &&
    typeof meta.limit === 'number' &&
    typeof meta.total === 'number' &&
    typeof meta.totalPages === 'number'
  );
}

/**
 * Authenticate with email + password. On success the API sets the HttpOnly
 * session cookie; the request body never contains a token (docs/08 §7.1).
 */
export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}

/** Resolve the current session identity + permissions (docs/08 §7.2). */
export function me(): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>('/auth/me');
}

/** Revoke the current session and clear the cookie (docs/08 §7.3). */
export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}

/**
 * Ask for a password-reset email (improvement A5). The API answers 202 with a
 * generic message whether or not the account exists; the UI must not infer.
 */
export function requestPasswordReset(email: string): Promise<PasswordResetResponse> {
  return apiRequest<PasswordResetResponse>('/auth/password-reset/request', {
    method: 'POST',
    body: { email },
  });
}

/** Consume a reset token and replace the password (improvement A5). */
export function confirmPasswordReset(
  token: string,
  password: string,
): Promise<PasswordResetResponse> {
  return apiRequest<PasswordResetResponse>('/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, password },
  });
}
