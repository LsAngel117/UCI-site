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
 */
import type {
  ApiErrorEnvelope,
  ApiResponse,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
} from '@shared/api';

/** Same-origin prefix. Vite proxies `/api` to the API in dev (vite.config). */
const API_PREFIX = '/api/v1';

/** A failed API call with enough context for the UI to react precisely. */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** Stable machine-readable code from the error envelope (docs/08 §30). */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The session expired or was never established (docs/09 §7). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
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

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_ERROR',
      envelope?.error?.message ?? 'La solicitud no se pudo completar.',
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

  return (payload as ApiResponse<T>).data;
}

/**
 * Authenticate with email + password. On success the API sets the HttpOnly
 * session cookie; the request body never contains a token (docs/08 §7.1).
 */
export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}

/** Resolve the current session identity + permissions (docs/08 §7.2). */
export function me(): Promise<CurrentUserResponse> {
  return request<CurrentUserResponse>('/auth/me');
}

/** Revoke the current session and clear the cookie (docs/08 §7.3). */
export async function logout(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' });
}
