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

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  session: SessionConfig;
  cookie: CookieConfig;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;

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

/** Read and validate configuration from the environment. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Load `.env` so HOST/PORT/session vars are available locally.
  loadEnvFile();
  const nodeEnv = readNodeEnv(env.NODE_ENV);
  return {
    nodeEnv,
    host: env.HOST ?? DEFAULT_HOST,
    port: readPort(env.PORT),
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
  };
}