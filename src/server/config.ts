/**
 * Typed, secret-free environment configuration (docs/14 §24, §26, docs/11 §46).
 *
 * This module is the single entry point for runtime configuration. It reads a
 * closed set of variables and fails fast on invalid values so a misconfigured
 * server never starts in a half-broken state. No secrets are read here: host,
 * port, environment and the session TTLs are all non-sensitive. Database and
 * admin credentials stay in `DATABASE_URL` / seed-only env vars and are never
 * surfaced through this module.
 */

import { resolve } from 'node:path';
import { normalizePublicBase } from './media/storage';
import { loadEnvFile } from './env';

export type NodeEnv = 'development' | 'production' | 'test';

/** Name of the cookie transporting the opaque session token. */
export const SESSION_COOKIE_NAME = 'uci_session';

/**
 * Session lifetimes in milliseconds. Kept separate from the cookie name so the
 * auth layer can depend on the timing policy without the transport details.
 */
export interface SessionTtls {
  /** Absolute lifetime, fixed at creation and never extended (docs/11 §6.3). */
  absoluteTtlMs: number;
  /** Idle timeout measured from `lastSeenAt`; slides forward on activity. */
  idleTtlMs: number;
}

export interface SessionConfig extends SessionTtls {
  /** Cookie carrying the session token. */
  cookieName: string;
}

/** Transport security for the session cookie (docs/11 §6.2). */
export interface CookieConfig {
  /** `Secure` attribute — always on in production. */
  secure: boolean;
  /** Least permissive SameSite policy that still works for the CMS. */
  sameSite: 'lax';
  path: string;
}

/**
 * Email delivery configuration (Phase 11A, docs/14 §24, docs/15 §17.3).
 *
 * Phase 11A ships the delivery *foundation* only: a provider that logs the
 * simulated send (development) and one that does nothing (no integration).
 * Real SMTP/API credentials belong to Phase 13 and are never hardcoded here.
 */
export interface EmailConfig {
  /** `log` renders the message to the server log; `none` disables delivery. */
  provider: 'log' | 'none';
  /** Admin inbox that receives contact-form notifications, or null. */
  contactNotifyTo: string | null;
}

/**
 * Application-level scheduler configuration (Phase 12B, docs/07 §505,
 * docs/14 §1159–1167). The API process owns the scheduled-publication tick;
 * no external worker is required for the MVP.
 */
export interface SchedulerConfig {
  /** Milliseconds between due-content sweeps (`SCHEDULER_INTERVAL_MS`). */
  intervalMs: number;
}

/** Media storage configuration (docs/12 §7, docs/14 §24). */
export interface MediaConfig {
  /** Directory the filesystem provider writes to. Absolute after loading. */
  root: string;
  /** Public path prefix (`/media`) or absolute media host URL. */
  publicBase: string;
  /** Hard upload limit in bytes (`MEDIA_MAX_UPLOAD_BYTES`). */
  maxUploadBytes: number;
}

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  /** Canonical public origin used to build absolute SEO URLs (docs/10 §6.2). */
  siteUrl: string;
  /**
   * Fastify `trustProxy` value. The API sits behind the same-origin Astro
   * proxy, which sets `X-Forwarded-For` with the real client IP; only that
   * proxy may be trusted. Defaults to loopback so a directly reachable API
   * cannot let a client spoof its way around the per-IP rate limit.
   */
  trustProxy: boolean | string;
  session: SessionConfig;
  cookie: CookieConfig;
  media: MediaConfig;
  email: EmailConfig;
  scheduler: SchedulerConfig;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;

/**
 * Default reverse-proxy trust: loopback only. The Astro proxy and the API run
 * on the same host in the supported deployment (same-origin bridge), so the
 * forwarded client IP is trusted from `127.0.0.1`/`::1` and nowhere else.
 */
const DEFAULT_TRUST_PROXY = 'loopback';

/**
 * Non-production placeholder mirrored from `astro.config.mjs`. A deploy that
 * forgets `SITE_URL` publishes placeholder canonical URLs; `BaseLayout` warns
 * about the same value, so both runtimes fail visibly instead of silently.
 */
export const DEFAULT_SITE_URL = 'https://uci.example.org';

/** 10 MB default upload ceiling (feature doc Phase 4 decision). */
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_MEDIA_ROOT = './media';

/** One publication sweep per minute by default (Phase 12B). */
const DEFAULT_SCHEDULER_INTERVAL_MS = 60_000;

/**
 * Default session lifetimes (docs/11 §6.3 — "exact production values may be
 * finalized during implementation"). Chosen conservative for an admin CMS:
 * 7 days absolute cap, 12 hours of inactivity. Overridable per environment via
 * `SESSION_ABSOLUTE_TTL` / `SESSION_IDLE_TTL` (seconds).
 */
const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_SESSION_IDLE_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function readNodeEnv(raw: string | undefined): NodeEnv {
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value "${raw}". Expected an integer between 1 and 65535.`,
    );
  }
  return port;
}

/**
 * Read and validate the public origin. Only an absolute http(s) URL is
 * accepted; the trailing slash is removed so callers can append paths without
 * producing `//` (docs/10 §6.2).
 */
function readSiteUrl(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_SITE_URL;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid SITE_URL value "${value}". Expected an absolute http(s) URL.`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid SITE_URL value "${value}". Expected an absolute http(s) URL.`,
    );
  }
  return value.replace(/\/+$/, '');
}

