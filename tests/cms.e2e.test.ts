/**
 * CMS end-to-end regression suite (Phase 3, docs/08 §11.3–11.9, §22–24, §38).
 *
 * Exercises the real Fastify app through `app.inject()` (no port binding) plus
 * a real PostgreSQL database. The suite is skipped entirely when `DATABASE_URL`
 * is not provided, so `pnpm test` stays green on a machine without a database.
 *
 * Two test principals are used: an ADMIN (full vocabulary) and an EDITOR (the
 * baseline grant, which deliberately lacks publish/archive). Each test builds
 * its own app instance so the login rate limiter always starts from zero. The
 * users and every row they create are removed in teardown.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PermissionName } from '@shared/api';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let PublishDue!: typeof import('@server/cms/sermons/service').publishDueSermons;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];
let EDITOR_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ publishDueSermons: PublishDue } = await import('@server/cms/sermons/service'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
  ({ EDITOR_PERMISSIONS } = await import('@server/auth/permissions'));
}

const ADMIN_EMAIL = 'cms-admin-e2e@uci.local';
const EDITOR_EMAIL = 'cms-editor-e2e@uci.local';
const PASSWORD = 'Cms-E2e-Passw0rd!';
const BASE = '/api/v1/admin/sermons';
const LOGIN_URL = '/api/v1/auth/login';

let adminId = '';
let editorId = '';
const testUserIds: string[] = [];

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

/** Inject options with the session cookie attached (payload is optional). */
function authed(
  cookie: string,
  extra: { payload?: Record<string, unknown> } = {},
): { headers: { cookie: string }; payload?: Record<string, unknown> } {
  return { headers: { cookie }, ...extra };
}

/** Create a draft sermon and return its `data` payload. */
async function createSermon(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: BASE,
    ...authed(cookie, { payload }),
  });
  assert.equal(res.statusCode, 201, `create failed: ${res.body}`);
  return res.json<{ data: Record<string, unknown> }>().data;
}

async function ensureRoles(): Promise<void> {
  const admin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });
  const editor = await prisma.role.upsert({
    where: { name: 'EDITOR' },
    update: {},
    create: { name: 'EDITOR', description: 'E2E editor role' },
  });
  void editor;

  for (const name of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }
}

