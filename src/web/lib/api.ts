/**
 * Typed public API client (Phase 9A, docs/08 §10–17).
 *
 * The Astro server is the only consumer: it fetches CMS content over HTTP on
 * every request. No Prisma/Postgres access ever happens here (docs/07 §59).
 *
 * Contract:
 * - Every call targets `${API_BASE_URL}/api/v1/...` and reads the documented
 *   `{ data, meta }` envelope. Response bodies are typed with the shared public
 *   DTOs from `@shared`, never re-declared locally.
 * - Non-2xx responses and transport failures become `ApiError`. A 404 on a
 *   detail endpoint resolves to `null` (an honest "not found" for pages), while
 *   list/settings failures stay exceptional so the data layer can decide how to
 *   degrade the homepage without crashing the render.
 * - Requests have a bounded timeout (`API_TIMEOUT_MS`, default 5s). The Astro
 *   build never touches the network; only request-time rendering does.
 */
import type { ApiErrorEnvelope, ListResponse } from '@shared/api';
import type {
  NavigationLocation,
  PublicEventDto,
  PublicEventListQuery,
  PublicMinistryDto,
  PublicMinistryListQuery,
  PublicNavigationItemDto,
  PublicPageDetailDto,
  PublicPageDto,
  PublicPageListQuery,
  PublicSermonDetailDto,
  PublicSermonDto,
  PublicSermonListQuery,
} from '@shared/cms';
import type { PublicSettingsDto } from '@shared/settings';

/** Default local API origin. Mirrors `.env.example` and the Node server. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787';
/** Default per-request timeout in milliseconds. */
export const DEFAULT_API_TIMEOUT_MS = 5_000;

export interface ApiRequestOptions {
  /** Absolute override, mainly for tests/tooling. Defaults to the env origin. */
  baseUrl?: string;
  /** Per-call timeout override in milliseconds. */
  timeoutMs?: number;
  /**
   * Optional query parameters appended to the path. Typed as `object` so the
   * shared query interfaces (which have no index signature) can be passed
   * directly; `buildUrl` serializes only primitive values.
   */
  params?: object;
}

/**
 * Public API failure with a stable code. `status` is `0` for transport errors
 * (network refused, DNS failure, timeout) so callers can distinguish them from
 * an HTTP response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status: number; code: string; details?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Read an env value from the Node runtime, then Vite's build-time env. */
function readEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  // `import.meta.env` is populated by Vite during dev/build. It is the only
  // source available when `.env` is loaded by Astro rather than the shell.
  const viteValue: unknown = import.meta.env?.[name];
  if (typeof viteValue === 'string' && viteValue.trim().length > 0) {
    return viteValue.trim();
  }

  return undefined;
}

/** Resolve the API origin (no trailing slash), honouring `API_BASE_URL`. */
export function getApiBaseUrl(): string {
  const raw = readEnv('API_BASE_URL') ?? DEFAULT_API_BASE_URL;
  const trimmed = raw.replace(/\/+$/, '');

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return trimmed;
  } catch {
    console.warn(
      `[uci] Invalid API_BASE_URL "${raw}" — falling back to ${DEFAULT_API_BASE_URL}.`,
    );
    return DEFAULT_API_BASE_URL;
  }
}

/** Resolve the request timeout, falling back to the documented default. */
export function getApiTimeoutMs(): number {
  const raw = readEnv('API_TIMEOUT_MS');
  if (!raw) return DEFAULT_API_TIMEOUT_MS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.warn(
      `[uci] Invalid API_TIMEOUT_MS "${raw}" — falling back to ${DEFAULT_API_TIMEOUT_MS}ms.`,
    );
    return DEFAULT_API_TIMEOUT_MS;
  }
  return value;
}

function buildUrl(path: string, options: ApiRequestOptions): string {
  const base = (options.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      continue;
    }
    if (value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function parseErrorEnvelope(body: unknown): ApiErrorEnvelope['error'] | null {
  if (body === null || typeof body !== 'object') return null;
  const envelope = body as Partial<ApiErrorEnvelope>;
  if (
    envelope.error &&
    typeof envelope.error === 'object' &&
    typeof envelope.error.message === 'string'
  ) {
    return {
      code:
        typeof envelope.error.code === 'string' ? envelope.error.code : 'REQUEST_ERROR',
      message: envelope.error.message,
      details: envelope.error.details,
    };
  }
  return null;
}

/**
 * Perform one API request and return the parsed JSON body.
 *
 * @throws {ApiError} on any non-2xx response, timeout or transport failure.
 */
async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options);
  const timeoutMs = options.timeoutMs ?? getApiTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      timedOut
        ? `API request timed out after ${timeoutMs}ms: ${url}`
        : `API request failed: ${url}`,
      {
        status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        cause,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body (e.g. a proxy 502 page) is reported below.
  }

  if (!response.ok) {
    const envelope = parseErrorEnvelope(body);
    throw new ApiError(envelope?.message ?? `API responded with ${response.status}`, {
      status: response.status,
      code: envelope?.code ?? 'REQUEST_ERROR',
      details: envelope?.details,
    });
  }

  return body as T;
}

