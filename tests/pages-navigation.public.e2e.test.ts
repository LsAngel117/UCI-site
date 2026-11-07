/**
 * Public Pages & Navigation API end-to-end regression suite (Phase 7B,
 * docs/08 §10.1–10.2, §14.1, docs/10 §5–6, docs/11 §14).
 *
 * The public API is unauthenticated and must expose *only* published pages and
 * visible navigation items. This suite proves:
 *   - draft/scheduled/archived pages never leak (list or detail);
 *   - publishing makes a page visible with content + cover + SEO;
 *   - a published slug change leaves a usable redirect foundation entry;
 *   - navigation is scoped by location, ordered and hierarchical, and only
 *     visible items are returned;
 *   - the public DTOs carry no editorial internals (author/version/status).
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
let findRedirect!: typeof import('@server/cms/redirects/service').findRedirect;

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
  ({ findRedirect } = await import('@server/cms/redirects/service'));
}

const ADMIN_EMAIL = 'pages-public-admin-e2e@uci.local';
const PASSWORD = 'Pages-Public-E2e-Passw0rd!';
const ADMIN_PAGES = '/api/v1/admin/pages';
const ADMIN_NAVIGATION = '/api/v1/admin/navigation';
const PUBLIC_PAGES = '/api/v1/pages';
const PUBLIC_NAVIGATION = '/api/v1/navigation';
const LOGIN_URL = '/api/v1/auth/login';
const SITE_URL = loadConfig
  ? loadConfig({ ...process.env, NODE_ENV: 'test' }).siteUrl
  : 'https://uci.example.org';

const userIds: string[] = [];
const mediaAssetIds: string[] = [];
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

async function patchJson(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const res = await app.inject({
    method: 'PATCH',
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

async function createPage(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, ADMIN_PAGES, payload);
  assert.equal(res.statusCode, 201, `page create failed: ${res.body}`);
  const data = res.json<JsonEnvelope>().data;
  pageIds.push(String(data.id));
  return data;
}

async function publishPage(
  app: FastifyInstance,
  cookie: string,
  id: string,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, `${ADMIN_PAGES}/${id}/publish`, {});
  assert.equal(res.statusCode, 200, `publish failed: ${res.body}`);
  return res.json<JsonEnvelope>().data;
}

async function archivePage(
  app: FastifyInstance,
  cookie: string,
  id: string,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, `${ADMIN_PAGES}/${id}/archive`, {});
  assert.equal(res.statusCode, 200, `archive failed: ${res.body}`);
  return res.json<JsonEnvelope>().data;
}

async function createNavigation(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, ADMIN_NAVIGATION, payload);
  assert.equal(res.statusCode, 201, `navigation create failed: ${res.body}`);
  const data = res.json<JsonEnvelope>().data;
  navigationIds.push(String(data.id));
  return data;
}

async function createMediaAsset(actorId: string): Promise<{ id: string; url: string }> {
  const storageKey = `test/${randomUUID()}.png`;
  const asset = await prisma.mediaAsset.create({
    data: {
      type: 'IMAGE',
      filename: 'page-public-cover.png',
      mimeType: 'image/png',
      size: 12,
      storageKey,
      url: `/media/${storageKey}`,
      altText: 'Portada pública',
      createdById: actorId,
    },
  });
  mediaAssetIds.push(asset.id);
  return { id: asset.id, url: `/media/${storageKey}` };
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
  'public pages & navigation API e2e (requires DATABASE_URL)',
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
          firstName: 'Pages',
          lastName: 'Public',
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
        where: { entityType: 'page', entityId: { in: pageIds } },
      });
      await prisma.mediaReference.deleteMany({
        where: {
          OR: [
            { entityId: { in: pageIds } },
            { mediaAssetId: { in: mediaAssetIds } },
          ],
        },
      });
      await prisma.redirect.deleteMany({ where: { entityId: { in: pageIds } } });
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      await prisma.navigation.deleteMany({ where: { id: { in: navigationIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { user: { email: ADMIN_EMAIL } } });
      await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
      await prisma.$disconnect();
    });

    test('lists only published pages without authentication', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const draft = await createPage(app, cookie, {
          title: 'PúblicoPáginas Borrador Oculto',
          slug: 'pubpages-draft',
          excerpt: 'No debe salir nunca.',
        });
        const scheduled = await createPage(app, cookie, {
          title: 'PúblicoPáginas Programada Oculta',
          slug: 'pubpages-scheduled',
        });
        await prisma.page.update({
          where: { id: String(scheduled.id) },
          data: {
            status: 'scheduled',
            publishAt: new Date(Date.now() + 86_400_000),
          },
        });

        const archived = await createPage(app, cookie, {
          title: 'PúblicoPáginas Archivada Oculta',
          slug: 'pubpages-archived',
        });
        await publishPage(app, cookie, String(archived.id));
        await archivePage(app, cookie, String(archived.id));

        const published = await createPage(app, cookie, {
          title: 'PúblicoPáginas Visible',
          slug: 'pubpages-published',
          excerpt: 'Una página publicada.',
          content: {
            blocks: [
              { type: 'heading', text: 'Quiénes somos' },
              { type: 'paragraph', text: 'Contenido público.' },
            ],
          },
        });
        const publishedAfter = await publishPage(app, cookie, String(published.id));
        assert.equal(publishedAfter.status, 'published');

        const list = await getPublic(
          app,
          `${PUBLIC_PAGES}?search=P%C3%BAblicoP%C3%A1ginas&limit=100`,
        );
        assert.equal(list.statusCode, 200, list.body);
        const payload = list.json<{
          data: Array<Record<string, unknown>>;
          meta: { page: number; limit: number; total: number; totalPages: number };
        }>();
        assert.deepEqual(
          payload.data.map((page) => page.slug),
          ['pubpages-published'],
          'only the published match is listed',
        );
        assert.equal(payload.meta.total, 1);

        const [item] = payload.data;
        assert.ok(item);
        // No editorial internals leak into the public projection.
        assert.equal('createdById' in item, false);
        assert.equal('updatedById' in item, false);
        assert.equal('version' in item, false);
        assert.equal('status' in item, false);
        assert.equal('content' in item, false, 'the list DTO stays minimal');
        assert.equal(item.coverImageUrl, null);
        assert.equal(item.excerpt, 'Una página publicada.');
        assert.equal(
          (item.seo as Record<string, unknown>).canonicalUrl,
          `${SITE_URL}/pubpages-published`,
        );

        const detail = await getPublic(app, `${PUBLIC_PAGES}/pubpages-published`);
        assert.equal(detail.statusCode, 200, detail.body);
        const detailData = detail.json<JsonEnvelope>().data;
        assert.deepEqual(detailData.content, {
          blocks: [
            { type: 'heading', text: 'Quiénes somos' },
            { type: 'paragraph', text: 'Contenido público.' },
          ],
        });

        for (const slug of [
          'pubpages-draft',
          'pubpages-scheduled',
          'pubpages-archived',
          'pubpages-does-not-exist',
        ]) {
          const res = await getPublic(app, `${PUBLIC_PAGES}/${slug}`);
          assert.equal(res.statusCode, 404, `${slug} -> ${res.body}`);
          const error = res.json<{ error: { code: string; message: string } }>().error;
          assert.equal(error.code, 'NOT_FOUND');
          assert.equal(error.message, 'Page not found.');
        }

        // A logged-in request gets the same public view (no admin fields).
        const authedList = await getPublic(
          app,
          `${PUBLIC_PAGES}?search=P%C3%BAblicoP%C3%A1ginas&limit=100`,
          cookie,
        );
        assert.equal(authedList.statusCode, 200, authedList.body);
        assert.equal(
          'status' in
            (authedList.json<{ data: Array<Record<string, unknown>> }>().data[0] ?? {}),
          false,
        );
        void draft;
      } finally {
        await app.close();
      }
    });

    test('detail exposes cover and SEO, with canonical fallback and explicit override', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const cover = await createMediaAsset(admin.id);

        const page = await createPage(app, cookie, {
          title: 'PúblicoPáginas Nosotros',
          slug: 'pubpages-nosotros',
          excerpt: 'Nuestra identidad.',
          content: { intro: 'Somos UCI.' },
          coverMediaId: cover.id,
        });
        await publishPage(app, cookie, String(page.id));

        const res = await getPublic(app, `${PUBLIC_PAGES}/pubpages-nosotros`);
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<JsonEnvelope>().data;
        assert.equal(data.coverImageUrl, cover.url);
        assert.equal(data.coverImageAlt, 'Portada pública');
        const seo = data.seo as Record<string, unknown>;
        assert.equal(seo.title, 'PúblicoPáginas Nosotros');
        assert.equal(seo.description, 'Nuestra identidad.');
        assert.equal(seo.canonicalUrl, `${SITE_URL}/pubpages-nosotros`);
        assert.equal(seo.ogImageUrl, `${SITE_URL}${cover.url}`);

        const explicit = await createPage(app, cookie, {
          title: 'PúblicoPáginas SEO',
          slug: 'pubpages-seo',
          excerpt: 'Fallback description.',
          seo: {
            title: 'SEO explícito',
            description: 'Descripción explícita.',
            canonicalUrl: `${SITE_URL}/canonical-explicito`,
            ogImageUrl: 'https://cdn.example.org/og.png',
          },
        });
        await publishPage(app, cookie, String(explicit.id));

        const explicitRes = await getPublic(app, `${PUBLIC_PAGES}/pubpages-seo`);
        assert.equal(explicitRes.statusCode, 200, explicitRes.body);
        const explicitSeo = explicitRes.json<JsonEnvelope>().data
          .seo as Record<string, unknown>;
        assert.deepEqual(explicitSeo, {
          title: 'SEO explícito',
          description: 'Descripción explícita.',
          canonicalUrl: `${SITE_URL}/canonical-explicito`,
          ogImageUrl: 'https://cdn.example.org/og.png',
        });
      } finally {
        await app.close();
      }
    });

    test('pagination and search stay published-only', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        for (const slug of ['pubpages-page-a', 'pubpages-page-b', 'pubpages-page-c']) {
          const page = await createPage(app, cookie, {
            title: `PúblicoPáginas Paginada ${slug}`,
            slug,
          });
          await publishPage(app, cookie, String(page.id));
        }
        const draft = await createPage(app, cookie, {
          title: 'PúblicoPáginas Paginada Borrador',
          slug: 'pubpages-page-draft',
        });
        void draft;

        const first = await getPublic(
          app,
          `${PUBLIC_PAGES}?search=P%C3%BAblicoP%C3%A1ginas%20Paginada&page=1&limit=2`,
        );
        assert.equal(first.statusCode, 200, first.body);
        const payload = first.json<{
          data: Array<{ slug: string }>;
          meta: { page: number; limit: number; total: number; totalPages: number };
        }>();
        assert.deepEqual(payload.meta, {
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2,
        });
        assert.equal(payload.data.length, 2);

        const second = await getPublic(
          app,
          `${PUBLIC_PAGES}?search=P%C3%BAblicoP%C3%A1ginas%20Paginada&page=2&limit=2`,
        );
        assert.equal(second.statusCode, 200, second.body);
        const secondPayload = second.json<{ data: Array<{ slug: string }> }>();
        assert.equal(secondPayload.data.length, 1);

        const listed = [...payload.data, ...secondPayload.data].map((page) => page.slug);
        assert.deepEqual(
          [...listed].sort(),
          ['pubpages-page-a', 'pubpages-page-b', 'pubpages-page-c'],
        );
        assert.ok(!listed.includes('pubpages-page-draft'));
      } finally {
        await app.close();
      }
    });

    test('a published slug change resolves a redirect foundation entry', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const page = await createPage(app, cookie, {
          title: 'PúblicoPáginas Redirect',
          slug: 'pubpages-redirect-old',
        });
        const id = String(page.id);
        const published = await publishPage(app, cookie, id);
        assert.equal(published.version, 2);

        const renamed = await patchJson(app, cookie, `${ADMIN_PAGES}/${id}`, {
          version: 2,
          slug: 'pubpages-redirect-new',
        });
        assert.equal(renamed.statusCode, 200, renamed.body);

        const old = await getPublic(app, `${PUBLIC_PAGES}/pubpages-redirect-old`);
        assert.equal(old.statusCode, 404, old.body);
        const error = old.json<{
          error: { code: string; message: string; details?: { redirectTo?: string } };
        }>().error;
        assert.equal(error.code, 'NOT_FOUND');
        assert.equal(error.message, 'Page not found.');
        assert.deepEqual(error.details, { redirectTo: '/pubpages-redirect-new' });

        const current = await getPublic(app, `${PUBLIC_PAGES}/pubpages-redirect-new`);
        assert.equal(current.statusCode, 200, current.body);

        // The lookup service normalizes both a bare slug and a rooted path.
        const bare = await findRedirect('pubpages-redirect-old');
        assert.ok(bare);
        assert.equal(bare.toPath, 'pubpages-redirect-new');
        const rooted = await findRedirect('/pubpages-redirect-old/');
        assert.ok(rooted);
        assert.equal(rooted.toPath, 'pubpages-redirect-new');
        assert.equal(await findRedirect('pubpages-never-existed'), null);
      } finally {
        await app.close();
      }
    });

    test('navigation is visible-only, ordered, hierarchical and scoped by location', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const hidden = await createNavigation(app, cookie, {
          label: 'Oculto',
          href: '/oculto',
          location: 'HEADER',
          order: 0,
          visible: false,
        });
        const second = await createNavigation(app, cookie, {
          label: 'Segundo',
          href: '/segundo',
          location: 'HEADER',
          order: 20,
        });
        const first = await createNavigation(app, cookie, {
          label: 'Primero',
          href: '/primero',
          location: 'HEADER',
          order: 10,
        });
        const child = await createNavigation(app, cookie, {
          label: 'Hijo',
          href: '/primero/hijo',
          location: 'HEADER',
          parentId: first.id,
          order: 5,
          target: '_blank',
        });
        const footer = await createNavigation(app, cookie, {
          label: 'Contacto',
          href: '/contacto',
          location: 'FOOTER',
          order: 0,
        });
        void hidden;

        const res = await getPublic(app, `${PUBLIC_NAVIGATION}?location=HEADER`);
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<{ data: Array<Record<string, unknown>> }>().data;

        assert.deepEqual(
          data.map((item) => item.label),
          ['Primero', 'Segundo'],
          'only visible HEADER items, ordered by `order`',
        );
        assert.ok(!data.some((item) => item.label === 'Oculto'));

        for (const item of data) {
          assert.deepEqual(
            Object.keys(item).sort(),
            ['children', 'external', 'href', 'id', 'label', 'target'],
            'the navigation DTO is minimal',
          );
        }

        const parent = data[0]!;
        assert.equal(parent.id, first.id);
        const children = parent.children as Array<Record<string, unknown>>;
        assert.equal(children.length, 1);
        assert.equal(children[0]!.id, child.id);
        assert.equal(children[0]!.target, '_blank');
        assert.deepEqual(children[0]!.children, []);

        const footerRes = await getPublic(
          app,
          `${PUBLIC_NAVIGATION}?location=FOOTER`,
        );
        assert.equal(footerRes.statusCode, 200, footerRes.body);
        const footerData = footerRes.json<{ data: Array<Record<string, unknown>> }>().data;
        assert.deepEqual(
          footerData.map((item) => item.id),
          [footer.id],
        );

        // Location defaults to HEADER; an unknown location is a 400.
        const defaulted = await getPublic(app, PUBLIC_NAVIGATION);
        assert.equal(defaulted.statusCode, 200, defaulted.body);
        assert.deepEqual(
          defaulted.json<{ data: Array<Record<string, unknown>> }>().data.map(
            (item) => item.label,
          ),
          ['Primero', 'Segundo'],
        );

        const invalid = await getPublic(
          app,
          `${PUBLIC_NAVIGATION}?location=SIDEBAR`,
        );
        assert.equal(invalid.statusCode, 400, invalid.body);
        assert.equal(
          invalid.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
        void second;
      } finally {
        await app.close();
      }
    });
  },
);
