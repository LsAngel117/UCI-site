/**
 * Scheduled-publication end-to-end suite (Phase 12B, docs/15 §18.6).
 *
 * Proves against a real PostgreSQL database that:
 *   - `runDuePublishing(now)` promotes scheduled sermons, events, ministries
 *     and pages whose `publishAt` has passed to `published`;
 *   - scheduled content whose instant is still in the future is left alone;
 *   - published scheduled content becomes visible through the public API;
 *   - `buildServer` itself starts no timer (the scheduler is composed only by
 *     the process entrypoint, so tests and builds never publish spontaneously).
 *
 * Skipped when `DATABASE_URL` is absent, like the other e2e suites. Every row
 * created by the suite is removed in teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PermissionName } from '@shared/api';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let runDuePublishing!: typeof import('@server/scheduler').runDuePublishing;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ runDuePublishing } = await import('@server/scheduler'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `scheduler-admin-${RUN}@uci.local`;
const PASSWORD = 'Scheduler-E2e-Passw0rd!';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];
const sermonIds: string[] = [];
const eventIds: string[] = [];
const ministryIds: string[] = [];
const pageIds: string[] = [];

function makeApp(env: Record<string, string> = {}): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test', ...env }),
  });
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: LOGIN_URL,
    payload: { email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, `login failed: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, 'expected a Set-Cookie header');
  return header.split(';')[0]!;
}

async function postJson(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: { cookie },
    payload,
  });
  return {
    statusCode: res.statusCode,
    body: res.body,
    json: <T>() => res.json<T>(),
  };
}

async function createRecord(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
  bucket: string[],
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, url, payload);
  assert.equal(res.statusCode, 201, `create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  bucket.push(String(data.id));
  return data;
}

async function schedule(
  app: FastifyInstance,
  cookie: string,
  base: string,
  id: string,
  publishAt: string,
): Promise<void> {
  const res = await postJson(app, cookie, `${base}/${id}/schedule`, {
    publishAt,
  });
  assert.equal(res.statusCode, 200, `schedule failed: ${res.body}`);
  const status = res.json<{ data: { status: string } }>().data.status;
  assert.equal(status, 'scheduled');
}

function get(
  app: FastifyInstance,
  url: string,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  return app
    .inject({ method: 'GET', url })
    .then((res) => ({
      statusCode: res.statusCode,
      body: res.body,
      json: <T>() => res.json<T>(),
    }));
}

async function ensureRoles(): Promise<void> {
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });

  for (const name of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }
}

describe(
  'scheduled publication e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      await ensureRoles();
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'ADMIN' },
      });
      const passwordHash = await hashPassword(PASSWORD);

      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'Scheduler',
          lastName: 'Admin',
          active: true,
        },
      });
      userIds.push(admin.id);

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });
    });

    after(async () => {
      await prisma.redirect.deleteMany({ where: { entityId: { in: pageIds } } });
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.ministry.deleteMany({ where: { id: { in: ministryIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({
        where: { user: { email: ADMIN_EMAIL } },
      });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('publishes due content, leaves future schedules alone and exposes it publicly', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const realNow = Date.now();
        // Synthetic clock: schedule instants stay comfortably in the real
        // future (the API validates them against `Date.now()`), while the sweep
        // runs at a synthetic instant between the near and far schedules.
        const nearFuture = new Date(realNow + 60_000);
        const farFuture = new Date(realNow + 3_600_000);
        const sweepAt = new Date(realNow + 120_000);

        const sermonNear = await createRecord(
          app,
          cookie,
          '/api/v1/admin/sermons',
          {
            title: `Scheduler near sermon ${RUN}`,
            slug: `scheduler-near-sermon-${RUN}`,
            sermonDate: '2026-07-01',
          },
          sermonIds,
        );
        await schedule(
          app,
          cookie,
          '/api/v1/admin/sermons',
          String(sermonNear.id),
          nearFuture.toISOString(),
        );

        const sermonFar = await createRecord(
          app,
          cookie,
          '/api/v1/admin/sermons',
          {
            title: `Scheduler far sermon ${RUN}`,
            slug: `scheduler-far-sermon-${RUN}`,
            sermonDate: '2026-07-02',
          },
          sermonIds,
        );
        await schedule(
          app,
          cookie,
          '/api/v1/admin/sermons',
          String(sermonFar.id),
          farFuture.toISOString(),
        );

        const event = await createRecord(
          app,
          cookie,
          '/api/v1/admin/events',
          {
            title: `Scheduler event ${RUN}`,
            slug: `scheduler-event-${RUN}`,
            startAt: '2035-07-01T10:00:00.000Z',
          },
          eventIds,
        );
        await schedule(
          app,
          cookie,
          '/api/v1/admin/events',
          String(event.id),
          nearFuture.toISOString(),
        );

        const ministry = await createRecord(
          app,
          cookie,
          '/api/v1/admin/ministries',
          {
            name: `Scheduler ministry ${RUN}`,
            slug: `scheduler-ministry-${RUN}`,
          },
          ministryIds,
        );
        await schedule(
          app,
          cookie,
          '/api/v1/admin/ministries',
          String(ministry.id),
          nearFuture.toISOString(),
        );

        // Pages have no schedule endpoint; scheduling is a documented lifecycle
        // state, so seat the row directly the same way another phase would.
        const page = await createRecord(
          app,
          cookie,
          '/api/v1/admin/pages',
          {
            title: `Scheduler page ${RUN}`,
            slug: `scheduler-page-${RUN}`,
            excerpt: 'Página programada.',
          },
          pageIds,
        );
        await prisma.page.update({
          where: { id: String(page.id) },
          data: { status: 'scheduled', publishAt: nearFuture },
        });

        // Before the sweep nothing is public.
        const publicSermonBefore = await get(
          app,
          `/api/v1/sermons/scheduler-near-sermon-${RUN}`,
        );
        assert.equal(publicSermonBefore.statusCode, 404);

        const summary = await runDuePublishing(sweepAt);
        const byDomain = new Map(
          summary.results.map((result) => [result.domain, result]),
        );
        for (const domain of ['sermons', 'events', 'ministries', 'pages']) {
          const result = byDomain.get(domain);
          assert.ok(result, `missing domain ${domain}`);
          assert.equal(result.ok, true, `${domain} sweep failed`);
          assert.ok(result.published >= 1, `${domain} published nothing`);
        }

        const nearRow = await prisma.sermon.findUniqueOrThrow({
          where: { id: String(sermonNear.id) },
        });
        assert.equal(nearRow.status, 'published');
        assert.equal(nearRow.publishAt, null);
        assert.equal(nearRow.publishedAt?.toISOString(), sweepAt.toISOString());

        const farRow = await prisma.sermon.findUniqueOrThrow({
          where: { id: String(sermonFar.id) },
        });
        assert.equal(farRow.status, 'scheduled', 'future content must not publish');
        assert.equal(farRow.publishAt?.toISOString(), farFuture.toISOString());
        assert.equal(farRow.publishedAt, null);

        // Every due collection is now reachable through the public API.
        const publicSermon = await get(
          app,
          `/api/v1/sermons/scheduler-near-sermon-${RUN}`,
        );
        assert.equal(publicSermon.statusCode, 200, publicSermon.body);
        assert.equal(
          publicSermon.json<{ data: { slug: string } }>().data.slug,
          `scheduler-near-sermon-${RUN}`,
        );

        const publicFutureSermon = await get(
          app,
          `/api/v1/sermons/scheduler-far-sermon-${RUN}`,
        );
        assert.equal(publicFutureSermon.statusCode, 404);

        const publicEvent = await get(
          app,
          `/api/v1/events/scheduler-event-${RUN}`,
        );
        assert.equal(publicEvent.statusCode, 200, publicEvent.body);

        const publicMinistry = await get(
          app,
          `/api/v1/ministries/scheduler-ministry-${RUN}`,
        );
        assert.equal(publicMinistry.statusCode, 200, publicMinistry.body);

        const publicPage = await get(
          app,
          `/api/v1/pages/scheduler-page-${RUN}`,
        );
        assert.equal(publicPage.statusCode, 200, publicPage.body);
      } finally {
        await app.close();
      }
    });

    test('buildServer starts no scheduler timer', async () => {
      const app = makeApp({ SCHEDULER_INTERVAL_MS: '5' });
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const sermon = await createRecord(
          app,
          cookie,
          '/api/v1/admin/sermons',
          {
            title: `Scheduler no-timer ${RUN}`,
            slug: `scheduler-no-timer-${RUN}`,
          },
          sermonIds,
        );

        // Make the row due immediately. If buildServer started a 5ms
        // scheduler, the next sweep would flip it to published.
        await prisma.sermon.update({
          where: { id: String(sermon.id) },
          data: {
            status: 'scheduled',
            publishAt: new Date(Date.now() - 1_000),
          },
        });

        const health = await get(app, '/api/v1/health');
        assert.equal(health.statusCode, 200);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const row = await prisma.sermon.findUniqueOrThrow({
          where: { id: String(sermon.id) },
        });
        assert.equal(row.status, 'scheduled');
      } finally {
        await app.close();
      }
    });
  },
);
