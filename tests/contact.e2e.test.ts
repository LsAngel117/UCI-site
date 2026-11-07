/**
 * Phase 9B2 — public contact endpoint (docs/08 §19, §40).
 *
 * Proves against a real PostgreSQL database that:
 *   - a valid submission answers 201, persists name/email/message and never
 *     echoes the stored row;
 *   - malformed input answers 400 VALIDATION_ERROR and persists nothing;
 *   - the route is rate limited per IP;
 *   - no public read route exists for stored submissions.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. Every row
 * created by the suite is removed in teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let prisma!: PrismaClient;

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ prisma } = await import('@server/db'));
}

const RUN = randomUUID().slice(0, 8);
const EMAIL_PREFIX = `contact-e2e-${RUN}`;
const CONTACT_URL = '/api/v1/contact';

function makeApp(): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
  });
}

async function postContact(
  app: FastifyInstance,
  payload: unknown,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const res = await app.inject({
    method: 'POST',
    url: CONTACT_URL,
    // Inject serializes a plain object as JSON and sets content-type.
    payload: payload as Record<string, unknown>,
  });
  return {
    statusCode: res.statusCode,
    body: res.body,
    json: <T>() => res.json<T>(),
  };
}

after(async () => {
  if (!HAS_DB) return;
  await prisma.contactSubmission.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
});

describe(
  'public contact endpoint',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    test('a valid submission is persisted and confirmed without exposing the row', async () => {
      const app = makeApp();
      const email = `${EMAIL_PREFIX}-valid@uci.test`;
      try {
        const res = await postContact(app, {
          name: '  Ana Gómez ',
          email: ` ${email} `,
          message: '  Quisiera conocer los horarios. ',
        });

        assert.equal(res.statusCode, 201, res.body);
        const body = res.json<{ data: { received: boolean } }>();
        assert.deepEqual(body, { data: { received: true } });

        const stored = await prisma.contactSubmission.findFirst({
          where: { email },
        });
        assert.ok(stored, 'the submission must be persisted');
        assert.equal(stored.name, 'Ana Gómez');
        assert.equal(stored.email, email);
        assert.equal(stored.message, 'Quisiera conocer los horarios.');
      } finally {
        await app.close();
      }
    });

    test('malformed submissions answer 400 and persist nothing', async () => {
      const app = makeApp();
      const email = `${EMAIL_PREFIX}-invalid@uci.test`;
      try {
        const cases: Array<Record<string, unknown>> = [
          { email, message: 'Hola' },
          { name: 'Ana', message: 'Hola' },
          { name: 'Ana', email: 'not-an-email', message: 'Hola' },
          { name: 'Ana', email, message: '   ' },
        ];

        for (const payload of cases) {
          const res = await postContact(app, payload);
          assert.equal(res.statusCode, 400, res.body);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }

        const count = await prisma.contactSubmission.count({
          where: { email },
        });
        assert.equal(count, 0, 'rejected input must not create rows');
      } finally {
        await app.close();
      }
    });

    test('unknown fields such as subject are rejected, never silently dropped', async () => {
      const app = makeApp();
      const email = `${EMAIL_PREFIX}-subject@uci.test`;
      try {
        const res = await postContact(app, {
          name: 'Ana',
          email,
          message: 'Hola',
          subject: 'Consulta',
        });

        assert.equal(res.statusCode, 400, res.body);
        const body = res.json<{
          error: { code: string; details?: { fields?: string[] } };
        }>();
        assert.equal(body.error.code, 'VALIDATION_ERROR');
        assert.deepEqual(body.error.details?.fields, ['subject']);

        const count = await prisma.contactSubmission.count({
          where: { email },
        });
        assert.equal(count, 0, 'a rejected submission must not create rows');
      } finally {
        await app.close();
      }
    });

    test('the route is rate limited per IP', async () => {
      const app = makeApp();
      try {
        // Five accepted requests (invalid payloads, so nothing is persisted),
        // then the limiter rejects the sixth within the one-minute window.
        for (let index = 0; index < 5; index += 1) {
          const res = await postContact(app, {});
          assert.equal(res.statusCode, 400, res.body);
        }

        const limited = await postContact(app, {});
        assert.equal(limited.statusCode, 429, limited.body);
        assert.equal(
          limited.json<{ error: { code: string } }>().error.code,
          'RATE_LIMITED',
        );
      } finally {
        await app.close();
      }
    });

    test('the rate limit is keyed per forwarded client IP', async () => {
      const app = makeApp();
      const firstIp = '203.0.113.10';
      const secondIp = '203.0.113.11';

      const post = (ip: string) =>
        app.inject({
          method: 'POST',
          url: CONTACT_URL,
          headers: { 'x-forwarded-for': ip },
          payload: {},
        });

      try {
        // Exhaust the first client's budget. Invalid payloads answer 400 and
        // never persist, so this only exercises the limiter.
        for (let index = 0; index < 5; index += 1) {
          const res = await post(firstIp);
          assert.equal(res.statusCode, 400, res.body);
        }

        const otherClient = await post(secondIp);
        assert.equal(
          otherClient.statusCode,
          400,
          `a different client must not inherit the first client's limit: ${otherClient.body}`,
        );

        const sameClient = await post(firstIp);
        assert.equal(sameClient.statusCode, 429, sameClient.body);
      } finally {
        await app.close();
      }
    });

    test('contact records are not readable through the public API', async () => {
      const app = makeApp();
      try {
        const res = await app.inject({ method: 'GET', url: CONTACT_URL });
        assert.equal(res.statusCode, 404, res.body);
      } finally {
        await app.close();
      }
    });
  },
);
