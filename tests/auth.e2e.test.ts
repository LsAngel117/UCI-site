/**
 * Auth end-to-end regression suite (Phase 2, docs/08 §7, docs/11 §5–6).
 *
 * Exercises the real Fastify app through `app.inject()` (no port binding) plus
 * a real PostgreSQL database. The suite is skipped entirely when `DATABASE_URL`
 * is not provided in the environment, so `pnpm test` stays green on a machine
 * without a database.
 *
 * Rate-limit isolation: the login limiter (5/min/IP) keeps its counter per
 * Fastify instance, so every test builds its OWN app via `makeApp()` and closes
 * it in a `finally`. Counters therefore always start at zero.
 *
 * The test user is created and removed by the suite; nothing depends on the
 * seed's admin account or its credentials.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@shared/api';

// Read the guard BEFORE any module that calls `loadEnvFile()` runs, so a bare
// `.env` on disk never silently turns the e2e suite on. `--test` runs each test
// file in its own process, so these module-level assignments are per-file.
const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let prisma!: PrismaClient;

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
}

const TEST_EMAIL = 'e2e-auth-test@uci.local';
const TEST_PASSWORD = 'E2e-Auth-Passw0rd!';
const LOGIN_URL = '/api/v1/auth/login';
const ME_URL = '/api/v1/auth/me';
const LOGOUT_URL = '/api/v1/auth/logout';

/** A fresh Fastify instance (per-test rate-limit isolation). */
function makeApp(): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
  });
}

/** First `name=value` pair of a `Set-Cookie` header. */
function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, 'expected a Set-Cookie header');
  return header.split(';')[0]!;
}

/** Ensure the ADMIN role exists with the full vocabulary (idempotent). */
async function ensureAdminRole(): Promise<string> {
  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });
  for (const name of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role.id;
}

describe(
  'auth e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      const adminRoleId = await ensureAdminRole();
      const passwordHash = await hashPassword(TEST_PASSWORD);
      const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: { passwordHash, active: true, firstName: 'E2E', lastName: 'Auth' },
        create: {
          email: TEST_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'Auth',
          active: true,
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: adminRoleId } },
        update: {},
        create: { userId: user.id, roleId: adminRoleId },
      });
    });

    after(async () => {
      await prisma.session.deleteMany({ where: { user: { email: TEST_EMAIL } } });
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    });

    test('login sets an HttpOnly SameSite=Lax cookie and never leaks secrets', async () => {
      const app = makeApp();
      try {
        const res = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
        });
        assert.equal(res.statusCode, 200);

        const setCookie = res.headers['set-cookie'];
        const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        assert.ok(header, 'expected a Set-Cookie header');
        assert.match(header, /HttpOnly/i);
        assert.match(header, /SameSite=Lax/i);
        assert.match(header, /Path=\//i);

        const body = res.json<{ data: { user: { id: string } } }>();
        assert.ok(body.data.user.id, 'expected data.user.id in the login body');

        const tokenValue = header.split(';')[0]!.split('=').slice(1).join('=');
        assert.ok(tokenValue.length > 0, 'expected a session token value');
        assert.doesNotMatch(res.body, /tokenHash|passwordHash|\$argon2/i);
        assert.ok(
          !res.body.includes(tokenValue),
          'the session token must never appear in the response body',
        );
      } finally {
        await app.close();
      }
    });

    test('/auth/me returns the identity and permissions, and 401 without a cookie', async () => {
      const app = makeApp();
      try {
        const login = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
        });
        assert.equal(login.statusCode, 200);
        const cookie = sessionCookie(login.headers['set-cookie']);

        const me = await app.inject({
          method: 'GET',
          url: ME_URL,
          headers: { cookie },
        });
        assert.equal(me.statusCode, 200);
        const body = me.json<{ data: { permissions: unknown } }>();
        assert.ok(
          Array.isArray(body.data.permissions),
          'data.permissions must be an array',
        );

        const anonymous = await app.inject({ method: 'GET', url: ME_URL });
        assert.equal(anonymous.statusCode, 401);
      } finally {
        await app.close();
      }
    });

    test('invalid credentials yield the same generic 401 (no account enumeration)', async () => {
      const app = makeApp();
      try {
        const wrongPassword = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: TEST_EMAIL, password: 'definitely-wrong' },
        });
        const unknownEmail = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: 'e2e-does-not-exist@uci.local', password: 'whatever' },
        });

        assert.equal(wrongPassword.statusCode, 401);
        assert.equal(unknownEmail.statusCode, 401);
        assert.equal(
          wrongPassword.json<{ error: { message: string } }>().error.message,
          'Invalid credentials.',
        );
        assert.deepEqual(wrongPassword.json(), unknownEmail.json());
      } finally {
        await app.close();
      }
    });

    test('logout revokes the session — the previous cookie is rejected', async () => {
      const app = makeApp();
      try {
        const login = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
        });
        const cookie = sessionCookie(login.headers['set-cookie']);

        const logout = await app.inject({
          method: 'POST',
          url: LOGOUT_URL,
          headers: { cookie },
        });
        assert.equal(logout.statusCode, 204);

        const me = await app.inject({
          method: 'GET',
          url: ME_URL,
          headers: { cookie },
        });
        assert.equal(me.statusCode, 401);
      } finally {
        await app.close();
      }
    });

    test('the sixth login attempt within a minute is rate-limited', async () => {
      const app = makeApp();
      try {
        const statuses: number[] = [];
        let lastBody = '';
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const res = await app.inject({
            method: 'POST',
            url: LOGIN_URL,
            payload: { email: TEST_EMAIL, password: 'definitely-wrong' },
          });
          statuses.push(res.statusCode);
          lastBody = res.body;
        }

        assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
        assert.equal(statuses[5], 429);
        assert.equal(
          (JSON.parse(lastBody) as { error: { code: string } }).error.code,
          'RATE_LIMITED',
        );
      } finally {
        await app.close();
      }
    });

    test('a deactivated account loses access immediately', async () => {
      const app = makeApp();
      try {
        const login = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
        });
        const cookie = sessionCookie(login.headers['set-cookie']);

        const active = await app.inject({
          method: 'GET',
          url: ME_URL,
          headers: { cookie },
        });
        assert.equal(active.statusCode, 200);

        await prisma.user.update({
          where: { email: TEST_EMAIL },
          data: { active: false },
        });

        const blocked = await app.inject({
          method: 'GET',
          url: ME_URL,
          headers: { cookie },
        });
        assert.equal(blocked.statusCode, 401);
      } finally {
        await prisma.user.update({
          where: { email: TEST_EMAIL },
          data: { active: true },
        });
        await app.close();
      }
    });
  },
);
