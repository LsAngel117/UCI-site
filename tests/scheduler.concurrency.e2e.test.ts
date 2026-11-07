/**
 * Scheduled-publication concurrency regression suite (Phase 12B, docs/15 §18.6).
 *
 * Covers the lost-race path that an independent verification found:
 *   - a concurrent writer already created the next revision `(entityId,
 *     version)`, so the scheduler's checkpoint insert fails with Prisma P2002.
 *     `publishDueSermons` must skip that one row and keep promoting the rest of
 *     the batch instead of rejecting and leaving later rows `scheduled`;
 *   - the manual `POST /publish` path that hits the same P2002 must answer
 *     409 CONFLICT, not 500.
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
let publishDueSermons!: typeof import('@server/cms/sermons/service').publishDueSermons;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ publishDueSermons } = await import('@server/cms/sermons/service'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `scheduler-race-admin-${RUN}@uci.local`;
const PASSWORD = 'Scheduler-Race-Passw0rd!';
const BASE = '/api/v1/admin/sermons';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];
const sermonIds: string[] = [];

function makeApp(): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
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

async function ensureRoles(): Promise<void> {
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'Scheduler race admin role' },
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
  'scheduled publication concurrency (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    let adminId = '';

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
          lastName: 'Race',
          active: true,
        },
      });
      adminId = admin.id;
      userIds.push(admin.id);
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });
    });

    after(async () => {
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { user: { email: ADMIN_EMAIL } } });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('a version-race P2002 skips one row without aborting the batch', async () => {
      const now = new Date('2036-01-01T00:00:00.000Z');
      // The raced row is due first, so the sweep reaches it before the rest.
      const racerPublishAt = new Date(now.getTime() - 120_000);
      const publishAt = new Date(now.getTime() - 60_000);

      // Three due rows; the first already has its next revision because a
      // concurrent writer won the race before the sweep reached it.
      const racer = await prisma.sermon.create({
        data: {
          title: `Scheduler racer ${RUN}`,
          slug: `scheduler-racer-${RUN}`,
          status: 'scheduled',
          version: 1,
          publishAt: racerPublishAt,
          createdById: adminId,
          updatedById: adminId,
        },
      });
      const followedBy = await prisma.sermon.createManyAndReturn({
        data: [
          {
            title: `Scheduler after racer A ${RUN}`,
            slug: `scheduler-after-racer-a-${RUN}`,
            status: 'scheduled',
            version: 1,
            publishAt,
            createdById: adminId,
            updatedById: adminId,
          },
          {
            title: `Scheduler after racer B ${RUN}`,
            slug: `scheduler-after-racer-b-${RUN}`,
            status: 'scheduled',
            version: 1,
            publishAt,
            createdById: adminId,
            updatedById: adminId,
          },
        ],
      });
      sermonIds.push(racer.id, ...followedBy.map((row) => row.id));

      await prisma.sermonRevision.create({
        data: {
          sermonId: racer.id,
          version: 2,
          title: racer.title,
          snapshot: { title: racer.title, slug: racer.slug },
          createdById: adminId,
        },
      });

      // Before the fix this rejected with a raw P2002 and left the other two
      // rows `scheduled`; now it resolves and keeps going.
      const published = await publishDueSermons(now);
      const publishedIds = new Set(published.map((row) => row.id));

      assert.equal(
        publishedIds.has(racer.id),
        false,
        'the raced row must be skipped, not published twice',
      );
      for (const row of followedBy) {
        assert.equal(
          publishedIds.has(row.id),
          true,
          `row ${row.id} must still be promoted after the skipped one`,
        );
      }

      const reloadedRacer = await prisma.sermon.findUniqueOrThrow({
        where: { id: racer.id },
      });
      assert.equal(reloadedRacer.status, 'scheduled');
      assert.equal(reloadedRacer.version, 1);

      const reloadedFollowed = await prisma.sermon.findMany({
        where: { id: { in: followedBy.map((row) => row.id) } },
        orderBy: { id: 'asc' },
      });
      assert.equal(reloadedFollowed.length, 2);
      for (const row of reloadedFollowed) {
        assert.equal(row.status, 'published');
        assert.equal(row.publishAt, null);
        assert.equal(row.version, 2);
        assert.ok(row.publishedAt, 'publishedAt is set by the sweep');
      }
    });

    test('manual publish that loses the version race answers 409, not 500', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const create = await app.inject({
          method: 'POST',
          url: BASE,
          headers: { cookie },
          payload: {
            title: `Manual race ${RUN}`,
            slug: `manual-race-${RUN}`,
          },
        });
        assert.equal(create.statusCode, 201, create.body);
        const id = create.json<{ data: { id: string } }>().data.id;
        sermonIds.push(id);

        // Simulate the concurrent writer that already checkpointed version 2.
        await prisma.sermonRevision.create({
          data: {
            sermonId: id,
            version: 2,
            title: `Manual race ${RUN}`,
            snapshot: { title: `Manual race ${RUN}`, slug: `manual-race-${RUN}` },
            createdById: adminId,
          },
        });

        const publish = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/publish`,
          headers: { cookie },
        });
        assert.equal(publish.statusCode, 409, publish.body);
        assert.equal(
          publish.json<{ error: { code: string } }>().error.code,
          'CONFLICT',
        );

        const reloaded = await prisma.sermon.findUniqueOrThrow({ where: { id } });
        assert.equal(reloaded.status, 'draft');
        assert.equal(reloaded.version, 1);
      } finally {
        await app.close();
      }
    });
  },
);