function assertListResponse<T>(body: unknown, path: string): ListResponse<T> {
  if (
    body === null ||
    typeof body !== 'object' ||
    !Array.isArray((body as ListResponse<T>).data)
  ) {
    throw new ApiError(`Malformed list response from ${path}`, {
      status: 0,
      code: 'MALFORMED_RESPONSE',
    });
  }
  return body as ListResponse<T>;
}

function assertDataResponse<T>(body: unknown, path: string): T {
  if (body === null || typeof body !== 'object' || !('data' in body)) {
    throw new ApiError(`Malformed response from ${path}`, {
      status: 0,
      code: 'MALFORMED_RESPONSE',
    });
  }
  return (body as { data: T }).data;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** `GET /api/v1/settings/public` (docs/08 §17.1). */
export async function getSettingsPublic(
  options: ApiRequestOptions = {},
): Promise<PublicSettingsDto> {
  const path = '/api/v1/settings/public';
  const body = await apiFetch<unknown>(path, options);
  return assertDataResponse<PublicSettingsDto>(body, path);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/navigation?location=HEADER` (docs/08 §14.1).
 * Returns the already-nested, ordered public tree.
 */
export async function getNavigation(
  location: NavigationLocation | string = 'HEADER',
  options: ApiRequestOptions = {},
): Promise<PublicNavigationItemDto[]> {
  const path = '/api/v1/navigation';
  const body = await apiFetch<unknown>(path, {
    ...options,
    params: { ...options.params, location },
  });
  return assertDataResponse<PublicNavigationItemDto[]>(body, path);
}

// ---------------------------------------------------------------------------
// Sermons
// ---------------------------------------------------------------------------

/** `GET /api/v1/sermons` (docs/08 §11.1). Published sermons only. */
export async function getSermons(
  params: PublicSermonListQuery = {},
  options: ApiRequestOptions = {},
): Promise<ListResponse<PublicSermonDto>> {
  const path = '/api/v1/sermons';
  const body = await apiFetch<unknown>(path, { ...options, params });
  return assertListResponse<PublicSermonDto>(body, path);
}

/** `GET /api/v1/sermons/:slug` (docs/08 §11.2). `null` when not found. */
export async function getSermon(
  slug: string,
  options: ApiRequestOptions = {},
): Promise<PublicSermonDetailDto | null> {
  const path = `/api/v1/sermons/${encodeURIComponent(slug)}`;
  try {
    const body = await apiFetch<unknown>(path, options);
    return assertDataResponse<PublicSermonDetailDto>(body, path);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** `GET /api/v1/events` (docs/08 §12.1). Published events only. */
export async function getEvents(
  params: PublicEventListQuery = {},
  options: ApiRequestOptions = {},
): Promise<ListResponse<PublicEventDto>> {
  const path = '/api/v1/events';
  const body = await apiFetch<unknown>(path, { ...options, params });
  return assertListResponse<PublicEventDto>(body, path);
}

/** `GET /api/v1/events/:slug` (docs/08 §12.2). `null` when not found. */
export async function getEvent(
  slug: string,
  options: ApiRequestOptions = {},
): Promise<PublicEventDto | null> {
  const path = `/api/v1/events/${encodeURIComponent(slug)}`;
  try {
    const body = await apiFetch<unknown>(path, options);
    return assertDataResponse<PublicEventDto>(body, path);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

/** `GET /api/v1/ministries` (docs/08 §13.1). Published ministries only. */
export async function getMinistries(
  params: PublicMinistryListQuery = {},
  options: ApiRequestOptions = {},
): Promise<ListResponse<PublicMinistryDto>> {
  const path = '/api/v1/ministries';
  const body = await apiFetch<unknown>(path, { ...options, params });
  return assertListResponse<PublicMinistryDto>(body, path);
}

/** `GET /api/v1/ministries/:slug` (docs/08 §13.2). `null` when not found. */
export async function getMinistry(
  slug: string,
  options: ApiRequestOptions = {},
): Promise<PublicMinistryDto | null> {
  const path = `/api/v1/ministries/${encodeURIComponent(slug)}`;
  try {
    const body = await apiFetch<unknown>(path, options);
    return assertDataResponse<PublicMinistryDto>(body, path);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** `GET /api/v1/pages` (docs/08 §10.1). Published pages only. */
export async function getPages(
  params: PublicPageListQuery = {},
  options: ApiRequestOptions = {},
): Promise<ListResponse<PublicPageDto>> {
  const path = '/api/v1/pages';
  const body = await apiFetch<unknown>(path, { ...options, params });
  return assertListResponse<PublicPageDto>(body, path);
}

/** `GET /api/v1/pages/:slug` (docs/08 §10.2). `null` when not found. */
export async function getPage(
  slug: string,
  options: ApiRequestOptions = {},
): Promise<PublicPageDetailDto | null> {
  const path = `/api/v1/pages/${encodeURIComponent(slug)}`;
  try {
    const body = await apiFetch<unknown>(path, options);
    return assertDataResponse<PublicPageDetailDto>(body, path);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}