/**
 * Read a TTL in whole seconds and convert it to milliseconds. Invalid values
 * fail fast: a broken TTL must never silently disable session expiry.
 */
function readTtlMs(
  raw: string | undefined,
  fallbackSeconds: number,
  name: string,
): number {
  if (raw === undefined || raw === '') return fallbackSeconds * 1000;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(
      `Invalid ${name} value "${raw}". Expected a positive integer (seconds).`,
    );
  }
  return seconds * 1000;
}

function readPositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${name} value "${raw}". Expected a positive integer.`,
    );
  }
  return value;
}

/**
 * Read the proxy trust list for Fastify. `"true"`/`"false"` map to booleans;
 * any other value is an IP/CIDR list or proxy-addr name (e.g. `loopback`).
 * An explicit override is for deployments where the proxy is not loopback.
 */
function readTrustProxy(raw: string | undefined): boolean | string {
  const value = raw?.trim();
  if (!value) return DEFAULT_TRUST_PROXY;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Pragmatic single-address check; the notification recipient is trusted ops config. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Read the email provider. `log` is the safe development default (it never
 * sends anything and only records a redacted simulation); production defaults
 * to `none` so an unconfigured deploy never pretends to deliver mail.
 */
function readEmailProvider(
  raw: string | undefined,
  nodeEnv: NodeEnv,
): EmailConfig['provider'] {
  const value = raw?.trim().toLowerCase();
  if (value === 'log' || value === 'none') return value;
  if (value) {
    throw new Error(
      `Invalid EMAIL_PROVIDER value "${raw}". Expected "log" or "none".`,
    );
  }
  return nodeEnv === 'production' ? 'none' : 'log';
}

/** Optional admin recipient for contact notifications; invalid values fail fast. */
function readContactNotifyTo(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!EMAIL_PATTERN.test(value)) {
    throw new Error(
      `Invalid CONTACT_NOTIFY_TO value "${value}". Expected an email address.`,
    );
  }
  return value.toLowerCase();
}

function readEmailConfig(
  env: NodeJS.ProcessEnv,
  nodeEnv: NodeEnv,
): EmailConfig {
  return {
    provider: readEmailProvider(env.EMAIL_PROVIDER, nodeEnv),
    contactNotifyTo: readContactNotifyTo(env.CONTACT_NOTIFY_TO),
  };
}

/** Read the publication scheduler interval; a broken value fails fast. */
function readSchedulerConfig(env: NodeJS.ProcessEnv): SchedulerConfig {
  return {
    intervalMs: readPositiveInt(
      env.SCHEDULER_INTERVAL_MS,
      DEFAULT_SCHEDULER_INTERVAL_MS,
      'SCHEDULER_INTERVAL_MS',
    ),
  };
}

/**
 * True when the configured public origin is still the development
 * placeholder. Production must provide a real `SITE_URL` or every canonical,
 * Open Graph URL and sitemap entry points at `uci.example.org` (docs/10 §6.2).
 */
export function isPlaceholderSiteUrl(siteUrl: string): boolean {
  return siteUrl === DEFAULT_SITE_URL;
}

/** Read the media storage configuration; never hardcodes a filesystem path. */
function readMediaConfig(env: NodeJS.ProcessEnv): MediaConfig {
  const rootRaw = env.MEDIA_ROOT?.trim() || DEFAULT_MEDIA_ROOT;
  return {
    root: resolve(process.cwd(), rootRaw),
    publicBase: normalizePublicBase(env.MEDIA_PUBLIC_BASE),
    maxUploadBytes: readPositiveInt(
      env.MEDIA_MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
      'MEDIA_MAX_UPLOAD_BYTES',
    ),
  };
}

/** Read and validate configuration from the environment. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Load `.env` so HOST/PORT/session vars are available locally.
  loadEnvFile();
  const nodeEnv = readNodeEnv(env.NODE_ENV);
  return {
    nodeEnv,
    host: env.HOST ?? DEFAULT_HOST,
    port: readPort(env.PORT),
    siteUrl: readSiteUrl(env.SITE_URL),
    trustProxy: readTrustProxy(env.TRUST_PROXY),
    session: {
      cookieName: SESSION_COOKIE_NAME,
      absoluteTtlMs: readTtlMs(
        env.SESSION_ABSOLUTE_TTL,
        DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
        'SESSION_ABSOLUTE_TTL',
      ),
      idleTtlMs: readTtlMs(
        env.SESSION_IDLE_TTL,
        DEFAULT_SESSION_IDLE_TTL_SECONDS,
        'SESSION_IDLE_TTL',
      ),
    },
    cookie: {
      // SameSite=Lax is the CSRF mitigation for now (docs/11 §16); the token is
      // only ever sent over TLS in production, so `Secure` is env-bound.
      secure: nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
    },
    media: readMediaConfig(env),
    email: readEmailConfig(env, nodeEnv),
    scheduler: readSchedulerConfig(env),
  };
}
