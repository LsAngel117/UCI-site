/**
 * Phase 12A — API security headers + same-origin CSRF guard (docs/11 §16,
 * §28–§30, §36).
 *
 * Runs the real Fastify app through `app.inject()`; no PostgreSQL row is
 * touched (the probe routes are registered by the test itself and `/health`
 * degrades gracefully when the database is unavailable).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '@server/app';
import { loadConfig } from '@server/config';

function makeApp(nodeEnv: 'test' | 'production' = 'test'): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: nodeEnv }),
  });
}

/** Probe route that echoes 200 — stands in for any authenticated mutation. */
function registerMutationProbe(app: FastifyInstance): void {
  app.post('/__security_probe__', async () => ({ ok: true }));
}

/** Probe route that throws a message that must never reach the client. */
function registerThrowingProbe(app: FastifyInstance): void {
  app.get('/__security_boom__', async () => {
    throw Object.assign(new Error('super-secret-db-detail'), {
      statusCode: 500,
    });
  });
}

async function closeApp(app: FastifyInstance): Promise<void> {
  await app.close();
}

describe('API security headers', () => {
  test('every response carries the hardening headers', async () => {
    const app = makeApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['x-frame-options'], 'DENY');
      assert.equal(
        response.headers['referrer-policy'],
        'strict-origin-when-cross-origin',
      );
      assert.match(
        String(response.headers['permissions-policy']),
        /camera=\(\)/,
      );
      assert.equal(
        response.headers['cross-origin-opener-policy'],
        'same-origin',
      );
      assert.match(
        String(response.headers['content-security-policy']),
        /default-src 'self'/,
      );
      // Same-origin only: no permissive CORS is ever emitted.
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    } finally {
      await closeApp(app);
    }
  });

  test('HSTS is absent in test/plain-HTTP and present in production', async () => {
    const dev = makeApp('test');
    try {
      const response = await dev.inject({ method: 'GET', url: '/api/v1/health' });
      assert.equal(
        response.headers['strict-transport-security'],
        undefined,
      );
    } finally {
      await closeApp(dev);
    }

    const prod = makeApp('production');
    try {
      const response = await prod.inject({
        method: 'GET',
        url: '/api/v1/health',
      });
      assert.match(
        String(response.headers['strict-transport-security']),
        /max-age=31536000/,
      );
    } finally {
      await closeApp(prod);
    }
  });

  test('a 500 response stays generic and still carries the headers', async () => {
    const app = makeApp();
    registerThrowingProbe(app);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/__security_boom__',
      });
      assert.equal(response.statusCode, 500);
      const body = response.json<{ error: { code: string; message: string } }>();
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'Internal server error');
      assert.doesNotMatch(response.body, /super-secret-db-detail/);
      assert.doesNotMatch(response.body, /at .*\.ts:/);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
    } finally {
      await closeApp(app);
    }
  });
});

describe('same-origin CSRF guard', () => {
  test('accepts a same-origin mutation', async () => {
    const app = makeApp();
    registerMutationProbe(app);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/__security_probe__',
        headers: {
          host: 'app.uci.test',
          origin: 'https://app.uci.test',
        },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await closeApp(app);
    }
  });

  test('accepts non-browser mutations without an Origin header', async () => {
    const app = makeApp();
    registerMutationProbe(app);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/__security_probe__',
        headers: { host: 'app.uci.test' },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await closeApp(app);
    }
  });

  test('rejects a cross-origin mutation with 403 CSRF_REJECTED', async () => {
    const app = makeApp();
    registerMutationProbe(app);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/__security_probe__',
        headers: {
          host: 'app.uci.test',
          origin: 'https://evil.example',
        },
      });
      assert.equal(response.statusCode, 403);
      const body = response.json<{ error: { code: string; message: string } }>();
      assert.equal(body.error.code, 'CSRF_REJECTED');
      // The probe body never runs: the response is the rejection envelope.
      assert.equal(response.body.includes('"ok":true'), false);
    } finally {
      await closeApp(app);
    }
  });

  test('does not block safe methods with a foreign Origin', async () => {
    const app = makeApp();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          host: 'app.uci.test',
          origin: 'https://evil.example',
        },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await closeApp(app);
    }
  });
});
