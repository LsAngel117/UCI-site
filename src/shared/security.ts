/**
 * Shared security policy primitives (Phase 12A, docs/11 §16–§17, §28–§30).
 *
 * The public Astro SSR site and the Fastify API/panel are separate runtimes but
 * must speak the same policy. This module owns the security-header names/values,
 * the CSP builder and the same-origin (CSRF) helper so the two runtimes cannot
 * drift apart. It is deliberately dependency-free (no Node built-ins) so it can
 * be imported from both bundles and from plain unit tests.
 *
 * Policy summary:
 * - Everything is same-origin by default (`default-src 'self'`).
 * - Scripts are self-hosted and inline scripts must carry a per-request nonce
 *   (Astro SSR). `'unsafe-inline'` is never allowed for scripts.
 * - Styles allow `'unsafe-inline'` because the design system and framework
 *   styling rely on inline style attributes/sheets; a style injection cannot
 *   execute JavaScript.
 * - Frames are limited to the YouTube hosts the sermon pages embed.
 * - Images accept `https:` because CMS/media and YouTube thumbnails may be
 *   served from an external media host.
 */

/** Static headers applied to every response by both runtimes. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // Legacy clickjacking defense; `frame-ancestors 'none'` in the CSP is the
  // modern control and both are sent so old browsers stay covered.
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Minimal capability set: the app never needs device sensors or payments.
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // Isolate the browsing context from cross-origin openers (docs/11 §28).
  'Cross-Origin-Opener-Policy': 'same-origin',
} as const;

/** HSTS value. Only emitted over HTTPS or in production (never dev HTTP). */
export const HSTS_HEADER = 'Strict-Transport-Security';
export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

/** CSP directive set shared by the API/panel and the public site. */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // Non-embeddable by any origin (docs/11 §30).
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'img-src': ["'self'", 'data:', 'https:'],
  // Sermons may embed an external audio URL (docs/05 §8); without `media-src`
  // those would fall back to `default-src 'self'` and be blocked.
  'media-src': ["'self'", 'https:'],
  // Kept for inline style attributes; a style cannot execute JavaScript.
  'style-src': ["'self'", "'unsafe-inline'"],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-src': [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
  ],
} as const;

/**
 * Directives that can be satisfied only by a runtime-provided nonce. The
 * Astro SSR site only emits inline scripts it owns, so it hands a fresh nonce
 * to the layout; the static panel/API bundle has no inline scripts.
 */
const NONCE_DIRECTIVES = ['script-src'] as const;

export interface ContentSecurityPolicyOptions {
  /**
   * Per-request nonce. When present, inline scripts carrying `nonce="…"` are
   * allowed in addition to same-origin scripts. When absent, only same-origin
   * and external script URLs are allowed.
   */
  nonce?: string;
}

/** Build the `Content-Security-Policy` value shared by both runtimes. */
export function buildContentSecurityPolicy(
  options: ContentSecurityPolicyOptions = {},
): string {
  const directives = new Map<string, readonly string[]>(Object.entries(CSP_DIRECTIVES));
  for (const directive of NONCE_DIRECTIVES) {
    directives.set(
      directive,
      options.nonce ? ["'self'", `'nonce-${options.nonce}'`] : ["'self'"],
    );
  }
  return [...directives]
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** Character set for nonces (base64 is valid in a CSP nonce source). */
const NONCE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Generate an unpredictable per-request nonce. Uses the platform CSPRNG via
 * `crypto.getRandomValues`, which Node ≥ 22 exposes as a global.
 */
export function generateNonce(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  let nonce = '';
  for (const byte of bytes) {
    nonce += NONCE_ALPHABET[byte % NONCE_ALPHABET.length];
  }
  return nonce;
}

export interface SecurityHeaderOptions {
  /** Send `Strict-Transport-Security` (HTTPS or production only, no dev HTTP). */
  secure: boolean;
  /** Per-request CSP nonce for inline scripts (Astro SSR). */
  nonce?: string;
}

/** Build the complete security-header map for a response. */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Content-Security-Policy': buildContentSecurityPolicy({
      nonce: options.nonce,
    }),
  };
  if (options.secure) headers[HSTS_HEADER] = HSTS_VALUE;
  return headers;
}

/**
 * Merge the security headers into a `Response` in place and return it. Used by
 * the Astro SSR middleware for every page and API route it serves.
 */
export function applySecurityHeaders(
  response: Response,
  options: SecurityHeaderOptions,
): Response {
  for (const [name, value] of Object.entries(buildSecurityHeaders(options))) {
    response.headers.set(name, value);
  }
  return response;
}

/** Methods that can change state and therefore need CSRF protection. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True for methods that must pass the same-origin check. */
export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export interface OriginCheckInput {
  /** Raw `Origin` request header, if the client sent one. */
  origin: string | undefined;
  /** Request scheme plus host (`request.protocol` + `Host` header). */
  requestOrigin: string;
  /** Additional explicitly allowed origins (e.g. `SITE_URL`). */
  allowedOrigins?: Iterable<string>;
}

/**
 * Same-origin CSRF decision (docs/11 §16).
 *
 * Browsers attach `Origin` to every cross-origin state-changing request, so a
 * mutation with an `Origin` that does not match the request's own origin is
 * rejected. A request without `Origin` is allowed: non-browser clients (the
 * Astro server-side proxy, tests, CLI tooling) cannot be driven into a CSRF
 * attack, and requiring `Origin` would break them.
 */
export function isSameOriginRequest(input: OriginCheckInput): boolean {
  const origin = input.origin?.trim();
  if (!origin) return true;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin === input.requestOrigin) return true;

  const requestUrl = safeUrl(input.requestOrigin);
  // Host-only comparison tolerates scheme termination differences behind a
  // TLS-terminating proxy while still refusing a different host.
  if (requestUrl && parsed.host === requestUrl.host) return true;

  if (input.allowedOrigins) {
    for (const allowed of input.allowedOrigins) {
      const allowedUrl = safeUrl(allowed);
      if (allowedUrl && parsed.origin === allowedUrl.origin) return true;
    }
  }
  return false;
}

/** Parse a URL, returning `null` instead of throwing on malformed input. */
function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Decide whether HSTS may be emitted. Both runtimes pass their own scheme and
 * runtime environment; the header is only safe over TLS (or when the runtime
 * is production behind a TLS terminator).
 */
export function shouldSendHsts(protocol: string, nodeEnv: string): boolean {
  const normalized = protocol.endsWith(':') ? protocol.slice(0, -1) : protocol;
  return normalized.toLowerCase() === 'https' || nodeEnv === 'production';
}