describe(
  'cms e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      await ensureRoles();
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
      const editorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'EDITOR' } });

      // The EDITOR's baseline permissions must exist to be granted.
      for (const name of EDITOR_PERMISSIONS) {
        await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
      }
      const editorPermissions = await prisma.permission.findMany({
        where: { name: { in: [...EDITOR_PERMISSIONS] } },
      });
      for (const permission of editorPermissions) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: editorRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: editorRole.id, permissionId: permission.id },
        });
      }

      const passwordHash = await hashPassword(PASSWORD);
      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: { email: ADMIN_EMAIL, passwordHash, firstName: 'CMS', lastName: 'Admin', active: true },
      });
      const editor = await prisma.user.upsert({
        where: { email: EDITOR_EMAIL },
        update: { passwordHash, active: true },
        create: { email: EDITOR_EMAIL, passwordHash, firstName: 'CMS', lastName: 'Editor', active: true },
      });
      adminId = admin.id;
      editorId = editor.id;
      testUserIds.push(admin.id, editor.id);

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: editor.id, roleId: editorRole.id } },
        update: {},
        create: { userId: editor.id, roleId: editorRole.id },
      });
    });

    after(async () => {
      await prisma.sermon.deleteMany({ where: { createdById: { in: testUserIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: testUserIds } } });
      await prisma.session.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } } });
      await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } });
      await prisma.$disconnect();
    });

    test('full editorial workflow: create → update → publish → revisions → restore', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const created = await createSermon(app, cookie, { title: 'Obediencia y fe' });
        assert.equal(created.status, 'draft');
        assert.equal(created.version, 1);
        assert.equal(created.publishedAt, null);
        assert.equal(
          created.slug,
          'obediencia-y-fe',
          'slug is generated from the title',
        );
        const id = created.id as string;

        const updated = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, {
            payload: { version: 1, description: 'Un mensaje sobre la fe.', scriptureReference: 'Juan 14:15' },
          }),
        });
        assert.equal(updated.statusCode, 200, updated.body);
        assert.equal(updated.json<{ data: { version: number } }>().data.version, 2);

        const published = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/publish`,
          ...authed(cookie),
        });
        assert.equal(published.statusCode, 200, published.body);
        const publishedData = published.json<{ data: { status: string; publishedAt: string | null; version: number } }>().data;
        assert.equal(publishedData.status, 'published');
        assert.ok(publishedData.publishedAt, 'publishedAt must be set on publish');

        const revisions = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}/revisions`,
          ...authed(cookie),
        });
        assert.equal(revisions.statusCode, 200, revisions.body);
        const revisionList = revisions.json<{ data: Array<{ id: string; version: number; snapshot: { description: string | null } }> }>().data;
        assert.ok(revisionList.length >= 1, 'publishing must checkpoint a revision');
        const target = revisionList[0]!;
        assert.equal(target.snapshot.description, 'Un mensaje sobre la fe.');

        const restored = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/revisions/${target.id}/restore`,
          ...authed(cookie),
        });
        assert.equal(restored.statusCode, 200, restored.body);
        const restoredData = restored.json<{ data: { version: number; description: string | null } }>().data;
        assert.equal(restoredData.description, 'Un mensaje sobre la fe.');
        assert.ok(restoredData.version > (publishedData.version), 'restore advances the version');

        const afterRestore = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}/revisions`,
          ...authed(cookie),
        });
        const afterList = afterRestore.json<{ data: unknown[] }>().data;
        assert.equal(afterList.length, revisionList.length + 1, 'restore appends, never deletes');

        const single = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}/revisions/${target.id}`,
          ...authed(cookie),
        });
        assert.equal(single.statusCode, 200, single.body);
        assert.equal(single.json<{ data: { id: string } }>().data.id, target.id);
      } finally {
        await app.close();
      }
    });

    test('a stale version yields 409 CONFLICT and the newer data is preserved', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createSermon(app, cookie, { title: 'Concurrency test' });
        const id = created.id as string;

        const first = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'Primera edición' } }),
        });
        assert.equal(first.statusCode, 200, first.body);

        const stale = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'Edición obsoleta' } }),
        });
        assert.equal(stale.statusCode, 409, stale.body);
        assert.equal(stale.json<{ error: { code: string } }>().error.code, 'CONFLICT');

        const current = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}`,
          ...authed(cookie),
        });
        assert.equal(
          current.json<{ data: { title: string } }>().data.title,
          'Primera edición',
          'the stale write must not have overwritten the newer title',
        );
      } finally {
        await app.close();
      }
    });

    test('PATCH never changes lifecycle state (docs/08 §22)', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createSermon(app, cookie, { title: 'No publish via patch' });
        const id = created.id as string;

        const patch = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'Editado', status: 'published' } }),
        });
        assert.equal(patch.statusCode, 200, patch.body);
        const data = patch.json<{ data: { status: string; publishedAt: string | null } }>().data;
        assert.equal(data.status, 'draft', 'PATCH must not publish');
        assert.equal(data.publishedAt, null, 'PATCH must not set publishedAt');
      } finally {
        await app.close();
      }
    });

    test('a duplicate explicit slug yields 409 SLUG_TAKEN', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        await createSermon(app, cookie, { title: 'Original', slug: 'slug-e2e-dup' });

        const duplicate = await app.inject({
          method: 'POST',
          url: BASE,
          ...authed(cookie, {
            payload: { title: 'Duplicado', slug: 'slug-e2e-dup' },
          }),
        });
        assert.equal(duplicate.statusCode, 409, duplicate.body);
        assert.equal(
          duplicate.json<{ error: { code: string } }>().error.code,
          'SLUG_TAKEN',
        );
      } finally {
        await app.close();
      }
    });

    test('an EDITOR can create/update/read but gets 403 on publish', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, EDITOR_EMAIL);

        const created = await createSermon(app, cookie, { title: 'Editor draft' });
        const id = created.id as string;

        const update = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'Editor edited' } }),
        });
        assert.equal(update.statusCode, 200, update.body);

        const list = await app.inject({
          method: 'GET',
          url: BASE,
          ...authed(cookie),
        });
        assert.equal(list.statusCode, 200, list.body);

        const publish = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/publish`,
          ...authed(cookie),
        });
        assert.equal(publish.statusCode, 403, publish.body);
        assert.equal(publish.json<{ error: { code: string } }>().error.code, 'FORBIDDEN');
      } finally {
        await app.close();
      }
    });

    test('preview requires auth, is noindex and works for an unpublished draft', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createSermon(app, cookie, { title: 'Preview me' });
        const id = created.id as string;

        const anonymous = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}/preview`,
        });
        assert.equal(anonymous.statusCode, 401, anonymous.body);

        const preview = await app.inject({
          method: 'GET',
          url: `${BASE}/${id}/preview`,
          ...authed(cookie),
        });
        assert.equal(preview.statusCode, 200, preview.body);
        assert.match(
          String(preview.headers['x-robots-tag']),
          /noindex.*nofollow.*noarchive/i,
        );
        assert.equal(
          preview.json<{ data: { status: string; title: string } }>().data.status,
          'draft',
          'preview shows unpublished content to an authorised user',
        );
      } finally {
        await app.close();
      }
    });

    test('schedule sets scheduled status and rejects a past instant', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createSermon(app, cookie, { title: 'Scheduled sermon' });
        const id = created.id as string;

        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const scheduled = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/schedule`,
          ...authed(cookie, { payload: { publishAt: future } }),
        });
        assert.equal(scheduled.statusCode, 200, scheduled.body);
        const scheduledData = scheduled.json<{ data: { status: string; publishAt: string | null } }>().data;
        assert.equal(scheduledData.status, 'scheduled');
        assert.ok(scheduledData.publishAt, 'publishAt must be stored');

        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const rejected = await app.inject({
          method: 'POST',
          url: `${BASE}/${id}/schedule`,
          ...authed(cookie, { payload: { publishAt: past } }),
        });
        assert.equal(rejected.statusCode, 400, rejected.body);
      } finally {
        await app.close();
      }
    });

    test('publishDueSermons promotes scheduled content whose publishAt has passed', async () => {
      const sermon = await prisma.sermon.create({
        data: {
          title: 'Due sermon',
          slug: `due-sermon-${Date.now()}`,
          status: 'scheduled',
          publishAt: new Date(Date.now() - 60 * 1000),
          createdById: adminId,
          updatedById: adminId,
        },
      });
      const published = await PublishDue(new Date());
      assert.ok(
        published.some((row) => row.id === sermon.id),
        'the due sermon must be published',
      );
      const reloaded = await prisma.sermon.findUniqueOrThrow({ where: { id: sermon.id } });
      assert.equal(reloaded.status, 'published');
      assert.ok(reloaded.publishedAt, 'publishedAt is set by the scheduler');
    });
  },
);
