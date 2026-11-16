/**
 * Cross-surface editorial flow suite (Phase 12B, docs/15 §18.3).
 *
 * Each test follows the same end-to-end path the documents describe:
 * admin API → editorial lifecycle → public API (and, for pages, navigation).
 * It asserts both halves of the visibility boundary:
 *
 *   - unpublished content is absent / 404 on the public surface;
 *   - publishing makes it reachable, with canonical SEO data;
 *   - an event's public DTO produces Schema.org Event when fed to the site's
 *     pure SEO builder;
 *   - a published page can be linked from CMS navigation and its published
 *     content is what the public page route receives.
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
import type { PublicEventDto } from '@shared/cms';
import type { JsonLdObject } from '@shared/seo';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];
let buildEventSeo!: typeof import('@web/lib/seo').buildEventSeo;

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
  ({ buildEventSeo } = await import('@web/lib/seo'));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `flows-admin-${RUN}@uci.local`;
const PASSWORD = 'Flows-Integration-Passw0rd!';
const LOGIN_URL = '/api/v1/auth/login';

const SITE_URL = loadConfig
  ? loadConfig({ ...process.env, NODE_ENV: 'test' }).siteUrl
  : 'https://uci.example.org';

const userIds: string[] = [];
const sermonIds: string[] = [];
const eventIds: string[] = [];
const pageIds: string[] = [];
const navigationIds: string[] = [];

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

async function get(
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

async function publish(
  app: FastifyInstance,
  cookie: string,
  base: string,
  id: string,
): Promise<void> {
  const res = await postJson(app, cookie, `${base}/${id}/publish`, {});
  assert.equal(res.statusCode, 200, `publish failed: ${res.body}`);
}

async function archive(
  app: FastifyInstance,
  cookie: string,
  base: string,
  id: string,
): Promise<void> {
  const res = await postJson(app, cookie, `${base}/${id}/archive`, {});
  assert.equal(res.statusCode, 200, `archive failed: ${res.body}`);
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
  'editorial flows end-to-end (requires DATABASE_URL)',
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
          firstName: 'Flows',
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
        where: {
          OR: [
            { entityType: 'sermon', entityId: { in: sermonIds } },
            { entityType: 'event', entityId: { in: eventIds } },
            { entityType: 'page', entityId: { in: pageIds } },
          ],
        },
      });
      await prisma.redirect.deleteMany({ where: { entityId: { in: pageIds } } });
      await prisma.navigation.deleteMany({ where: { id: { in: navigationIds } } });
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { user: { email: ADMIN_EMAIL } } });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('sermon: create → publish → public detail + search discovery', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const slug = `flow-sermon-${RUN}`;
        const title = `Flow sermon ${RUN}`;

        const sermon = await createRecord(
          app,
          cookie,
          '/api/v1/admin/sermons',
          {
            title,
            slug,
            description: 'Un mensaje del flujo editorial.',
            sermonDate: '2026-08-01',
            scriptureReference: 'Juan 3:16',
          },
          sermonIds,
        );

        // Draft: detail 404 and absent from the public archive/search.
        const draftDetail = await get(app, `/api/v1/sermons/${slug}`);
        assert.equal(draftDetail.statusCode, 404);
        const draftList = await get(
          app,
          `/api/v1/sermons?search=${encodeURIComponent(title)}`,
        );
        assert.equal(draftList.statusCode, 200);
        assert.equal(
          draftList.json<{ meta: { total: number } }>().meta.total,
          0,
        );

        await publish(app, cookie, '/api/v1/admin/sermons', String(sermon.id));

        const detail = await get(app, `/api/v1/sermons/${slug}`);
        assert.equal(detail.statusCode, 200, detail.body);
        const payload = detail.json<{
          data: { slug: string; title: string; status?: string; seo: { canonicalUrl: string } };
        }>().data;
        assert.equal(payload.slug, slug);
        assert.equal(payload.title, title);
        assert.equal(payload.status, undefined, 'public DTO leaks no status');
        assert.equal(payload.seo.canonicalUrl, `${SITE_URL}/sermones/${slug}`);

        const list = await get(
          app,
          `/api/v1/sermons?search=${encodeURIComponent(title)}`,
        );
        assert.equal(
          list.json<{ meta: { total: number } }>().meta.total,
          1,
        );

        const search = await get(
          app,
          `/api/v1/search?q=${encodeURIComponent(title)}`,
        );
        assert.equal(search.statusCode, 200, search.body);
        const hits = search.json<{
          data: Array<{ type: string; slug: string }>;
        }>().data;
        assert.ok(
          hits.some((hit) => hit.type === 'SERMON' && hit.slug === slug),
          'published sermon must be discoverable through search',
        );
      } finally {
        await app.close();
      }
    });

    test('event: create → publish → public detail + Schema.org Event', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const slug = `flow-event-${RUN}`;

        const event = await createRecord(
          app,
          cookie,
          '/api/v1/admin/events',
          {
            title: `Flow event ${RUN}`,
            slug,
            summary: 'Un evento del flujo editorial.',
            startAt: '2035-09-10T15:00:00.000Z',
            endAt: '2035-09-10T17:00:00.000Z',
            locationName: 'Templo UCI',
            city: 'Bogotá',
          },
          eventIds,
        );

        const draftDetail = await get(app, `/api/v1/events/${slug}`);
        assert.equal(draftDetail.statusCode, 404);

        await publish(app, cookie, '/api/v1/admin/events', String(event.id));

        const detail = await get(app, `/api/v1/events/${slug}`);
        assert.equal(detail.statusCode, 200, detail.body);
        const payload = detail.json<{ data: PublicEventDto }>().data;
        assert.equal(payload.slug, slug);
        assert.equal(payload.seo.canonicalUrl, `${SITE_URL}/eventos/${slug}`);

        const seo = buildEventSeo(payload, {
          siteUrl: SITE_URL,
          siteName: 'Iglesia UCI',
          now: new Date('2035-01-01T00:00:00.000Z'),
        });
        const eventLd = seo.jsonLd.find(
          (item: JsonLdObject) => item['@type'] === 'Event',
        );
        assert.ok(eventLd, 'published event must produce Schema.org Event');
        assert.equal(eventLd['startDate'], '2035-09-10T15:00:00.000Z');
        assert.equal(
          eventLd['eventStatus'],
          'https://schema.org/EventScheduled',
        );
      } finally {
        await app.close();
      }
    });

    test('page: create → publish → public URL + CMS navigation', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const slug = `flow-page-${RUN}`;
        const label = `Flujo ${RUN}`;

        const page = await createRecord(
          app,
          cookie,
          '/api/v1/admin/pages',
          {
            title: `Flow page ${RUN}`,
            slug,
            excerpt: 'Una página del flujo editorial.',
            content: {
              blocks: [
                { type: 'heading', text: 'Nuestra historia' },
                { type: 'paragraph', text: 'Contenido publicado.' },
              ],
            },
          },
          pageIds,
        );

        const draftDetail = await get(app, `/api/v1/pages/${slug}`);
        assert.equal(draftDetail.statusCode, 404);

        await publish(app, cookie, '/api/v1/admin/pages', String(page.id));

        const detail = await get(app, `/api/v1/pages/${slug}`);
        assert.equal(detail.statusCode, 200, detail.body);
        const payload = detail.json<{
          data: { slug: string; content: { blocks: unknown[] }; seo: { canonicalUrl: string } };
        }>().data;
        assert.equal(payload.slug, slug);
        assert.equal(payload.seo.canonicalUrl, `${SITE_URL}/${slug}`);
        assert.equal(payload.content.blocks.length, 2);

        const navigation = await createRecord(
          app,
          cookie,
          '/api/v1/admin/navigation',
          {
            label,
            href: `/${slug}`,
            location: 'HEADER',
            order: 50,
          },
          navigationIds,
        );
        assert.equal(navigation.href, `/${slug}`);

        const publicNavigation = await get(
          app,
          '/api/v1/navigation?location=HEADER',
        );
        assert.equal(publicNavigation.statusCode, 200, publicNavigation.body);
        const items = publicNavigation.json<{
          data: Array<{ label: string; href: string }>;
        }>().data;
        assert.ok(
          items.some((item) => item.href === `/${slug}` && item.label === label),
          'published page must be linkable from the public menu',
        );

        // Archiving removes the page from the public surface but never deletes
        // the editorial row or its revisions.
        await archive(app, cookie, '/api/v1/admin/pages', String(page.id));
        const archivedDetail = await get(app, `/api/v1/pages/${slug}`);
        assert.equal(archivedDetail.statusCode, 404);
        assert.ok(
          await prisma.page.findUnique({ where: { id: String(page.id) } }),
          'archive must retain the editorial row',
        );
      } finally {
        await app.close();
      }
    });
  },
);
