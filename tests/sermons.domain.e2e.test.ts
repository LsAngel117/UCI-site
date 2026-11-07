/**
 * Sermon domain end-to-end regression suite (Phase 5A, docs/05 §8–10,
 * docs/08 §11.3–11.4, docs/11 §9).
 *
 * Covers the model enrichment that Phase 5A adds on top of the Phase 3
 * editorial workflow: preacher (Person), series, topics, cover media with a
 * `MediaReference`, external video/audio, notes, duration, featured and SEO —
 * plus the Person/Series/Topic admin endpoints.
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
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];
let EDITOR_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
  ({ EDITOR_PERMISSIONS } = await import('@server/auth/permissions'));
}

const ADMIN_EMAIL = 'sermons-admin-e2e@uci.local';
const EDITOR_EMAIL = 'sermons-editor-e2e@uci.local';
const PASSWORD = 'Sermons-E2e-Passw0rd!';
const BASE = '/api/v1/admin/sermons';
const PEOPLE = '/api/v1/admin/people';
const SERIES = '/api/v1/admin/series';
const TOPICS = '/api/v1/admin/topics';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];
const mediaAssetIds: string[] = [];
const sermonIds: string[] = [];
const personIds: string[] = [];
const seriesIds: string[] = [];
const topicIds: string[] = [];

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

function authed(
  cookie: string,
  extra: { payload?: Record<string, unknown> } = {},
): { headers: { cookie: string }; payload?: Record<string, unknown> } {
  return { headers: { cookie }, ...extra };
}

async function postJson(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const res = await app.inject({ method: 'POST', url, ...authed(cookie, { payload }) });
  return {
    statusCode: res.statusCode,
    body: res.body,
    json: <T>() => res.json<T>(),
  };
}

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
  const data = res.json<{ data: Record<string, unknown> }>().data;
  sermonIds.push(String(data.id));
  return data;
}

/** Create a media asset row directly — the binary is irrelevant to this suite. */
async function createMediaAsset(actorId: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      type: 'IMAGE',
      filename: 'cover.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: `test/${randomUUID()}.png`,
      url: '/media/test.png',
      createdById: actorId,
    },
  });
  mediaAssetIds.push(asset.id);
  return asset.id;
}

async function createPerson(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, PEOPLE, payload);
  assert.equal(res.statusCode, 201, `person create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  personIds.push(String(data.id));
  return data;
}

async function createSeries(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, SERIES, payload);
  assert.equal(res.statusCode, 201, `series create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  seriesIds.push(String(data.id));
  return data;
}

