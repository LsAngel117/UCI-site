/**
 * Public Events & Ministries API end-to-end regression suite (Phase 6B,
 * docs/08 §12.1–12.2, §13.1–13.2, docs/10 §5–6, docs/11 §14).
 *
 * The public API is unauthenticated and must expose *only* published content.
 * This suite proves the visibility boundary (draft/scheduled/archived never
 * leak), the documented filters/order, the minimal public DTO, and the public
 * SEO + cover data. Every row created by the suite is removed in teardown.
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

const ADMIN_EMAIL = 'public-content-admin-e2e@uci.local';
const PASSWORD = 'Public-Content-E2e-Passw0rd!';
const ADMIN_EVENTS = '/api/v1/admin/events';
const ADMIN_MINISTRIES = '/api/v1/admin/ministries';
const CATEGORIES = '/api/v1/admin/event-categories';
const PUBLIC_EVENTS = '/api/v1/events';
const PUBLIC_MINISTRIES = '/api/v1/ministries';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];
const mediaAssetIds: string[] = [];
const eventIds: string[] = [];
const ministryIds: string[] = [];
const categoryIds: string[] = [];

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

async function createEvent(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, ADMIN_EVENTS, payload);
  assert.equal(res.statusCode, 201, `event create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  eventIds.push(String(data.id));
  return data;
}

async function createMinistry(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, ADMIN_MINISTRIES, payload);
  assert.equal(res.statusCode, 201, `ministry create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  ministryIds.push(String(data.id));
  return data;
}

async function createCategory(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, CATEGORIES, payload);
  assert.equal(res.statusCode, 201, `category create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  categoryIds.push(String(data.id));
  return data;
}

async function lifecycle(
  app: FastifyInstance,
  cookie: string,
  base: string,
  id: string,
  action: 'publish' | 'archive',
): Promise<void> {
  const res = await postJson(app, cookie, `${base}/${id}/${action}`, {});
  assert.equal(res.statusCode, 200, `${action} failed: ${res.body}`);
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
}

/** Create a media asset row directly — the binary is irrelevant here. */
async function createMediaAsset(actorId: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      type: 'IMAGE',
      filename: 'public-cover.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: `test/${randomUUID()}.png`,
      url: '/media/test-public-cover.png',
      altText: 'Portada pública',
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
      where: {
        roleId_permissionId: { roleId: admin.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }
}

describe(
  'public events & ministries API e2e (requires DATABASE_URL)',
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
          firstName: 'Public',
          lastName: 'Content Admin',
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
      const ids = [...eventIds, ...ministryIds];
      await prisma.seoMetadata.deleteMany({
        where: {
          entityType: { in: ['event', 'ministry'] },
          entityId: { in: ids },
        },
      });
      await prisma.mediaReference.deleteMany({
        where: {
          OR: [
            { entityId: { in: ids } },
            { mediaAssetId: { in: mediaAssetIds } },
          ],
        },
      });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.ministry.deleteMany({ where: { id: { in: ministryIds } } });
      await prisma.eventCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await prisma.mediaAsset.deleteMany({
        where: { id: { in: mediaAssetIds } },
      });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({
        where: { user: { email: ADMIN_EMAIL } },
      });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('lists only published events without authentication and 404s drafts', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const visibilityCat = await createCategory(app, cookie, {
          name: 'PubE2EStatus Cat',
        });
        const draft = await createEvent(app, cookie, {
          title: 'PubE2EStatus Borrador Oculto',
          slug: 'public-e2e-event-draft',
          summary: 'No debe salir nunca.',
          categoryId: visibilityCat.id,
          startAt: '2033-01-10T10:00:00.000Z',
        });
        const published = await createEvent(app, cookie, {
          title: 'PubE2EStatus Evento Visible',
          slug: 'public-e2e-event-published',
          summary: 'Un evento publicado.',
          categoryId: visibilityCat.id,
          startAt: '2033-02-10T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(published.id), 'publish');

        // Public list needs no session at all. Events are scoped by their
        // unique category because the public event archive has no text search.
        const list = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(visibilityCat.slug)}&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        const payload = list.json<{
          data: Array<Record<string, unknown>>;
          meta: { total: number };
        }>();
        assert.equal(payload.meta.total, 1, 'meta must count only published matches');
        const slugs = payload.data.map((event) => String(event.slug));
        assert.ok(slugs.includes('public-e2e-event-published'));
        assert.ok(!slugs.includes('public-e2e-event-draft'));

        const [item] = payload.data;
        assert.ok(item);
        // Only public fields: no internal author/version/lifecycle columns.
        assert.equal('createdById' in item, false);
        assert.equal('updatedById' in item, false);
        assert.equal('version' in item, false);
        assert.equal('status' in item, false);
        assert.equal('publishAt' in item, false);
        assert.equal('unpublishedAt' in item, false);

        const draftBySlug = await getPublic(
          app,
          `${PUBLIC_EVENTS}/public-e2e-event-draft`,
        );
        assert.equal(draftBySlug.statusCode, 404, draftBySlug.body);
        assert.equal(publicErrorCode(draftBySlug.body), 'NOT_FOUND');

        const unknown = await getPublic(app, `${PUBLIC_EVENTS}/public-e2e-event-no-existe`);
        assert.equal(unknown.statusCode, 404, unknown.body);
        assert.equal(publicErrorCode(unknown.body), 'NOT_FOUND');

        const detail = await getPublic(
          app,
          `${PUBLIC_EVENTS}/public-e2e-event-published`,
        );
        assert.equal(detail.statusCode, 200, detail.body);
        assert.equal(
          detail.json<{ data: Record<string, unknown> }>().data.title,
          'PubE2EStatus Evento Visible',
        );

        // Logged-in requests still get the public view.
        const authedList = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(visibilityCat.slug)}&limit=100`,
          cookie,
        );
        assert.equal(authedList.statusCode, 200, authedList.body);
        assert.equal(
          'status' in
            (authedList.json<{ data: Array<Record<string, unknown>> }>().data[0] ??
              {}),
          false,
        );

        // A tampered status filter cannot pull drafts in.
        const tampered = await getPublic(
          app,
          `${PUBLIC_EVENTS}?status=draft&category=${String(visibilityCat.slug)}&limit=100`,
        );
        assert.equal(tampered.statusCode, 200, tampered.body);
        const tamperedSlugs = tampered
          .json<{ data: Array<{ slug: string }> }>()
          .data.map((event) => event.slug);
        assert.ok(!tamperedSlugs.includes('public-e2e-event-draft'));
        void draft;
      } finally {
        await app.close();
      }
    });

    test('applies category/from/to/upcoming filters and the startAt ASC default', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const orderCat = await createCategory(app, cookie, {
          name: 'PubE2E Order Cat',
        });
        const otherCat = await createCategory(app, cookie, {
          name: 'PubE2E Other Cat',
        });

        const oldest = await createEvent(app, cookie, {
          title: 'PubE2EFiltro Antiguo',
          slug: 'public-e2e-event-oldest',
          categoryId: orderCat.id,
          startAt: '2032-01-05T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(oldest.id), 'publish');

        const middle = await createEvent(app, cookie, {
          title: 'PubE2EFiltro Medio',
          slug: 'public-e2e-event-middle',
          categoryId: orderCat.id,
          startAt: '2032-01-20T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(middle.id), 'publish');

        const newest = await createEvent(app, cookie, {
          title: 'PubE2EFiltro Nuevo',
          slug: 'public-e2e-event-newest',
          categoryId: orderCat.id,
          startAt: '2032-03-10T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(newest.id), 'publish');

        const other = await createEvent(app, cookie, {
          title: 'PubE2EFiltro Otro',
          slug: 'public-e2e-event-other',
          categoryId: otherCat.id,
          startAt: '2032-02-01T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(other.id), 'publish');

        // Default ordering is startAt ASC (scoped to the unique order category).
        const byDefault = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(orderCat.slug)}&limit=10`,
        );
        assert.equal(byDefault.statusCode, 200, byDefault.body);
        assert.deepEqual(
          byDefault
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((event) => event.slug),
          ['public-e2e-event-oldest', 'public-e2e-event-middle', 'public-e2e-event-newest'],
        );

        // Category filter accepts the slug or the id.
        const byCategorySlug = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(orderCat.slug)}&limit=10`,
        );
        assert.equal(byCategorySlug.statusCode, 200, byCategorySlug.body);
        assert.deepEqual(
          byCategorySlug
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((event) => event.slug),
          ['public-e2e-event-oldest', 'public-e2e-event-middle', 'public-e2e-event-newest'],
        );

        const byCategoryId = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(otherCat.id)}&limit=10`,
        );
        assert.equal(byCategoryId.statusCode, 200, byCategoryId.body);
        assert.deepEqual(
          byCategoryId
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((event) => event.slug),
          ['public-e2e-event-other'],
        );

        // startAt range filter within the order category.
        const byRange = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(orderCat.slug)}&from=2032-01-10&to=2032-01-25&limit=10`,
        );
        assert.equal(byRange.statusCode, 200, byRange.body);
        assert.deepEqual(
          byRange
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((event) => event.slug),
          ['public-e2e-event-middle'],
        );

        // Upcoming excludes a past event.
        const upcomingCat = await createCategory(app, cookie, {
          name: 'PubE2E Upcoming Cat',
        });
        const past = await createEvent(app, cookie, {
          title: 'PubE2EUpcoming Pasado',
          slug: 'public-e2e-event-past',
          categoryId: upcomingCat.id,
          startAt: '2000-01-01T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(past.id), 'publish');
        const future = await createEvent(app, cookie, {
          title: 'PubE2EUpcoming Futuro',
          slug: 'public-e2e-event-future',
          categoryId: upcomingCat.id,
          startAt: '2099-01-01T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(future.id), 'publish');

        const upcoming = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(upcomingCat.slug)}&upcoming=true&limit=10`,
        );
        assert.equal(upcoming.statusCode, 200, upcoming.body);
        assert.deepEqual(
          upcoming
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((event) => event.slug),
          ['public-e2e-event-future'],
        );

        // Invalid sort/order and an inverted range are 400s.
        for (const url of [
          `${PUBLIC_EVENTS}?sort=bogus`,
          `${PUBLIC_EVENTS}?sort=startAt&order=sideways`,
          `${PUBLIC_EVENTS}?category=${String(orderCat.slug)}&from=2032-02-01&to=2032-01-01`,
        ]) {
          const invalid = await getPublic(app, url);
          assert.equal(invalid.statusCode, 400, `${url} -> ${invalid.body}`);
          assert.equal(publicErrorCode(invalid.body), 'VALIDATION_ERROR');
        }
      } finally {
        await app.close();
      }
    });

    test('event detail exposes SEO, category and cover', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const category = await createCategory(app, cookie, {
          name: 'PubE2E Detail Cat',
        });
        const coverId = await createMediaAsset(admin.id);

        const event = await createEvent(app, cookie, {
          title: 'PubE2EDetail Evento',
          slug: 'public-e2e-event-detail',
          summary: 'Resumen del evento.',
          description: 'Descripción larga del evento.',
          categoryId: category.id,
          startAt: '2034-04-12T18:00:00.000Z',
          endAt: '2034-04-12T20:00:00.000Z',
          locationName: 'Auditorio UCI',
          address: 'Calle 1',
          city: 'Bogotá',
          coverMediaId: coverId,
          registrationUrl: 'https://uci.example.org/registro',
          featured: true,
          seo: {
            title: 'Evento destacado | Iglesia UCI',
            description: 'Un evento para la comunidad.',
            canonicalUrl: 'https://uci.example.org/eventos/public-e2e-event-detail',
            ogImageUrl: 'https://uci.example.org/og/evento.jpg',
          },
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(event.id), 'publish');

        const res = await getPublic(
          app,
          `${PUBLIC_EVENTS}/public-e2e-event-detail`,
        );
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<{ data: Record<string, unknown> }>().data;

        const seo = data.seo as Record<string, unknown>;
        assert.equal(seo.title, 'Evento destacado | Iglesia UCI');
        assert.equal(seo.description, 'Un evento para la comunidad.');
        assert.equal(
          seo.canonicalUrl,
          'https://uci.example.org/eventos/public-e2e-event-detail',
        );
        assert.equal(seo.ogImageUrl, 'https://uci.example.org/og/evento.jpg');

        assert.equal(data.featured, true);
        assert.equal(data.locationName, 'Auditorio UCI');
        assert.equal(data.city, 'Bogotá');
        assert.equal(data.registrationUrl, 'https://uci.example.org/registro');
        assert.ok(String(data.coverImageUrl).startsWith('/media/'));
        assert.equal(data.coverImageAlt, 'Portada pública');

        const detailCategory = data.category as Record<string, unknown>;
        assert.equal(detailCategory.slug, 'pube2e-detail-cat');
        assert.equal(detailCategory.name, 'PubE2E Detail Cat');
      } finally {
        await app.close();
      }
    });

    test('scheduled and archived events never reach the public API', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const stateCat = await createCategory(app, cookie, {
          name: 'PubE2EState Cat',
        });

        const scheduled = await createEvent(app, cookie, {
          title: 'PubE2EEstado Programado',
          slug: 'public-e2e-event-scheduled',
          categoryId: stateCat.id,
          startAt: '2035-06-01T10:00:00.000Z',
        });
        await schedule(app, cookie, ADMIN_EVENTS, String(scheduled.id), '2099-01-01T00:00:00.000Z');

        const archived = await createEvent(app, cookie, {
          title: 'PubE2EEstado Archivado',
          slug: 'public-e2e-event-archived',
          categoryId: stateCat.id,
          startAt: '2035-06-02T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(archived.id), 'publish');
        await lifecycle(app, cookie, ADMIN_EVENTS, String(archived.id), 'archive');

        const list = await getPublic(
          app,
          `${PUBLIC_EVENTS}?category=${String(stateCat.slug)}&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        assert.deepEqual(
          list.json<{ data: Array<{ slug: string }> }>().data.map((e) => e.slug),
          [],
        );

        for (const slug of ['public-e2e-event-scheduled', 'public-e2e-event-archived']) {
          const detail = await getPublic(app, `${PUBLIC_EVENTS}/${slug}`);
          assert.equal(detail.statusCode, 404, `${slug} -> ${detail.body}`);
          assert.equal(publicErrorCode(detail.body), 'NOT_FOUND');
        }
      } finally {
        await app.close();
      }
    });

    test('lists only published ministries without authentication and 404s drafts', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const draft = await createMinistry(app, cookie, {
          name: 'PubE2EMin Borrador Oculto',
          slug: 'public-e2e-ministry-draft',
        });
        const published = await createMinistry(app, cookie, {
          name: 'PubE2EMin Ministerio Visible',
          slug: 'public-e2e-ministry-published',
        });
        await lifecycle(
          app,
          cookie,
          ADMIN_MINISTRIES,
          String(published.id),
          'publish',
        );

        const list = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}?search=PubE2EMin&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        const payload = list.json<{
          data: Array<Record<string, unknown>>;
          meta: { total: number };
        }>();
        assert.equal(payload.meta.total, 1);
        const slugs = payload.data.map((ministry) => String(ministry.slug));
        assert.ok(slugs.includes('public-e2e-ministry-published'));
        assert.ok(!slugs.includes('public-e2e-ministry-draft'));

        const [item] = payload.data;
        assert.ok(item);
        assert.equal('createdById' in item, false);
        assert.equal('updatedById' in item, false);
        assert.equal('version' in item, false);
        assert.equal('status' in item, false);
        assert.equal('coverMediaId' in item, false);

        const draftBySlug = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}/public-e2e-ministry-draft`,
        );
        assert.equal(draftBySlug.statusCode, 404, draftBySlug.body);
        assert.equal(publicErrorCode(draftBySlug.body), 'NOT_FOUND');

        const unknown = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}/public-e2e-ministry-no-existe`,
        );
        assert.equal(unknown.statusCode, 404, unknown.body);
        assert.equal(publicErrorCode(unknown.body), 'NOT_FOUND');

        void draft;
      } finally {
        await app.close();
      }
    });

    test('ministry filters (search, featured) and default order', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const early = await createMinistry(app, cookie, {
          name: 'PubE2EMinFiltro Alabanza',
          slug: 'public-e2e-ministry-early',
          shortDescription: 'Ministerio de alabanza.',
          featured: true,
        });
        await lifecycle(app, cookie, ADMIN_MINISTRIES, String(early.id), 'publish');

        const late = await createMinistry(app, cookie, {
          name: 'PubE2EMinFiltro Misiones',
          slug: 'public-e2e-ministry-late',
          description: 'buscar-por-descripcion-ministerio',
        });
        await lifecycle(app, cookie, ADMIN_MINISTRIES, String(late.id), 'publish');

        // Deterministic default order: publishedAt DESC. Pin both fixtures.
        await prisma.ministry.update({
          where: { id: String(early.id) },
          data: { publishedAt: new Date('2030-01-01T00:00:00.000Z') },
        });
        await prisma.ministry.update({
          where: { id: String(late.id) },
          data: { publishedAt: new Date('2031-01-01T00:00:00.000Z') },
        });

        const byDefault = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}?search=PubE2EMinFiltro&limit=10`,
        );
        assert.equal(byDefault.statusCode, 200, byDefault.body);
        assert.deepEqual(
          byDefault
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((ministry) => ministry.slug),
          ['public-e2e-ministry-late', 'public-e2e-ministry-early'],
        );

        const byDescription = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}?search=buscar-por-descripcion-ministerio&limit=10`,
        );
        assert.equal(byDescription.statusCode, 200, byDescription.body);
        assert.ok(
          byDescription
            .json<{ data: Array<{ slug: string }> }>()
            .data.some((ministry) => ministry.slug === 'public-e2e-ministry-late'),
        );

        const featured = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}?search=PubE2EMinFiltro&featured=true&limit=10`,
        );
        assert.equal(featured.statusCode, 200, featured.body);
        assert.deepEqual(
          featured
            .json<{ data: Array<{ slug: string }> }>()
            .data.map((ministry) => ministry.slug),
          ['public-e2e-ministry-early'],
        );

        for (const url of [
          `${PUBLIC_MINISTRIES}?sort=bogus`,
          `${PUBLIC_MINISTRIES}?sort=name&order=sideways`,
          `${PUBLIC_MINISTRIES}?search=PubE2EMinFiltro&featured=maybe`,
        ]) {
          const invalid = await getPublic(app, url);
          assert.equal(invalid.statusCode, 400, `${url} -> ${invalid.body}`);
          assert.equal(publicErrorCode(invalid.body), 'VALIDATION_ERROR');
        }
      } finally {
        await app.close();
      }
    });

    test('ministry detail exposes SEO, cover and contact/meeting/cta', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const coverId = await createMediaAsset(admin.id);

        const ministry = await createMinistry(app, cookie, {
          name: 'PubE2EMinDetail Jóvenes',
          slug: 'public-e2e-ministry-detail',
          shortDescription: 'Comunidad de jóvenes.',
          description: 'Descripción larga del ministerio.',
          coverMediaId: coverId,
          contactEmail: 'jovenes@uci.example.org',
          contactPhone: '+57 300 000 0000',
          meetingInfo: 'Viernes 7pm, salón 2.',
          ctaLabel: 'Unirme',
          ctaUrl: 'https://uci.example.org/ministerios/jovenes/unirse',
          seo: {
            title: 'Jóvenes | Iglesia UCI',
            description: 'Ministerio de jóvenes.',
            canonicalUrl: 'https://uci.example.org/ministerios/public-e2e-ministry-detail',
            ogImageUrl: 'https://uci.example.org/og/jovenes.jpg',
          },
        });
        await lifecycle(
          app,
          cookie,
          ADMIN_MINISTRIES,
          String(ministry.id),
          'publish',
        );

        const res = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}/public-e2e-ministry-detail`,
        );
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<{ data: Record<string, unknown> }>().data;

        const seo = data.seo as Record<string, unknown>;
        assert.equal(seo.title, 'Jóvenes | Iglesia UCI');
        assert.equal(
          seo.canonicalUrl,
          'https://uci.example.org/ministerios/public-e2e-ministry-detail',
        );
        assert.equal(seo.ogImageUrl, 'https://uci.example.org/og/jovenes.jpg');

        assert.equal(data.contactEmail, 'jovenes@uci.example.org');
        assert.equal(data.contactPhone, '+57 300 000 0000');
        assert.equal(data.meetingInfo, 'Viernes 7pm, salón 2.');
        assert.equal(data.ctaLabel, 'Unirme');
        assert.equal(
          data.ctaUrl,
          'https://uci.example.org/ministerios/jovenes/unirse',
        );
        assert.ok(String(data.coverImageUrl).startsWith('/media/'));
        assert.equal(data.coverImageAlt, 'Portada pública');
      } finally {
        await app.close();
      }
    });

    test('SEO falls back to the entity content and canonical route', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const event = await createEvent(app, cookie, {
          title: 'PubE2EFallback Evento',
          slug: 'public-e2e-event-fallback',
          summary: 'Resumen de respaldo del evento.',
          startAt: '2036-05-01T10:00:00.000Z',
        });
        await lifecycle(app, cookie, ADMIN_EVENTS, String(event.id), 'publish');

        const eventRes = await getPublic(
          app,
          `${PUBLIC_EVENTS}/public-e2e-event-fallback`,
        );
        assert.equal(eventRes.statusCode, 200, eventRes.body);
        const eventSeo = eventRes.json<{ data: { seo: Record<string, unknown> } }>()
          .data.seo;
        assert.equal(eventSeo.title, 'PubE2EFallback Evento');
        assert.equal(eventSeo.description, 'Resumen de respaldo del evento.');
        assert.ok(
          String(eventSeo.canonicalUrl).endsWith(
            '/eventos/public-e2e-event-fallback',
          ),
        );
        assert.equal(eventSeo.ogImageUrl, null);

        const ministry = await createMinistry(app, cookie, {
          name: 'PubE2EFallback Ministerio',
          slug: 'public-e2e-ministry-fallback',
          shortDescription: 'Resumen de respaldo del ministerio.',
        });
        await lifecycle(
          app,
          cookie,
          ADMIN_MINISTRIES,
          String(ministry.id),
          'publish',
        );

        const ministryRes = await getPublic(
          app,
          `${PUBLIC_MINISTRIES}/public-e2e-ministry-fallback`,
        );
        assert.equal(ministryRes.statusCode, 200, ministryRes.body);
        const ministrySeo = ministryRes.json<{
          data: { seo: Record<string, unknown> };
        }>().data.seo;
        assert.equal(ministrySeo.title, 'PubE2EFallback Ministerio');
        assert.equal(
          ministrySeo.description,
          'Resumen de respaldo del ministerio.',
        );
        assert.ok(
          String(ministrySeo.canonicalUrl).endsWith(
            '/ministerios/public-e2e-ministry-fallback',
          ),
        );
        assert.equal(ministrySeo.ogImageUrl, null);
      } finally {
        await app.close();
      }
    });
  },
);
