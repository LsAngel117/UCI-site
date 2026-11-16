#!/usr/bin/env node
/**
 * Dev orchestrator: runs the API, the public Astro site and the admin panel
 * together with clearly-prefixed, interleaved output.
 *
 * Usage: `pnpm dev:all`  — Ctrl+C stops the whole group.
 *
 * Each service is spawned as a `pnpm <script>` process in its own process
 * group (`detached`). `pnpm` runs the real tool through `sh -c`, so killing
 * only the direct child would orphan `astro`/`vite`/`tsx`. On shutdown we kill
 * the whole group (`-pid`) so no stray dev server keeps a port busy.
 */
import { spawn, spawnSync } from 'node:child_process';

const ANSI_RESET = '\x1b[0m';
const isWindows = process.platform === 'win32';
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';

/** @type {{ name: string; color: string; args: string[] }[]} */
const services = [
  { name: 'api', color: '\x1b[36m', args: ['dev:server'] },
  { name: 'web', color: '\x1b[35m', args: ['dev'] },
  { name: 'panel', color: '\x1b[33m', args: ['dev:admin'] },
];

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function writePrefixed(name, color, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.length === 0) continue;
    process.stdout.write(`${color}[${name}]${ANSI_RESET} ${line}\n`);
  }
}

/** Kill a child and every process in its group (its `sh`/tool grandchildren). */
function killTree(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid == null) {
    return;
  }
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  try {
    // Negative pid targets the whole process group created by `detached`.
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reason) process.stdout.write(`\n${reason}\n`);
  for (const child of children) killTree(child, 'SIGTERM');
  setTimeout(() => {
    for (const child of children) killTree(child, 'SIGKILL');
    process.exit(0);
  }, 3000).unref();
}

process.stdout.write(
  'Starting dev stack: api (8787) + web (Astro) + panel (Vite). Ctrl+C to stop.\n',
);

for (const service of services) {
  const child = spawn(pnpm, service.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: !isWindows,
  });
  children.push(child);
  child.stdout?.on('data', (chunk) => writePrefixed(service.name, service.color, chunk));
  child.stderr?.on('data', (chunk) => writePrefixed(service.name, service.color, chunk));
  child.on('error', (error) => {
    process.stderr.write(`[${service.name}] failed to start: ${error.message}\n`);
    shutdown(`[${service.name}] could not start; stopping the stack.`);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shutdown(
      `[${service.name}] exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'none'}); stopping the stack.`,
    );
  });
}

process.on('SIGINT', () => shutdown('Stopping dev stack…'));
process.on('SIGTERM', () => shutdown('Stopping dev stack…'));
