/**
 * Public Sermons API end-to-end regression suite (Phase 5B, docs/08 §11.1–11.2,
 * docs/10 §5–6, docs/11 §14).
 *
 * The public API is unauthenticated and must expose *only* published sermons.
 * This suite proves the visibility boundary (draft/scheduled/archived never
 * leak), the documented filters/order, related sermons, and the public SEO +
 * VideoObject data. Every row created by the suite is removed in teardown.
 *
 * Skipped when `DATABASE_URL` is absent, like the other e2e suites.
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

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const ADMIN_EMAIL = 'sermons-public-admin-e2e@uci.local';
const PASSWORD = 'Sermons-Public-E2e-Passw0rd!';
const ADMIN_SERMONS = '/api/v1/admin/sermons';
const PUBLIC_SERMONS = '/api/v1/sermons';
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

type JsonEnvelope = { data: Record<string, unknown> };

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

async function createSermon(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, ADMIN_SERMONS, payload);
  assert.equal(res.statusCode, 201, `create failed: ${res.body}`);
  const data = res.json<JsonEnvelope>().data;
  sermonIds.push(String(data.id));
  return data;
}

async function publish(
  app: FastifyInstance,
  cookie: string,
  id: string,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, `${ADMIN_SERMONS}/${id}/publish`, {});
  assert.equal(res.statusCode, 200, `publish failed: ${res.body}`);
  return res.json<JsonEnvelope>().data;
}

async function archive(
  app: FastifyInstance,
  cookie: string,
  id: string,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, `${ADMIN_SERMONS}/${id}/archive`, {});
  assert.equal(res.statusCode, 200, `archive failed: ${res.body}`);
  return res.json<JsonEnvelope>().data;
}

async function schedule(
  app: FastifyInstance,
  cookie: string,
  id: string,
  publishAt: string,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, `${ADMIN_SERMONS}/${id}/schedule`, {
    publishAt,
  });
  assert.equal(res.statusCode, 200, `schedule failed: ${res.body}`);
  return res.json<JsonEnvelope>().data;
}

async function createPerson(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, PEOPLE, payload);
  assert.equal(res.statusCode, 201, `person create failed: ${res.body}`);
  const data = res.json<JsonEnvelope>().data;
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
  const data = res.json<JsonEnvelope>().data;
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
  const data = res.json<JsonEnvelope>().data;
  topicIds.push(String(data.id));
  return data;
}

/** Create a media asset row directly — the binary is irrelevant to this suite. */
async function createMediaAsset(actorId: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      type: 'IMAGE',
      filename: 'sermon-cover.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: `test/${randomUUID()}.png`,
      url: '/media/test-sermon-cover.png',
      createdById: actorId,
    },
  });
  mediaAssetIds.push(asset.id);
  return asset.id;
}

function getPublic(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  return app
    .inject({
      method: 'GET',
      url,
      ...(cookie ? { headers: { cookie } } : {}),
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: res.body,
      json: <T>() => res.json<T>(),
    }));
}

function publicErrorCode(body: string): string {
  return JSON.parse(body).error.code as string;
}

