/**
 * Events & Ministries domain end-to-end regression suite (Phase 6A,
 * docs/05 §11–13, docs/08 §12–13, docs/11 §9).
 *
 * Covers the Phase 6A admin surface on top of the reusable CMS core:
 * EventCategory CRUD, Event/Ministry domain fields, cover `MediaReference`,
 * SEO upsert, optimistic concurrency (409), lifecycle actions and the
 * `events.*` / `ministries.*` permission split.
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

const ADMIN_EMAIL = 'events-admin-e2e@uci.local';
const EDITOR_EMAIL = 'events-editor-e2e@uci.local';
const PASSWORD = 'Events-E2e-Passw0rd!';
const EVENTS = '/api/v1/admin/events';
const MINISTRIES = '/api/v1/admin/ministries';
const CATEGORIES = '/api/v1/admin/event-categories';
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

async function createEvent(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: EVENTS,
    ...authed(cookie, { payload }),
  });
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
  const res = await app.inject({
    method: 'POST',
    url: MINISTRIES,
    ...authed(cookie, { payload }),
  });
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

/** Create a media asset row directly — the binary is irrelevant here. */
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
  'events & ministries domain e2e (requires DATABASE_URL)',
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
        create: { email: ADMIN_EMAIL, passwordHash, firstName: 'Events', lastName: 'Admin', active: true },
      });
      const editor = await prisma.user.upsert({
        where: { email: EDITOR_EMAIL },
        update: { passwordHash, active: true },
        create: { email: EDITOR_EMAIL, passwordHash, firstName: 'Events', lastName: 'Editor', active: true },
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
      const ids = [...eventIds, ...ministryIds];
      await prisma.seoMetadata.deleteMany({
        where: { entityType: { in: ['event', 'ministry'] }, entityId: { in: ids } },
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
      await prisma.eventCategory.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({
        where: { user: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } },
      });
      await prisma.$disconnect();
    });

    test('create event with category/cover/location/registration/SEO, then get it', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const suffix = randomUUID().slice(0, 8);

        const category = await createCategory(app, cookie, {
          name: `Conferencias ${suffix}`,
        });
        assert.equal(category.slug, `conferencias-${suffix}`);
        const coverId = await createMediaAsset(admin.id);

        const created = await createEvent(app, cookie, {
          title: `Conferencia anual ${suffix}`,
          summary: 'Resumen breve.',
          description: 'Descripción completa del evento.',
          categoryId: category.id,
          startAt: '2026-11-20T15:00:00.000Z',
          endAt: '2026-11-20T17:00:00.000Z',
          locationName: 'Auditorio UCI',
          address: 'Calle 1 #2-3',
          city: 'Bogotá',
          coverMediaId: coverId,
          registrationUrl: 'https://uci.example.org/registro',
          featured: true,
          seo: {
            title: 'Conferencia anual | UCI',
            description: 'Un evento anual.',
            canonicalUrl: 'https://uci.example.org/eventos/conferencia-anual',
            ogImageUrl: 'https://uci.example.org/og/evento.jpg',
          },
        });

        assert.equal(created.status, 'draft');
        assert.equal(created.version, 1);
        assert.equal(created.summary, 'Resumen breve.');
        assert.equal(created.description, 'Descripción completa del evento.');
        assert.equal(created.categoryId, category.id);
        assert.equal(
          (created.category as Record<string, unknown>).slug,
          `conferencias-${suffix}`,
        );
        assert.equal(created.startAt, '2026-11-20T15:00:00.000Z');
        assert.equal(created.locationName, 'Auditorio UCI');
        assert.equal(created.address, 'Calle 1 #2-3');
        assert.equal(created.city, 'Bogotá');
        assert.equal(created.coverMediaId, coverId);
        assert.equal(created.registrationUrl, 'https://uci.example.org/registro');
        assert.equal(created.featured, true);
        assert.equal(
          (created.seo as Record<string, unknown>).title,
          'Conferencia anual | UCI',
        );

        const fetched = await app.inject({
          method: 'GET',
          url: `${EVENTS}/${String(created.id)}`,
          ...authed(cookie),
        });
        assert.equal(fetched.statusCode, 200, fetched.body);
        const got = fetched.json<{ data: Record<string, unknown> }>().data;
        assert.equal(got.categoryId, category.id);
        assert.equal(got.featured, true);
        assert.equal(
          (got.seo as Record<string, unknown>).canonicalUrl,
          'https://uci.example.org/eventos/conferencia-anual',
        );

        const reference = await prisma.mediaReference.findFirst({
          where: {
            mediaAssetId: coverId,
            entityType: 'event',
            entityId: String(created.id),
            purpose: 'cover',
          },
        });
        assert.ok(reference, 'a cover MediaReference must be registered');

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

    test('create ministry with cover/contact/meeting/CTA/SEO, then get it', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const suffix = randomUUID().slice(0, 8);
        const coverId = await createMediaAsset(admin.id);

        const created = await createMinistry(app, cookie, {
          name: `Misiones ${suffix}`,
          shortDescription: 'Servicio y misión.',
          description: 'Descripción completa del ministerio.',
          coverMediaId: coverId,
          contactEmail: 'misiones@uci.local',
          contactPhone: '+57 300 000 0000',
          meetingInfo: 'Sábados 10:00',
          ctaLabel: 'Quiero participar',
          ctaUrl: 'https://uci.example.org/misiones',
          featured: true,
          seo: {
            title: 'Misiones | UCI',
            description: 'Ministerio de misiones.',
            canonicalUrl: 'https://uci.example.org/ministerios/misiones',
            ogImageUrl: 'https://uci.example.org/og/misiones.jpg',
          },
        });

        assert.equal(created.status, 'draft');
        assert.equal(created.version, 1);
        assert.equal(created.shortDescription, 'Servicio y misión.');
        assert.equal(created.description, 'Descripción completa del ministerio.');
        assert.equal(created.coverMediaId, coverId);
        assert.equal(created.contactEmail, 'misiones@uci.local');
        assert.equal(created.contactPhone, '+57 300 000 0000');
        assert.equal(created.meetingInfo, 'Sábados 10:00');
        assert.equal(created.ctaLabel, 'Quiero participar');
        assert.equal(created.ctaUrl, 'https://uci.example.org/misiones');
        assert.equal(created.featured, true);
        assert.equal(
          (created.seo as Record<string, unknown>).title,
          'Misiones | UCI',
        );

        const fetched = await app.inject({
          method: 'GET',
          url: `${MINISTRIES}/${String(created.id)}`,
          ...authed(cookie),
        });
        assert.equal(fetched.statusCode, 200, fetched.body);
        const got = fetched.json<{ data: Record<string, unknown> }>().data;
        assert.equal(got.contactEmail, 'misiones@uci.local');
        assert.equal(got.ctaUrl, 'https://uci.example.org/misiones');

        const reference = await prisma.mediaReference.findFirst({
          where: {
            mediaAssetId: coverId,
            entityType: 'ministry',
            entityId: String(created.id),
            purpose: 'cover',
          },
        });
        assert.ok(reference, 'a cover MediaReference must be registered');
      } finally {
        await app.close();
      }
    });

    test('publish/schedule/archive reuse the core and stale versions are 409', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const event = await createEvent(app, cookie, { title: 'Evento lifecycle' });
        const eventId = String(event.id);
        const published = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${eventId}/publish`,
          ...authed(cookie),
        });
        assert.equal(published.statusCode, 200, published.body);
        const publishedData = published.json<{ data: Record<string, unknown> }>().data;
        assert.equal(publishedData.status, 'published');
        assert.equal(publishedData.version, 2);
        assert.ok(publishedData.publishedAt);

        const stale = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 1, title: 'No debe aplicarse' } }),
        });
        assert.equal(stale.statusCode, 409, stale.body);
        assert.equal(
          stale.json<{ error: { code: string } }>().error.code,
          'CONFLICT',
        );
        const unchanged = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
        assert.equal(unchanged.title, 'Evento lifecycle');
        assert.equal(unchanged.version, 2);

        const fresh = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 2, title: 'Evento actualizado' } }),
        });
        assert.equal(fresh.statusCode, 200, fresh.body);
        assert.equal(
          fresh.json<{ data: { version: number } }>().data.version,
          3,
        );
        assert.equal(
          fresh.json<{ data: { title: string } }>().data.title,
          'Evento actualizado',
        );

        const archived = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${eventId}/archive`,
          ...authed(cookie),
        });
        assert.equal(archived.statusCode, 200, archived.body);
        assert.equal(
          archived.json<{ data: { status: string } }>().data.status,
          'archived',
        );

        const scheduledEvent = await createEvent(app, cookie, {
          title: 'Evento programado',
        });
        const future = new Date(Date.now() + 3_600_000).toISOString();
        const scheduled = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${String(scheduledEvent.id)}/schedule`,
          ...authed(cookie, { payload: { publishAt: future } }),
        });
        assert.equal(scheduled.statusCode, 200, scheduled.body);
        const scheduledData = scheduled.json<{ data: Record<string, unknown> }>().data;
        assert.equal(scheduledData.status, 'scheduled');
        assert.equal(scheduledData.publishAt, future);
        assert.equal(scheduledData.version, 2);

        const past = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${String(scheduledEvent.id)}/schedule`,
          ...authed(cookie, { payload: { publishAt: '2020-01-01T00:00:00.000Z' } }),
        });
        assert.equal(past.statusCode, 400, past.body);

        const ministry = await createMinistry(app, cookie, { name: 'Ministerio lifecycle' });
        const ministryId = String(ministry.id);
        const ministryPublished = await app.inject({
          method: 'POST',
          url: `${MINISTRIES}/${ministryId}/publish`,
          ...authed(cookie),
        });
        assert.equal(ministryPublished.statusCode, 200, ministryPublished.body);
        assert.equal(
          ministryPublished.json<{ data: { status: string } }>().data.status,
          'published',
        );
        const ministryStale = await app.inject({
          method: 'PATCH',
          url: `${MINISTRIES}/${ministryId}`,
          ...authed(cookie, { payload: { version: 1, name: 'Stale' } }),
        });
        assert.equal(ministryStale.statusCode, 409, ministryStale.body);
      } finally {
        await app.close();
      }
    });

    test('editor can create/update but cannot publish or archive', async () => {
      const app = makeApp();
      try {
        const anonymous = await app.inject({ method: 'GET', url: EVENTS });
        assert.equal(anonymous.statusCode, 401);

        const editorCookie = await login(app, EDITOR_EMAIL);
        const event = await createEvent(app, editorCookie, { title: 'Borrador del editor' });
        const eventId = String(event.id);

        const updated = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(editorCookie, { payload: { version: 1, summary: 'Editado' } }),
        });
        assert.equal(updated.statusCode, 200, updated.body);

        const publish = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${eventId}/publish`,
          ...authed(editorCookie),
        });
        assert.equal(publish.statusCode, 403, publish.body);

        const archive = await app.inject({
          method: 'POST',
          url: `${EVENTS}/${eventId}/archive`,
          ...authed(editorCookie),
        });
        assert.equal(archive.statusCode, 403, archive.body);

        const ministry = await createMinistry(app, editorCookie, { name: 'Ministerio del editor' });
        const ministryPublish = await app.inject({
          method: 'POST',
          url: `${MINISTRIES}/${String(ministry.id)}/publish`,
          ...authed(editorCookie),
        });
        assert.equal(ministryPublish.statusCode, 403, ministryPublish.body);

        // Event categories reuse `events.*`, so an editor can manage them.
        const category = await createCategory(app, editorCookie, {
          name: `Categoría editor ${randomUUID().slice(0, 8)}`,
        });
        const renamed = await app.inject({
          method: 'PATCH',
          url: `${CATEGORIES}/${String(category.id)}`,
          ...authed(editorCookie, { payload: { name: 'Categoría renombrada' } }),
        });
        assert.equal(renamed.statusCode, 200, renamed.body);
      } finally {
        await app.close();
      }
    });

    test('malformed SEO, URLs and unknown references are 400 and persist nothing', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const beforeEvents = await prisma.event.count({ where: { createdById: admin.id } });
        const beforeMinistries = await prisma.ministry.count({
          where: { createdById: admin.id },
        });
        const ghost = randomUUID();

        for (const seo of ['not-an-object', []]) {
          const res = await app.inject({
            method: 'POST',
            url: EVENTS,
            ...authed(cookie, { payload: { title: 'SEO inválido', seo } }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(seo)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        for (const seo of ['not-an-object', []]) {
          const res = await app.inject({
            method: 'POST',
            url: MINISTRIES,
            ...authed(cookie, { payload: { name: 'SEO inválido', seo } }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(seo)} -> ${res.body}`);
        }

        for (const payload of [
          { title: 'Categoría fantasma', categoryId: ghost },
          { title: 'Portada fantasma', coverMediaId: ghost },
          { title: 'URL inválida', registrationUrl: 'not-a-url' },
        ]) {
          const res = await app.inject({
            method: 'POST',
            url: EVENTS,
            ...authed(cookie, { payload }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} -> ${res.body}`);
        }
        const badMinistry = await app.inject({
          method: 'POST',
          url: MINISTRIES,
          ...authed(cookie, {
            payload: { name: 'Portada fantasma', coverMediaId: ghost },
          }),
        });
        assert.equal(badMinistry.statusCode, 400, badMinistry.body);

        assert.equal(
          await prisma.event.count({ where: { createdById: admin.id } }),
          beforeEvents,
          'no event row may be created',
        );
        assert.equal(
          await prisma.ministry.count({ where: { createdById: admin.id } }),
          beforeMinistries,
          'no ministry row may be created',
        );

        // A rejected SEO on update must not bump the version or persist metadata.
        const event = await createEvent(app, cookie, { title: 'SEO update guard' });
        const eventId = String(event.id);
        const badUpdate = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 1, seo: 'bad' } }),
        });
        assert.equal(badUpdate.statusCode, 400, badUpdate.body);
        const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
        assert.equal(row.version, 1);
        assert.equal(
          await prisma.seoMetadata.count({
            where: { entityType: 'event', entityId: eventId },
          }),
          0,
        );
      } finally {
        await app.close();
      }
    });

    test('event category admin: list/search/update and slug rules', async () => {
      const app = makeApp();
      try {
        const anonymous = await app.inject({ method: 'GET', url: CATEGORIES });
        assert.equal(anonymous.statusCode, 401);

        const cookie = await login(app, ADMIN_EMAIL);
        const suffix = randomUUID().slice(0, 8);
        const category = await createCategory(app, cookie, {
          name: `Jóvenes ${suffix}`,
        });
        assert.equal(category.slug, `jovenes-${suffix}`);

        const list = await app.inject({
          method: 'GET',
          url: `${CATEGORIES}?search=jovenes-${suffix}`,
          ...authed(cookie),
        });
        assert.equal(list.statusCode, 200, list.body);
        const listed = list.json<{ data: Array<{ id: string }>; meta: { total: number } }>();
        assert.ok(listed.data.some((row) => row.id === category.id));

        const renamed = await app.inject({
          method: 'PATCH',
          url: `${CATEGORIES}/${String(category.id)}`,
          ...authed(cookie, { payload: { name: `Jóvenes adultos ${suffix}` } }),
        });
        assert.equal(renamed.statusCode, 200, renamed.body);
        assert.equal(
          renamed.json<{ data: { name: string } }>().data.name,
          `Jóvenes adultos ${suffix}`,
        );

        const firstSlug = `categoria-dup-${suffix}`;
        await createCategory(app, cookie, {
          name: `Categoría dup ${suffix}`,
          slug: firstSlug,
        });
        const duplicate = await app.inject({
          method: 'POST',
          url: CATEGORIES,
          ...authed(cookie, {
            payload: { name: 'Otra categoría', slug: firstSlug },
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

    test('changing or clearing a cover rewrites the MediaReference', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const first = await createMediaAsset(admin.id);
        const second = await createMediaAsset(admin.id);

        const event = await createEvent(app, cookie, {
          title: 'Portada cambiante',
          coverMediaId: first,
        });
        const eventId = String(event.id);

        const patched = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 1, coverMediaId: second } }),
        });
        assert.equal(patched.statusCode, 200, patched.body);
        assert.equal(
          patched.json<{ data: { coverMediaId: string } }>().data.coverMediaId,
          second,
        );
        assert.equal(
          await prisma.mediaReference.count({
            where: { mediaAssetId: first, entityId: eventId, purpose: 'cover' },
          }),
          0,
          'the previous event cover reference must be removed',
        );
        assert.equal(
          await prisma.mediaReference.count({
            where: { mediaAssetId: second, entityId: eventId, purpose: 'cover' },
          }),
          1,
          'the new event cover reference must be registered',
        );

        const cleared = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 2, coverMediaId: null } }),
        });
        assert.equal(cleared.statusCode, 200, cleared.body);
        assert.equal(
          await prisma.mediaReference.count({
            where: { entityId: eventId, purpose: 'cover' },
          }),
          0,
          'clearing the event cover removes every cover reference',
        );

        const ministry = await createMinistry(app, cookie, {
          name: 'Ministerio portada',
          coverMediaId: first,
        });
        const ministryId = String(ministry.id);
        const ministryPatched = await app.inject({
          method: 'PATCH',
          url: `${MINISTRIES}/${ministryId}`,
          ...authed(cookie, { payload: { version: 1, coverMediaId: second } }),
        });
        assert.equal(ministryPatched.statusCode, 200, ministryPatched.body);
        assert.equal(
          await prisma.mediaReference.count({
            where: { mediaAssetId: first, entityId: ministryId, purpose: 'cover' },
          }),
          0,
        );
        assert.equal(
          await prisma.mediaReference.count({
            where: { mediaAssetId: second, entityId: ministryId, purpose: 'cover' },
          }),
          1,
        );
      } finally {
        await app.close();
      }
    });

    test('admin list filters and minimal defaults keep the Phase 6A shape', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const suffix = randomUUID().slice(0, 8);
        const category = await createCategory(app, cookie, {
          name: `Filtro categoría ${suffix}`,
        });

        const filtered = await createEvent(app, cookie, {
          title: `Filtro evento ${suffix}`,
          categoryId: category.id,
          summary: 'Texto buscable único',
        });

        const list = await app.inject({
          method: 'GET',
          url: `${EVENTS}?categoryId=${String(category.id)}&status=draft&search=Texto%20buscable`,
          ...authed(cookie),
        });
        assert.equal(list.statusCode, 200, list.body);
        const listed = list.json<{ data: Array<{ id: string }> }>();
        assert.deepEqual(listed.data.map((row) => row.id), [String(filtered.id)]);

        const invalidStatus = await app.inject({
          method: 'GET',
          url: `${EVENTS}?status=not-a-status`,
          ...authed(cookie),
        });
        assert.equal(invalidStatus.statusCode, 400, invalidStatus.body);

        const ministry = await createMinistry(app, cookie, {
          name: `Filtro ministerio ${suffix}`,
          shortDescription: 'Buscable ministerio',
        });
        const ministryList = await app.inject({
          method: 'GET',
          url: `${MINISTRIES}?search=Buscable%20ministerio`,
          ...authed(cookie),
        });
        assert.equal(ministryList.statusCode, 200, ministryList.body);
        assert.ok(
          ministryList
            .json<{ data: Array<{ id: string }> }>()
            .data.some((row) => row.id === ministry.id),
        );

        // Defaults: a minimal record is a draft at version 1 with no optional
        // relations/media/SEO, and creation never publishes (docs/08 §22).
        const minimalEvent = await createEvent(app, cookie, { title: 'Evento mínimo' });
        assert.equal(minimalEvent.status, 'draft');
        assert.equal(minimalEvent.version, 1);
        assert.equal(minimalEvent.categoryId, null);
        assert.equal(minimalEvent.category, null);
        assert.equal(minimalEvent.coverMediaId, null);
        assert.equal(minimalEvent.featured, false);
        assert.equal(minimalEvent.seo, null);

        const minimalMinistry = await createMinistry(app, cookie, { name: 'Ministerio mínimo' });
        assert.equal(minimalMinistry.status, 'draft');
        assert.equal(minimalMinistry.version, 1);
        assert.equal(minimalMinistry.coverMediaId, null);
        assert.equal(minimalMinistry.featured, false);
        assert.equal(minimalMinistry.seo, null);
        assert.equal(minimalMinistry.publishAt, null);
      } finally {
        await app.close();
      }
    });

    test('an explicit non-draft status is rejected before any write', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const beforeEvents = await prisma.event.count({ where: { createdById: admin.id } });
        const beforeMinistries = await prisma.ministry.count({
          where: { createdById: admin.id },
        });

        // create: a non-draft status is a 400 and persists nothing.
        for (const status of ['published', 'archived', 'PUBLISHED']) {
          const eventRes = await app.inject({
            method: 'POST',
            url: EVENTS,
            ...authed(cookie, { payload: { title: `Evento ${status}`, status } }),
          });
          assert.equal(eventRes.statusCode, 400, `${status} -> ${eventRes.body}`);
          const error = eventRes.json<{ error: { code: string; message: string } }>().error;
          assert.equal(error.code, 'VALIDATION_ERROR');
          assert.match(error.message, /publish\/schedule\/archive/);

          const ministryRes = await app.inject({
            method: 'POST',
            url: MINISTRIES,
            ...authed(cookie, { payload: { name: `Ministerio ${status}`, status } }),
          });
          assert.equal(ministryRes.statusCode, 400, `${status} -> ${ministryRes.body}`);
          assert.equal(
            ministryRes.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        assert.equal(
          await prisma.event.count({ where: { createdById: admin.id } }),
          beforeEvents,
          'a rejected status must not create an event',
        );
        assert.equal(
          await prisma.ministry.count({ where: { createdById: admin.id } }),
          beforeMinistries,
          'a rejected status must not create a ministry',
        );

        // update: a non-draft status is a 400 and leaves the row unchanged.
        const event = await createEvent(app, cookie, { title: 'Evento status guard' });
        const eventId = String(event.id);
        const rejectedEvent = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
          ...authed(cookie, { payload: { version: 1, status: 'archived' } }),
        });
        assert.equal(rejectedEvent.statusCode, 400, rejectedEvent.body);
        assert.equal(
          rejectedEvent.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
        const eventRow = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
        assert.equal(eventRow.status, 'draft', 'a rejected status must not change status');
        assert.equal(eventRow.version, 1, 'a rejected status must not bump the version');

        const ministry = await createMinistry(app, cookie, { name: 'Ministerio status guard' });
        const ministryId = String(ministry.id);
        const rejectedMinistry = await app.inject({
          method: 'PATCH',
          url: `${MINISTRIES}/${ministryId}`,
          ...authed(cookie, { payload: { version: 1, status: 'published' } }),
        });
        assert.equal(rejectedMinistry.statusCode, 400, rejectedMinistry.body);
        const ministryRow = await prisma.ministry.findUniqueOrThrow({
          where: { id: ministryId },
        });
        assert.equal(ministryRow.status, 'draft');
        assert.equal(ministryRow.version, 1);

        // PRESERVE: 'draft' (any case) and an omitted status keep working.
        for (const status of ['draft', 'DRAFT']) {
          const okEvent = await app.inject({
            method: 'POST',
            url: EVENTS,
            ...authed(cookie, { payload: { title: `Evento ok ${status}`, status } }),
          });
          assert.equal(okEvent.statusCode, 201, okEvent.body);
          const okEventData = okEvent.json<{ data: Record<string, unknown> }>().data;
          eventIds.push(String(okEventData.id));
          assert.equal(okEventData.status, 'draft');

          const okMinistry = await app.inject({
            method: 'POST',
            url: MINISTRIES,
            ...authed(cookie, { payload: { name: `Ministerio ok ${status}`, status } }),
          });
          assert.equal(okMinistry.statusCode, 201, okMinistry.body);
          const okMinistryData = okMinistry.json<{ data: Record<string, unknown> }>().data;
          ministryIds.push(String(okMinistryData.id));
          assert.equal(okMinistryData.status, 'draft');
        }

        const patchDraft = await app.inject({
          method: 'PATCH',
          url: `${EVENTS}/${eventId}`,
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