async function createTopic(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, TOPICS, payload);
  assert.equal(res.statusCode, 201, `topic create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  topicIds.push(String(data.id));
  return data;
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
  for (const name of EDITOR_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: editor.id, permissionId: permission.id } },
      update: {},
      create: { roleId: editor.id, permissionId: permission.id },
    });
  }
}

describe(
  'sermons domain e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      await ensureRoles();
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
      const editorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'EDITOR' } });
      const passwordHash = await hashPassword(PASSWORD);

      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: { email: ADMIN_EMAIL, passwordHash, firstName: 'Sermons', lastName: 'Admin', active: true },
      });
      const editor = await prisma.user.upsert({
        where: { email: EDITOR_EMAIL },
        update: { passwordHash, active: true },
        create: { email: EDITOR_EMAIL, passwordHash, firstName: 'Sermons', lastName: 'Editor', active: true },
      });
      userIds.push(admin.id, editor.id);

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
      await prisma.seoMetadata.deleteMany({
        where: { entityType: 'sermon', entityId: { in: sermonIds } },
      });
      await prisma.mediaReference.deleteMany({
        where: {
          OR: [
            { entityId: { in: sermonIds } },
            { mediaAssetId: { in: mediaAssetIds } },
          ],
        },
      });
      await prisma.sermon.deleteMany({ where: { createdById: { in: userIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
      await prisma.sermonTopic.deleteMany({ where: { topicId: { in: topicIds } } });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
      await prisma.sermonSeries.deleteMany({ where: { id: { in: seriesIds } } });
      await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({
        where: { user: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } });
      await prisma.$disconnect();
    });

    test('create persists preacher/series/topics/cover/video/audio/notes/duration/featured/SEO', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

        const person = await createPerson(app, cookie, {
          firstName: 'Juan',
          lastName: 'Pérez',
          role: 'Pastor',
        });
        const series = await createSeries(app, cookie, {
          name: 'Romanos',
          startDate: '2026-01-05',
        });
        const faith = await createTopic(app, cookie, { name: 'Fe' });
        const prayer = await createTopic(app, cookie, { name: 'Oración' });
        const coverId = await createMediaAsset(admin.id);

        const created = await createSermon(app, cookie, {
          title: 'La fe que obra',
          preacherId: person.id,
          seriesId: series.id,
          topicIds: [faith.id, prayer.id],
          coverMediaId: coverId,
          videoProvider: 'YOUTUBE',
          videoExternalId: 'abcdefghijk',
          videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          audioUrl: 'https://cdn.example.org/sermon.mp3',
          notesContent: 'Notas del mensaje.',
          durationMinutes: 42,
          featured: true,
          seo: {
            title: 'La fe que obra | UCI',
            description: 'Un mensaje sobre la fe.',
            canonicalUrl: 'https://uci.example.org/sermones/la-fe-que-obra',
            ogImageUrl: 'https://uci.example.org/og/fe.jpg',
          },
        });

        assert.equal(created.preacherId, person.id);
        assert.equal((created.preacher as Record<string, unknown>).displayName, 'Juan Pérez');
        assert.equal(created.seriesId, series.id);
        assert.equal((created.series as Record<string, unknown>).slug, 'romanos');
        assert.deepEqual(
          (created.topics as Array<{ name: string }>).map((topic) => topic.name).sort(),
          ['Fe', 'Oración'],
        );
        assert.equal(created.coverMediaId, coverId);
        assert.equal(created.videoProvider, 'YOUTUBE');
        assert.equal(created.videoExternalId, 'abcdefghijk');
        assert.equal(created.audioUrl, 'https://cdn.example.org/sermon.mp3');
        assert.equal(created.notesContent, 'Notas del mensaje.');
        assert.equal(created.durationMinutes, 42);
        assert.equal(created.featured, true);
        assert.equal((created.seo as Record<string, unknown>).title, 'La fe que obra | UCI');

        // A `MediaReference` (entityType 'sermon', purpose 'cover') must exist so
        // the Phase 4 reference-aware delete protects the asset.
        const reference = await prisma.mediaReference.findFirst({
          where: {
            mediaAssetId: coverId,
            entityType: 'sermon',
            entityId: String(created.id),
            purpose: 'cover',
          },
        });
        assert.ok(reference, 'a cover MediaReference must be registered');

        // GET returns the same enrichment.
        const fetched = await app.inject({
          method: 'GET',
          url: `${BASE}/${String(created.id)}`,
          ...authed(cookie),
        });
        assert.equal(fetched.statusCode, 200, fetched.body);
        const got = fetched.json<{ data: Record<string, unknown> }>().data;
        assert.equal((got.seo as Record<string, unknown>).canonicalUrl, 'https://uci.example.org/sermones/la-fe-que-obra');
        assert.equal((got.preacher as Record<string, unknown>).id, person.id);
        assert.equal(got.featured, true);

        // The cover is protected from a non-forced media delete.
        const blockedDelete = await app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/media/${coverId}`,
          ...authed(cookie),
        });
        assert.equal(blockedDelete.statusCode, 409, blockedDelete.body);
        assert.equal(
          blockedDelete.json<{ error: { code: string } }>().error.code,
          'MEDIA_REFERENCED',
        );
      } finally {
        await app.close();
      }
    });

    test('changing or clearing the cover rewrites the MediaReference', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const first = await createMediaAsset(admin.id);
        const second = await createMediaAsset(admin.id);

        const created = await createSermon(app, cookie, {
          title: 'Portada cambiante',
          coverMediaId: first,
        });
        const id = String(created.id);

        const patched = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, coverMediaId: second } }),
        });
        assert.equal(patched.statusCode, 200, patched.body);
        assert.equal(patched.json<{ data: { coverMediaId: string } }>().data.coverMediaId, second);

        const oldRef = await prisma.mediaReference.findFirst({
          where: { mediaAssetId: first, entityId: id, purpose: 'cover' },
        });
        const newRef = await prisma.mediaReference.findFirst({
          where: { mediaAssetId: second, entityId: id, purpose: 'cover' },
        });
        assert.equal(oldRef, null, 'the previous cover reference must be removed');
        assert.ok(newRef, 'the new cover reference must be registered');

        const cleared = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 2, coverMediaId: null } }),
        });
        assert.equal(cleared.statusCode, 200, cleared.body);
        assert.equal(cleared.json<{ data: { coverMediaId: null } }>().data.coverMediaId, null);
        assert.equal(
          await prisma.mediaReference.count({ where: { entityId: id, purpose: 'cover' } }),
          0,
          'clearing the cover removes every cover reference',
        );
      } finally {
        await app.close();
      }
    });

    test('unknown references are rejected with 400 and create nothing', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        // Scope the assertion to this suite's actor: the test suite may share a
        // database with other suites, so a global count is not stable.
        const before = await prisma.sermon.count({
          where: { createdById: admin.id },
        });
        const ghost = randomUUID();

        for (const payload of [
          { title: 'Bad preacher', preacherId: ghost },
          { title: 'Bad series', seriesId: ghost },
          { title: 'Bad topic', topicIds: [ghost] },
          { title: 'Bad cover', coverMediaId: ghost },
          { title: 'Bad notes', notesMediaId: ghost },
        ]) {
          const res = await app.inject({
            method: 'POST',
            url: BASE,
            ...authed(cookie, { payload }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }

        assert.equal(
          await prisma.sermon.count({ where: { createdById: admin.id } }),
          before,
          'no sermon row may be created',
        );
      } finally {
        await app.close();
      }
    });

    test('topicIds replaces the topic set on update', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const first = await createTopic(app, cookie, { name: 'Adoración' });
        const second = await createTopic(app, cookie, { name: 'Propósito' });
        const created = await createSermon(app, cookie, {
          title: 'Temas dinámicos',
          topicIds: [first.id],
        });

        const patched = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${String(created.id)}`,
          ...authed(cookie, { payload: { version: 1, topicIds: [second.id] } }),
        });
        assert.equal(patched.statusCode, 200, patched.body);
        const topics = patched.json<{ data: { topics: Array<{ id: string }> } }>().data.topics;
        assert.deepEqual(topics.map((topic) => topic.id), [second.id]);
      } finally {
        await app.close();
      }
    });

    test('taxonomy admin: create/list/update, slug rules and authz', async () => {
      const app = makeApp();
      try {
        const anonymous = await app.inject({ method: 'GET', url: PEOPLE });
        assert.equal(anonymous.statusCode, 401);

        const editorCookie = await login(app, EDITOR_EMAIL);
        const topic = await createTopic(app, editorCookie, { name: 'Familia' });
        assert.equal(topic.slug, 'familia');

        const renamed = await app.inject({
          method: 'PATCH',
          url: `${TOPICS}/${String(topic.id)}`,
          ...authed(editorCookie, { payload: { name: 'Familia cristiana' } }),
        });
        assert.equal(renamed.statusCode, 200, renamed.body);
        assert.equal(renamed.json<{ data: { name: string } }>().data.name, 'Familia cristiana');

        const adminCookie = await login(app, ADMIN_EMAIL);
        const list = await app.inject({
          method: 'GET',
          url: `${TOPICS}?search=familia`,
          ...authed(adminCookie),
        });
        assert.equal(list.statusCode, 200, list.body);
        const listed = list.json<{ data: Array<{ id: string }>; meta: { total: number } }>();
        assert.ok(listed.data.some((row) => row.id === topic.id));

        // A duplicate explicit slug is a 409, like sermons.
        await createTopic(app, adminCookie, { name: 'Obediencia', slug: 'slug-dup-topic' });
        const duplicate = await app.inject({
          method: 'POST',
          url: TOPICS,
          ...authed(adminCookie, { payload: { name: 'Otra', slug: 'slug-dup-topic' } }),
        });
        assert.equal(duplicate.statusCode, 409, duplicate.body);
        assert.equal(
          duplicate.json<{ error: { code: string } }>().error.code,
          'SLUG_TAKEN',
        );

        const series = await createSeries(app, adminCookie, { name: 'Salmos' });
        assert.equal(series.slug, 'salmos');
        const person = await createPerson(app, adminCookie, {
          firstName: 'Ana',
          lastName: 'Gómez',
        });
        assert.equal(person.displayName, 'Ana Gómez');
      } finally {
        await app.close();
      }
    });

    test('malformed seo is rejected with 400 and persists nothing', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const before = await prisma.sermon.count({
          where: { createdById: admin.id },
        });

        // A provided-but-not-an-object `seo` must be a 400 on create, never a
        // silently ignored field (the previous behaviour returned 201). An
        // explicit `null` is a no-op, matching the `SermonSeoInput | null` DTO.
        for (const seo of ['not-an-object', []]) {
          const res = await app.inject({
            method: 'POST',
            url: BASE,
            ...authed(cookie, { payload: { title: 'SEO inválido', seo } }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(seo)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        assert.equal(
          await prisma.sermon.count({ where: { createdById: admin.id } }),
          before,
          'a rejected seo must not create a sermon',
        );

        // And on update: nothing is written and the version is untouched.
        const created = await createSermon(app, cookie, { title: 'SEO update guard' });
        for (const seo of ['not-an-object', []]) {
          const res = await app.inject({
            method: 'PATCH',
            url: `${BASE}/${String(created.id)}`,
            ...authed(cookie, { payload: { version: 1, seo } }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(seo)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        const row = await prisma.sermon.findUniqueOrThrow({
          where: { id: String(created.id) },
        });
        assert.equal(row.version, 1, 'a rejected seo must not bump the version');
        assert.equal(
          await prisma.seoMetadata.count({
            where: { entityType: 'sermon', entityId: String(created.id) },
          }),
          0,
          'a rejected seo must not persist metadata',
        );

        // PRESERVE: a well-formed seo still upserts on update (unchanged path).
        const valid = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${String(created.id)}`,
          ...authed(cookie, {
            payload: {
              version: 1,
              seo: { title: 'SEO válido', canonicalUrl: 'https://uci.example.org/sermones/seo-guard' },
            },
          }),
        });
        assert.equal(valid.statusCode, 200, valid.body);
        assert.equal(
          (valid.json<{ data: { seo: { title: string } } }>().data.seo).title,
          'SEO válido',
        );
      } finally {
        await app.close();
      }
    });

    test('admin preacher filter finds a sermon linked by preacherId', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        // PRESERVE: the legacy denormalized preacherName filter still matches.
        const legacy = await createSermon(app, cookie, {
          title: 'Sermón del predicador legacy',
          preacherName: 'FiltroAdmin Legacy',
        });
        const legacyRes = await app.inject({
          method: 'GET',
          url: `${BASE}?preacher=FiltroAdmin%20Legacy`,
          ...authed(cookie),
        });
        assert.equal(legacyRes.statusCode, 200, legacyRes.body);
        assert.ok(
          legacyRes
            .json<{ data: Array<{ id: string }> }>()
            .data.map((r) => r.id)
            .includes(String(legacy.id)),
          'the denormalized preacherName still matches',
        );

        const person = await createPerson(app, cookie, {
          firstName: 'FiltroAdmin',
          lastName: 'Predicador Vinculado',
        });
        const linked = await createSermon(app, cookie, {
          title: 'Sermón del predicador vinculado',
          preacherId: person.id,
        });

        const byName = await app.inject({
          method: 'GET',
          url: `${BASE}?preacher=FiltroAdmin%20Predicador%20Vinculado`,
          ...authed(cookie),
        });
        assert.equal(byName.statusCode, 200, byName.body);
        const nameIds = byName
          .json<{ data: Array<{ id: string }> }>()
          .data.map((row) => row.id);
        assert.ok(
          nameIds.includes(String(linked.id)),
          'matched by the related Person.displayName',
        );

        const byId = await app.inject({
          method: 'GET',
          url: `${BASE}?preacher=${String(person.id)}`,
          ...authed(cookie),
        });
        assert.equal(byId.statusCode, 200, byId.body);
        const idIds = byId
          .json<{ data: Array<{ id: string }> }>()
          .data.map((row) => row.id);
        assert.ok(idIds.includes(String(linked.id)), 'matched by preacherId');
      } finally {
        await app.close();
      }
    });

    test('creating the same topic with different writing does not duplicate', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const first = await createTopic(app, cookie, { name: 'Dedup Tema Único' });
        const second = await createTopic(app, cookie, { name: 'dedup tema unico' });
        assert.equal(second.id, first.id, 'the existing topic is returned');
        assert.equal(second.slug, first.slug);
        assert.equal(
          await prisma.topic.count({ where: { slug: { startsWith: 'dedup-tema-unico' } } }),
          1,
          'no suffixed duplicate row is created',
        );

        const distinct = await createTopic(app, cookie, { name: 'Dedup Tema Distinto' });
        assert.notEqual(
          distinct.id,
          first.id,
          'legitimately distinct topics still create new rows',
        );
      } finally {
        await app.close();
      }
    });

    test('regression: an untouched sermon keeps the Phase 3 shape and new defaults', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createSermon(app, cookie, { title: 'Sermón mínimo' });
        assert.equal(created.status, 'draft');
        assert.equal(created.preacherId, null);
        assert.equal(created.preacher, null);
        assert.equal(created.seriesId, null);
        assert.deepEqual(created.topics, []);
        assert.equal(created.coverMediaId, null);
        assert.equal(created.featured, false);
        assert.equal(created.durationMinutes, null);
        assert.equal(created.seo, null);
      } finally {
        await app.close();
      }
    });

    test('an explicit non-draft status is rejected before any write', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const before = await prisma.sermon.count({
          where: { createdById: admin.id },
        });

        // create: a non-draft status is a 400 and persists nothing.
        for (const status of ['published', 'archived', 'scheduled', 'PUBLISHED']) {
          const res = await app.inject({
            method: 'POST',
            url: BASE,
            ...authed(cookie, { payload: { title: `Estado ${status}`, status } }),
          });
          assert.equal(res.statusCode, 400, `${status} -> ${res.body}`);
          const error = res.json<{ error: { code: string; message: string } }>().error;
          assert.equal(error.code, 'VALIDATION_ERROR');
          assert.match(error.message, /publish\/schedule\/archive/);
        }
        assert.equal(
          await prisma.sermon.count({ where: { createdById: admin.id } }),
          before,
          'a rejected status must not create a sermon',
        );

        // update: a non-draft status is a 400 and leaves the row unchanged.
        const created = await createSermon(app, cookie, { title: 'Status update guard' });
        const id = String(created.id);
        const rejected = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, status: 'archived' } }),
        });
        assert.equal(rejected.statusCode, 400, rejected.body);
        assert.equal(
          rejected.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
        const row = await prisma.sermon.findUniqueOrThrow({ where: { id } });
        assert.equal(row.status, 'draft', 'a rejected status must not change status');
        assert.equal(row.version, 1, 'a rejected status must not bump the version');

        // PRESERVE: 'draft' (any case) and an omitted status keep working.
        for (const status of ['draft', 'DRAFT']) {
          const ok = await app.inject({
            method: 'POST',
            url: BASE,
            ...authed(cookie, { payload: { title: `Estado ok ${status}`, status } }),
          });
          assert.equal(ok.statusCode, 201, ok.body);
          assert.equal(
            ok.json<{ data: { status: string } }>().data.status,
            'draft',
          );
        }
        const patchDraft = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'Editado', status: 'DRAFT' } }),
        });
        assert.equal(patchDraft.statusCode, 200, patchDraft.body);
        const patched = patchDraft.json<{ data: { status: string; title: string } }>().data;
        assert.equal(patched.status, 'draft');
        assert.equal(patched.title, 'Editado');
      } finally {
        await app.close();
      }
    });
  },
);