async function ensureRoles(): Promise<void> {
  const admin = await prisma.role.upsert({
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
      where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }
}

describe(
  'public sermons API e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      await ensureRoles();
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
      const passwordHash = await hashPassword(PASSWORD);

      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'Public',
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
        where: { user: { email: ADMIN_EMAIL } },
      });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('lists only published sermons without authentication and 404s drafts', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const draft = await createSermon(app, cookie, {
          title: 'PúblicoE2E Borrador Oculto',
          slug: 'public-e2e-draft',
          description: 'No debe salir nunca.',
        });
        const published = await createSermon(app, cookie, {
          title: 'PúblicoE2E Sermón Visible',
          slug: 'public-e2e-published',
          description: 'Un mensaje publicado.',
          preacherName: 'Predicador Legacy',
          sermonDate: '2026-03-15',
        });
        await publish(app, cookie, String(published.id));

        const list = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2E&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        const payload = list.json<{
          data: Array<Record<string, unknown>>;
          meta: { page: number; limit: number; total: number; totalPages: number };
        }>();
        assert.ok(Array.isArray(payload.data));
        assert.equal(payload.meta.total, 1, 'meta must count only published matches');
        const slugs = payload.data.map((sermon) => String(sermon.slug));
        assert.ok(slugs.includes('public-e2e-published'));
        assert.ok(!slugs.includes('public-e2e-draft'));

        const [item] = payload.data.filter(
          (sermon) => sermon.slug === 'public-e2e-published',
        );
        assert.ok(item);
        // Only public fields: no internal author/version/lifecycle columns.
        assert.equal('createdById' in item, false);
        assert.equal('updatedById' in item, false);
        assert.equal('version' in item, false);
        assert.equal('status' in item, false);

        const draftBySlug = await getPublic(app, `${PUBLIC_SERMONS}/public-e2e-draft`);
        assert.equal(draftBySlug.statusCode, 404, draftBySlug.body);
        assert.equal(publicErrorCode(draftBySlug.body), 'NOT_FOUND');

        const unknown = await getPublic(app, `${PUBLIC_SERMONS}/public-e2e-no-existe`);
        assert.equal(unknown.statusCode, 404, unknown.body);
        assert.equal(publicErrorCode(unknown.body), 'NOT_FOUND');

        const detail = await getPublic(app, `${PUBLIC_SERMONS}/public-e2e-published`);
        assert.equal(detail.statusCode, 200, detail.body);
        assert.equal(
          detail.json<JsonEnvelope>().data.title,
          'PúblicoE2E Sermón Visible',
        );

        // Logged-in requests get the same public view (no admin fields leak).
        const authedList = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2E&limit=100`,
          cookie,
        );
        assert.equal(authedList.statusCode, 200, authedList.body);
        assert.equal('status' in (authedList.json<{ data: Array<Record<string, unknown>> }>().data[0] ?? {}), false);

        // A tampered status filter cannot pull drafts in.
        const tampered = await getPublic(
          app,
          `${PUBLIC_SERMONS}?status=draft&limit=100`,
        );
        assert.equal(tampered.statusCode, 200, tampered.body);
        const tamperedSlugs = tampered
          .json<{ data: Array<{ slug: string }> }>()
          .data.map((sermon) => sermon.slug);
        assert.ok(!tamperedSlugs.includes('public-e2e-draft'));
        void draft;
      } finally {
        await app.close();
      }
    });

    test('detail exposes SEO, VideoObject data and related sermons', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const person = await createPerson(app, cookie, {
          firstName: 'Public',
          lastName: 'E2E Predicador',
          role: 'Pastor',
        });
        const series = await createSeries(app, cookie, { name: 'Public E2E Romanos' });
        const faith = await createTopic(app, cookie, { name: 'Public E2E Fe' });
        const prayer = await createTopic(app, cookie, { name: 'Public E2E Oración' });
        const coverId = await createMediaAsset(admin.id);

        const main = await createSermon(app, cookie, {
          title: 'PúblicoE2E La fe que obra',
          slug: 'public-e2e-main',
          description: 'Un mensaje sobre la fe.',
          preacherId: person.id,
          seriesId: series.id,
          topicIds: [faith.id, prayer.id],
          coverMediaId: coverId,
          videoProvider: 'YOUTUBE',
          videoExternalId: 'abcdefghijk',
          videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          audioUrl: 'https://cdn.example.org/sermon.mp3',
          notesContent: 'Notas públicas del mensaje.',
          durationMinutes: 42,
          featured: true,
          sermonDate: '2026-04-12',
          seo: {
            title: 'La fe que obra | Iglesia UCI',
            description: 'Un mensaje sobre la fe que obra.',
            canonicalUrl: 'https://uci.example.org/sermones/public-e2e-main',
            ogImageUrl: 'https://uci.example.org/og/fe.jpg',
          },
        });
        await publish(app, cookie, String(main.id));

        const sameSeries = await createSermon(app, cookie, {
          title: 'PúblicoE2E Misma serie',
          slug: 'public-e2e-related-series',
          seriesId: series.id,
          sermonDate: '2026-04-05',
        });
        await publish(app, cookie, String(sameSeries.id));

        const sameTopic = await createSermon(app, cookie, {
          title: 'PúblicoE2E Mismo tema',
          slug: 'public-e2e-related-topic',
          topicIds: [faith.id],
          sermonDate: '2026-03-29',
        });
        await publish(app, cookie, String(sameTopic.id));

        const draftRelated = await createSermon(app, cookie, {
          title: 'PúblicoE2E Relacionado borrador',
          slug: 'public-e2e-related-draft',
          seriesId: series.id,
          topicIds: [faith.id],
        });

        const res = await getPublic(app, `${PUBLIC_SERMONS}/public-e2e-main`);
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<JsonEnvelope>().data;

        const seo = data.seo as Record<string, unknown>;
        assert.equal(seo.title, 'La fe que obra | Iglesia UCI');
        assert.equal(seo.description, 'Un mensaje sobre la fe que obra.');
        assert.equal(
          seo.canonicalUrl,
          'https://uci.example.org/sermones/public-e2e-main',
        );
        assert.equal(seo.ogImageUrl, 'https://uci.example.org/og/fe.jpg');

        const video = data.video as Record<string, unknown>;
        assert.equal(video.provider, 'YOUTUBE');
        assert.equal(video.externalId, 'abcdefghijk');
        assert.equal(video.url, 'https://www.youtube.com/watch?v=abcdefghijk');

        assert.equal(data.audioUrl, 'https://cdn.example.org/sermon.mp3');
        assert.equal(data.notesContent, 'Notas públicas del mensaje.');
        assert.equal(data.durationMinutes, 42);
        assert.equal(data.featured, true);
        assert.ok(String(data.coverImageUrl).startsWith('/media/'));

        const preacher = data.preacher as Record<string, unknown>;
        assert.equal(preacher.id, person.id);
        assert.equal(preacher.displayName, 'Public E2E Predicador');
        assert.equal((data.series as Record<string, unknown>).slug, 'public-e2e-romanos');
        assert.deepEqual(
          (data.topics as Array<{ name: string }>).map((topic) => topic.name).sort(),
          ['Public E2E Fe', 'Public E2E Oración'],
        );

        const related = data.related as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(related));
        const relatedSlugs = related.map((sermon) => String(sermon.slug));
        assert.ok(relatedSlugs.includes('public-e2e-related-series'));
        assert.ok(relatedSlugs.includes('public-e2e-related-topic'));
        assert.ok(!relatedSlugs.includes('public-e2e-main'));
        assert.ok(!relatedSlugs.includes(String(draftRelated.slug)));
      } finally {
        await app.close();
      }
    });

    test('applies search/preacher/date filters and the sermonDate DESC default', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const person = await createPerson(app, cookie, {
          firstName: 'Public',
          lastName: 'E2E Filtro Predicador',
        });

        const oldest = await createSermon(app, cookie, {
          title: 'PúblicoE2EFiltro Antiguo',
          slug: 'public-e2e-filter-oldest',
          description: 'Mensaje antiguo de la serie filtrada.',
          preacherId: person.id,
          sermonDate: '2031-01-05',
        });
        await publish(app, cookie, String(oldest.id));

        const middle = await createSermon(app, cookie, {
          title: 'PúblicoE2EFiltro Medio',
          slug: 'public-e2e-filter-middle',
          description: 'buscar-por-descripcion-publica',
          preacherId: person.id,
          sermonDate: '2031-01-20',
        });
        await publish(app, cookie, String(middle.id));

        const newest = await createSermon(app, cookie, {
          title: 'PúblicoE2EFiltro Nuevo',
          slug: 'public-e2e-filter-newest',
          description: 'Mensaje nuevo de la serie filtrada.',
          preacherId: person.id,
          sermonDate: '2031-01-10',
        });
        await publish(app, cookie, String(newest.id));

        const byDefault = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2EFiltro&limit=10`,
        );
        assert.equal(byDefault.statusCode, 200, byDefault.body);
        assert.deepEqual(
          byDefault.json<{ data: Array<{ slug: string }> }>().data.map((sermon) => sermon.slug),
          ['public-e2e-filter-middle', 'public-e2e-filter-newest', 'public-e2e-filter-oldest'],
        );

        const byDescription = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=buscar-por-descripcion-publica&limit=10`,
        );
        assert.equal(byDescription.statusCode, 200, byDescription.body);
        assert.ok(
          byDescription
            .json<{ data: Array<{ slug: string }> }>()
            .data.some((sermon) => sermon.slug === 'public-e2e-filter-middle'),
        );

        const byPreacher = await getPublic(
          app,
          `${PUBLIC_SERMONS}?preacher=Filtro%20Predicador&limit=10`,
        );
        assert.equal(byPreacher.statusCode, 200, byPreacher.body);
        const preacherSlugs = byPreacher
          .json<{ data: Array<{ slug: string }> }>()
          .data.map((sermon) => sermon.slug);
        assert.deepEqual(preacherSlugs.sort(), [
          'public-e2e-filter-middle',
          'public-e2e-filter-newest',
          'public-e2e-filter-oldest',
        ]);

        const byRange = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2EFiltro&from=2031-01-08&to=2031-01-25&limit=10`,
        );
        assert.equal(byRange.statusCode, 200, byRange.body);
        assert.deepEqual(
          byRange.json<{ data: Array<{ slug: string }> }>().data.map((sermon) => sermon.slug),
          ['public-e2e-filter-middle', 'public-e2e-filter-newest'],
        );

        // A valid explicit sort still works.
        const byTitle = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2EFiltro&sort=title&order=asc&limit=10`,
        );
        assert.equal(byTitle.statusCode, 200, byTitle.body);

        for (const url of [
          `${PUBLIC_SERMONS}?sort=bogus`,
          `${PUBLIC_SERMONS}?sort=sermonDate&order=sideways`,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2EFiltro&from=2031-02-01&to=2031-01-01`,
        ]) {
          const invalid = await getPublic(app, url);
          assert.equal(invalid.statusCode, 400, `${url} -> ${invalid.body}`);
          assert.equal(publicErrorCode(invalid.body), 'VALIDATION_ERROR');
        }
      } finally {
        await app.close();
      }
    });

    test('scheduled and archived sermons never reach the public API', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const scheduled = await createSermon(app, cookie, {
          title: 'PúblicoE2EEstado Programado',
          slug: 'public-e2e-scheduled',
          sermonDate: '2026-06-01',
        });
        await schedule(app, cookie, String(scheduled.id), '2099-01-01T00:00:00.000Z');

        const archived = await createSermon(app, cookie, {
          title: 'PúblicoE2EEstado Archivado',
          slug: 'public-e2e-archived',
          sermonDate: '2026-06-02',
        });
        await publish(app, cookie, String(archived.id));
        await archive(app, cookie, String(archived.id));

        const list = await getPublic(
          app,
          `${PUBLIC_SERMONS}?search=P%C3%BAblicoE2EEstado&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        const slugs = list
          .json<{ data: Array<{ slug: string }> }>()
          .data.map((sermon) => sermon.slug);
        assert.deepEqual(slugs, []);

        for (const slug of ['public-e2e-scheduled', 'public-e2e-archived']) {
          const detail = await getPublic(app, `${PUBLIC_SERMONS}/${slug}`);
          assert.equal(detail.statusCode, 404, `${slug} -> ${detail.body}`);
          assert.equal(publicErrorCode(detail.body), 'NOT_FOUND');
        }
      } finally {
        await app.close();
      }
    });

    test('SEO falls back to the sermon content and canonical route', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const sermon = await createSermon(app, cookie, {
          title: 'PúblicoE2E Sin SEO',
          slug: 'public-e2e-fallback',
          description: 'Descripción de respaldo.',
          sermonDate: '2026-05-01',
        });
        await publish(app, cookie, String(sermon.id));

        const res = await getPublic(app, `${PUBLIC_SERMONS}/public-e2e-fallback`);
        assert.equal(res.statusCode, 200, res.body);
        const seo = res.json<JsonEnvelope>().data.seo as Record<string, unknown>;
        assert.equal(seo.title, 'PúblicoE2E Sin SEO');
        assert.equal(seo.description, 'Descripción de respaldo.');
        assert.ok(String(seo.canonicalUrl).endsWith('/sermones/public-e2e-fallback'));
        assert.equal(seo.ogImageUrl, null);
      } finally {
        await app.close();
      }
    });
  },
);