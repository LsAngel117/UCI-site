/**
 * Typed, secret-free environment configuration (docs/14 §24, §26).
 *
 * This module is the single entry point for runtime configuration. It reads a
 * closed set of variables and fails fast on invalid values so a misconfigured
 * server never starts in a half-broken state. No secrets live here: only
 * host/port/environment are required to boot the Phase 0 server.
 */

import { loadEnvFile } from './env';

export type NodeEnv = 'development' | 'production' | 'test';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;

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

/** Read and validate configuration from the environment. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Load `.env` so HOST/PORT (and any future vars) are available locally.
  loadEnvFile();
  return {
    nodeEnv: readNodeEnv(env.NODE_ENV),
    host: env.HOST ?? DEFAULT_HOST,
    port: readPort(env.PORT),
  };
}
