/**
 * Pages & Navigation domain end-to-end regression suite (Phase 7A, docs/08
 * §10/§14, docs/05 §20/§45, docs/11 §9).
 *
 * Covers the admin surface only (the public API is Phase 7B):
 *   - Page enrichment (excerpt/content/cover/media reference/SEO/version),
 *     optimistic concurrency (409), publish/archive, revisions + restore,
 *     preview headers and slug-change redirects;
 *   - Navigation CRUD, hierarchy validation (no cycles), reorder and authz.
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

const ADMIN_EMAIL = 'pages-admin-e2e@uci.local';
const EDITOR_EMAIL = 'pages-editor-e2e@uci.local';
const PASSWORD = 'Pages-E2e-Passw0rd!';
const PAGES = '/api/v1/admin/pages';
const NAVIGATION = '/api/v1/admin/navigation';
const LOGIN_URL = '/api/v1/auth/login';

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

async function createPage(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, PAGES, payload);
  assert.equal(res.statusCode, 201, `page create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  pageIds.push(String(data.id));
  return data;
}

async function createNavigation(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await postJson(app, cookie, NAVIGATION, payload);
  assert.equal(res.statusCode, 201, `navigation create failed: ${res.body}`);
  const data = res.json<{ data: Record<string, unknown> }>().data;
  navigationIds.push(String(data.id));
  return data;
}

async function createMediaAsset(actorId: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      type: 'IMAGE',
      filename: 'page-cover.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: `test/${randomUUID()}.png`,
      url: '/media/page-test.png',
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
  'pages & navigation domain e2e (requires DATABASE_URL)',
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
        create: { email: ADMIN_EMAIL, passwordHash, firstName: 'Pages', lastName: 'Admin', active: true },
      });
      const editor = await prisma.user.upsert({
        where: { email: EDITOR_EMAIL },
        update: { passwordHash, active: true },
        create: { email: EDITOR_EMAIL, passwordHash, firstName: 'Pages', lastName: 'Editor', active: true },
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
      await prisma.session.deleteMany({
        where: { user: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } });
      await prisma.$disconnect();
    });

    test('create persists excerpt/content/cover/SEO and the cover MediaReference', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const coverId = await createMediaAsset(admin.id);

        const created = await createPage(app, cookie, {
          title: 'Nuestra Iglesia',
          slug: 'nuestra-iglesia',
          excerpt: 'Conoce nuestra identidad y propósito.',
          content: {
            blocks: [
              { type: 'heading', text: 'Quiénes somos' },
              { type: 'paragraph', text: 'Somos una iglesia local.' },
            ],
          },
          coverMediaId: coverId,
          seo: {
            title: 'Nuestra Iglesia | UCI',
            description: 'Conoce la identidad y propósito de UCI.',
            canonicalUrl: 'https://uci.example.org/nuestra-iglesia',
          },
        });

        assert.equal(created.slug, 'nuestra-iglesia');
        assert.equal(created.excerpt, 'Conoce nuestra identidad y propósito.');
        assert.deepEqual(created.content, {
          blocks: [
            { type: 'heading', text: 'Quiénes somos' },
            { type: 'paragraph', text: 'Somos una iglesia local.' },
          ],
        });
        assert.equal(created.coverMediaId, coverId);
        assert.equal(created.status, 'draft');
        assert.equal(created.version, 1);
        assert.equal((created.seo as Record<string, unknown>).title, 'Nuestra Iglesia | UCI');

        const reference = await prisma.mediaReference.findFirst({
          where: {
            mediaAssetId: coverId,
            entityType: 'page',
            entityId: String(created.id),
            purpose: 'cover',
          },
        });
        assert.ok(reference, 'a cover MediaReference must be registered');

        const fetched = await app.inject({
          method: 'GET',
          url: `${PAGES}/${String(created.id)}`,
          ...authed(cookie),
        });
        assert.equal(fetched.statusCode, 200, fetched.body);
        const got = fetched.json<{ data: Record<string, unknown> }>().data;
        assert.equal(got.id, created.id);
        assert.equal((got.seo as Record<string, unknown>).canonicalUrl, 'https://uci.example.org/nuestra-iglesia');
      } finally {
        await app.close();
      }
    });

    test('regression: a minimal page keeps the Phase 3 shape and new defaults', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createPage(app, cookie, { title: 'Página mínima' });
        assert.equal(created.slug, 'pagina-minima');
        assert.equal(created.excerpt, null);
        assert.equal(created.content, null);
        assert.equal(created.coverMediaId, null);
        assert.equal(created.seo, null);
        assert.equal(created.status, 'draft');
        assert.equal(created.version, 1);
        assert.equal(created.publishedAt, null);
        assert.equal(created.publishAt, null);
      } finally {
        await app.close();
      }
    });

    test('update requires a matching version; a stale PATCH is 409 and changes nothing', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createPage(app, cookie, {
          title: 'Versión uno',
          content: { blocks: [{ type: 'paragraph', text: 'Original' }] },
        });
        const id = String(created.id);

        const updated = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, {
            payload: {
              version: 1,
              title: 'Versión dos',
              content: { blocks: [{ type: 'paragraph', text: 'Editado' }] },
            },
          }),
        });
        assert.equal(updated.statusCode, 200, updated.body);
        const data = updated.json<{ data: Record<string, unknown> }>().data;
        assert.equal(data.title, 'Versión dos');
        assert.equal(data.version, 2);
        assert.deepEqual(data.content, { blocks: [{ type: 'paragraph', text: 'Editado' }] });

        const stale = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, { payload: { version: 1, title: 'No debe aplicarse' } }),
        });
        assert.equal(stale.statusCode, 409, stale.body);
        assert.equal(stale.json<{ error: { code: string } }>().error.code, 'CONFLICT');

        const row = await prisma.page.findUniqueOrThrow({ where: { id } });
        assert.equal(row.title, 'Versión dos', 'a stale write must not change the title');
        assert.equal(row.version, 2, 'a stale write must not bump the version');

        const noVersion = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, { payload: { title: 'Sin versión' } }),
        });
        assert.equal(noVersion.statusCode, 400, noVersion.body);
        assert.equal(
          noVersion.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
      } finally {
        await app.close();
      }
    });

    test('publish, revisions and restore keep append-only history', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createPage(app, cookie, {
          title: 'Historial',
          content: { blocks: [{ type: 'paragraph', text: 'Versión publicada' }] },
        });
        const id = String(created.id);

        const published = await postJson(app, cookie, `${PAGES}/${id}/publish`, {});
        assert.equal(published.statusCode, 200, published.body);
        const publishedData = published.json<{ data: Record<string, unknown> }>().data;
        assert.equal(publishedData.status, 'published');
        assert.equal(publishedData.version, 2);
        assert.ok(publishedData.publishedAt);

        const revisions = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/revisions`,
          ...authed(cookie),
        });
        assert.equal(revisions.statusCode, 200, revisions.body);
        const revisionList = revisions.json<{ data: Array<Record<string, unknown>> }>().data;
        assert.equal(revisionList.length, 1);
        const revisionId = String(revisionList[0]!.id);
        assert.equal(revisionList[0]!.version, 2);
        assert.equal(
          (revisionList[0]!.snapshot as Record<string, unknown>).title,
          'Historial',
        );

        const detail = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/revisions/${revisionId}`,
          ...authed(cookie),
        });
        assert.equal(detail.statusCode, 200, detail.body);
        assert.equal(detail.json<{ data: Record<string, unknown> }>().data.version, 2);

        // Edit after publishing, then restore the published snapshot. The
        // restore appends a NEW revision and never removes the old one.
        const edited = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, {
            payload: {
              version: 2,
              title: 'Historial editado',
              content: { blocks: [{ type: 'paragraph', text: 'Otra versión' }] },
            },
          }),
        });
        assert.equal(edited.statusCode, 200, edited.body);
        assert.equal(edited.json<{ data: { version: number } }>().data.version, 3);

        const restored = await postJson(
          app,
          cookie,
          `${PAGES}/${id}/revisions/${revisionId}/restore`,
          {},
        );
        assert.equal(restored.statusCode, 200, restored.body);
        const restoredData = restored.json<{ data: Record<string, unknown> }>().data;
        assert.equal(restoredData.title, 'Historial');
        assert.equal(restoredData.version, 4);
        assert.deepEqual(restoredData.content, {
          blocks: [{ type: 'paragraph', text: 'Versión publicada' }],
        });

        const afterRestore = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/revisions`,
          ...authed(cookie),
        });
        assert.equal(afterRestore.statusCode, 200, afterRestore.body);
        const versions = afterRestore
          .json<{ data: Array<{ version: number }> }>()
          .data.map((revision) => revision.version);
        assert.deepEqual(versions, [4, 2], 'history is append-only and newest first');

        const archived = await postJson(app, cookie, `${PAGES}/${id}/archive`, {});
        assert.equal(archived.statusCode, 200, archived.body);
        assert.equal(
          archived.json<{ data: { status: string } }>().data.status,
          'archived',
        );
      } finally {
        await app.close();
      }
    });

    test('preview is authenticated and marked noindex/no-store', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createPage(app, cookie, { title: 'Preview draft' });
        const id = String(created.id);

        const anonymous = await app.inject({ method: 'GET', url: `${PAGES}/${id}/preview` });
        assert.equal(anonymous.statusCode, 401);

        const preview = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/preview`,
          ...authed(cookie),
        });
        assert.equal(preview.statusCode, 200, preview.body);
        assert.equal(preview.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
        assert.equal(preview.headers['cache-control'], 'no-store');
        assert.equal(
          preview.json<{ data: { status: string } }>().data.status,
          'draft',
        );
      } finally {
        await app.close();
      }
    });

    test('changing a published page slug creates redirects; draft changes do not', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const draft = await createPage(app, cookie, {
          title: 'Borrador redirect',
          slug: 'borrador-viejo',
        });
        const draftRenamed = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${String(draft.id)}`,
          ...authed(cookie, { payload: { version: 1, slug: 'borrador-nuevo' } }),
        });
        assert.equal(draftRenamed.statusCode, 200, draftRenamed.body);
        assert.equal(
          await prisma.redirect.count({ where: { entityId: String(draft.id) } }),
          0,
          'a draft slug change must not create a redirect',
        );

        const page = await createPage(app, cookie, {
          title: 'Publicada redirect',
          slug: 'publicada-vieja',
        });
        const id = String(page.id);
        const published = await postJson(app, cookie, `${PAGES}/${id}/publish`, {});
        assert.equal(published.statusCode, 200, published.body);

        const renamed = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, { payload: { version: 2, slug: 'publicada-nueva' } }),
        });
        assert.equal(renamed.statusCode, 200, renamed.body);

        const redirect = await prisma.redirect.findUnique({
          where: { fromPath: 'publicada-vieja' },
        });
        assert.ok(redirect, 'a redirect from the old slug must exist');
        assert.equal(redirect.toPath, 'publicada-nueva');
        assert.equal(redirect.entityType, 'page');
        assert.equal(redirect.entityId, id);

        // Changing again records the next hop without losing the first one.
        const renamedAgain = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, { payload: { version: 3, slug: 'publicada-final' } }),
        });
        assert.equal(renamedAgain.statusCode, 200, renamedAgain.body);
        assert.equal(await prisma.redirect.count({ where: { entityId: id } }), 2);
        const second = await prisma.redirect.findUnique({
          where: { fromPath: 'publicada-nueva' },
        });
        assert.ok(second);
        assert.equal(second.toPath, 'publicada-final');
      } finally {
        await app.close();
      }
    });

    test('restoring a published page to an older slug records a redirect back to it', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const created = await createPage(app, cookie, {
          title: 'Restauración redirect',
          slug: 'restore-redirect-old',
        });
        const id = String(created.id);

        const published = await postJson(app, cookie, `${PAGES}/${id}/publish`, {});
        assert.equal(published.statusCode, 200, published.body);

        // Rename while published: this records old -> new.
        const renamed = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(cookie, {
            payload: { version: 2, slug: 'restore-redirect-new' },
          }),
        });
        assert.equal(renamed.statusCode, 200, renamed.body);
        const forward = await prisma.redirect.findUnique({
          where: { fromPath: 'restore-redirect-old' },
        });
        assert.ok(forward, 'the rename must record old -> new');
        assert.equal(forward.toPath, 'restore-redirect-new');

        const revisions = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/revisions`,
          ...authed(cookie),
        });
        assert.equal(revisions.statusCode, 200, revisions.body);
        const publishedRevision = revisions
          .json<{ data: Array<{ id: string; version: number }> }>()
          .data.find((revision) => revision.version === 2);
        assert.ok(publishedRevision, 'the publish checkpoint must be listed');

        // Restoring the published snapshot moves the live URL back to the old
        // slug, so the abandoned slug must redirect to it.
        const restored = await postJson(
          app,
          cookie,
          `${PAGES}/${id}/revisions/${publishedRevision.id}/restore`,
          {},
        );
        assert.equal(restored.statusCode, 200, restored.body);
        const restoredData = restored.json<{ data: Record<string, unknown> }>().data;
        assert.equal(restoredData.slug, 'restore-redirect-old');
        assert.equal(restoredData.version, 4);

        const back = await prisma.redirect.findUnique({
          where: { fromPath: 'restore-redirect-new' },
        });
        assert.ok(back, 'restoring the slug must record new -> old');
        assert.equal(back.toPath, 'restore-redirect-old');
        assert.equal(back.entityId, id);

        // The stale forward redirect now points at a dead URL; it must be gone.
        assert.equal(
          await prisma.redirect.findUnique({
            where: { fromPath: 'restore-redirect-old' },
          }),
          null,
          'a redirect whose source is the live slug must not survive',
        );

        const abandoned = await app.inject({
          method: 'GET',
          url: '/api/v1/pages/restore-redirect-new',
        });
        assert.equal(abandoned.statusCode, 404, abandoned.body);
        const error = abandoned.json<{
          error: { code: string; details?: { redirectTo?: string } };
        }>().error;
        assert.equal(error.code, 'NOT_FOUND');
        assert.deepEqual(error.details, { redirectTo: '/restore-redirect-old' });

        const live = await app.inject({
          method: 'GET',
          url: '/api/v1/pages/restore-redirect-old',
        });
        assert.equal(live.statusCode, 200, live.body);
      } finally {
        await app.close();
      }
    });

    test('restoring a revision whose cover was deleted is a 400 and leaves the row intact', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: ADMIN_EMAIL },
        });
        const coverId = await createMediaAsset(admin.id);

        const created = await createPage(app, cookie, {
          title: 'Restore cover borrado',
          slug: 'restore-cover-page',
          coverMediaId: coverId,
        });
        const id = String(created.id);
        const published = await postJson(app, cookie, `${PAGES}/${id}/publish`, {});
        assert.equal(published.statusCode, 200, published.body);

        const revisions = await app.inject({
          method: 'GET',
          url: `${PAGES}/${id}/revisions`,
          ...authed(cookie),
        });
        const publishedRevision = revisions
          .json<{ data: Array<{ id: string; version: number }> }>()
          .data.find((revision) => revision.version === 2);
        assert.ok(publishedRevision);

        // Simulate the cover being deleted after the snapshot was captured.
        await prisma.mediaReference.deleteMany({ where: { mediaAssetId: coverId } });
        await prisma.mediaAsset.delete({ where: { id: coverId } });
        const afterDelete = await prisma.page.findUniqueOrThrow({ where: { id } });
        assert.equal(
          afterDelete.coverMediaId,
          null,
          'deleting the asset nulls the page FK',
        );

        const restored = await postJson(
          app,
          cookie,
          `${PAGES}/${id}/revisions/${publishedRevision.id}/restore`,
          {},
        );
        assert.equal(restored.statusCode, 400, restored.body);
        assert.notEqual(restored.statusCode, 500, 'a missing cover must never be a 500');
        assert.equal(
          restored.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );

        const row = await prisma.page.findUniqueOrThrow({ where: { id } });
        assert.equal(
          row.version,
          afterDelete.version,
          'a rejected restore must not bump the version',
        );
        assert.equal(row.coverMediaId, null);
        assert.equal(row.title, afterDelete.title);
        assert.equal(
          await prisma.pageRevision.count({ where: { pageId: id } }),
          1,
          'a rejected restore must not append a revision',
        );
      } finally {
        await app.close();
      }
    });

    test('malformed seo and explicit non-draft status are rejected before any write', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
        const before = await prisma.page.count({ where: { createdById: admin.id } });

        for (const seo of ['not-an-object', []]) {
          const res = await app.inject({
            method: 'POST',
            url: PAGES,
            ...authed(cookie, { payload: { title: 'SEO inválido', seo } }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(seo)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        for (const status of ['published', 'archived', 'scheduled']) {
          const res = await app.inject({
            method: 'POST',
            url: PAGES,
            ...authed(cookie, { payload: { title: `Estado ${status}`, status } }),
          });
          assert.equal(res.statusCode, 400, `${status} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        assert.equal(
          await prisma.page.count({ where: { createdById: admin.id } }),
          before,
          'rejected payloads must not create a page',
        );

        const created = await createPage(app, cookie, { title: 'Guards update' });
        const id = String(created.id);
        for (const payload of [
          { version: 1, seo: 'not-an-object' },
          { version: 1, status: 'published' },
          { version: 1, content: [] },
        ]) {
          const res = await app.inject({
            method: 'PATCH',
            url: `${PAGES}/${id}`,
            ...authed(cookie, { payload }),
          });
          assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }
        const row = await prisma.page.findUniqueOrThrow({ where: { id } });
        assert.equal(row.version, 1, 'a rejected payload must not bump the version');

        const ghostMedia = await app.inject({
          method: 'POST',
          url: PAGES,
          ...authed(cookie, {
            payload: { title: 'Media fantasma', coverMediaId: randomUUID() },
          }),
        });
        assert.equal(ghostMedia.statusCode, 400, ghostMedia.body);
        assert.equal(
          ghostMedia.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
      } finally {
        await app.close();
      }
    });

    test('permissions: editor can edit pages but cannot publish/archive or touch navigation', async () => {
      const app = makeApp();
      try {
        const editorCookie = await login(app, EDITOR_EMAIL);
        const created = await createPage(app, editorCookie, { title: 'Página del editor' });
        const id = String(created.id);

        const edit = await app.inject({
          method: 'PATCH',
          url: `${PAGES}/${id}`,
          ...authed(editorCookie, { payload: { version: 1, title: 'Editada por editor' } }),
        });
        assert.equal(edit.statusCode, 200, edit.body);

        const publish = await postJson(app, editorCookie, `${PAGES}/${id}/publish`, {});
        assert.equal(publish.statusCode, 403, publish.body);

        const archive = await postJson(app, editorCookie, `${PAGES}/${id}/archive`, {});
        assert.equal(archive.statusCode, 403, archive.body);

        const navRead = await app.inject({
          method: 'GET',
          url: NAVIGATION,
          ...authed(editorCookie),
        });
        assert.equal(navRead.statusCode, 403, navRead.body);

        const navCreate = await postJson(app, editorCookie, NAVIGATION, {
          label: 'No permitido',
          href: '/',
        });
        assert.equal(navCreate.statusCode, 403, navCreate.body);
      } finally {
        await app.close();
      }
    });

    test('navigation CRUD validates location/target/href/parentId', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);

        const anonymous = await app.inject({ method: 'GET', url: NAVIGATION });
        assert.equal(anonymous.statusCode, 401);

        const item = await createNavigation(app, cookie, {
          label: 'Inicio',
          href: '/',
          location: 'header',
        });
        assert.equal(item.location, 'HEADER');
        assert.equal(item.external, false);
        assert.equal(item.target, null);
        assert.equal(item.order, 0);
        assert.equal(item.visible, true);
        assert.equal(item.parentId, null);

        const child = await createNavigation(app, cookie, {
          label: 'Nosotros',
          href: '/nosotros',
          location: 'HEADER',
          parentId: item.id,
          order: 1,
          target: '_blank',
        });
        assert.equal(child.parentId, item.id);
        assert.equal(child.target, '_blank');

        const footer = await createNavigation(app, cookie, {
          label: 'Contacto',
          href: '/contacto',
          location: 'FOOTER',
        });
        assert.equal(footer.location, 'FOOTER');

        const list = await app.inject({
          method: 'GET',
          url: `${NAVIGATION}?location=HEADER`,
          ...authed(cookie),
        });
        assert.equal(list.statusCode, 200, list.body);
        const listed = list.json<{ data: Array<Record<string, unknown>> }>().data;
        assert.deepEqual(
          listed.map((entry) => entry.id),
          [item.id, child.id],
          'only the requested location, ordered by `order`',
        );

        const patched = await app.inject({
          method: 'PATCH',
          url: `${NAVIGATION}/${String(item.id)}`,
          ...authed(cookie, {
            payload: { label: 'Inicio UCI', visible: false, order: 5 },
          }),
        });
        assert.equal(patched.statusCode, 200, patched.body);
        const patchedData = patched.json<{ data: Record<string, unknown> }>().data;
        assert.equal(patchedData.label, 'Inicio UCI');
        assert.equal(patchedData.visible, false);
        assert.equal(patchedData.order, 5);

        for (const payload of [
          { label: 'Bad location', href: '/', location: 'SIDEBAR' },
          { label: 'Bad target', href: '/', target: '_parent' },
          { label: 'Bad external href', href: 'not-a-url', external: true },
          { label: 'Bad internal href', href: 'nosotros' },
          { label: 'Missing parent', href: '/', parentId: randomUUID() },
        ]) {
          const res = await postJson(app, cookie, NAVIGATION, payload);
          assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }

        // A parent cannot be moved under its own descendant (cycle guard).
        const cycle = await app.inject({
          method: 'PATCH',
          url: `${NAVIGATION}/${String(item.id)}`,
          ...authed(cookie, { payload: { parentId: child.id } }),
        });
        assert.equal(cycle.statusCode, 400, cycle.body);
        assert.equal(
          cycle.json<{ error: { code: string } }>().error.code,
          'VALIDATION_ERROR',
        );
      } finally {
        await app.close();
      }
    });

    test('navigation reorder updates positions atomically and rejects malformed input', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const first = await createNavigation(app, cookie, {
          label: 'Uno',
          href: '/uno',
          order: 0,
        });
        const second = await createNavigation(app, cookie, {
          label: 'Dos',
          href: '/dos',
          order: 1,
        });

        const reordered = await postJson(app, cookie, `${NAVIGATION}/reorder`, {
          items: [
            { id: second.id, position: 0 },
            { id: first.id, position: 1 },
          ],
        });
        assert.equal(reordered.statusCode, 200, reordered.body);
        const ordered = reordered.json<{ data: Array<Record<string, unknown>> }>().data;
        assert.deepEqual(
          ordered.map((entry) => entry.id),
          [second.id, first.id],
        );
        assert.deepEqual(
          ordered.map((entry) => entry.order),
          [0, 1],
        );

        const before = await prisma.navigation.findMany({
          where: { id: { in: [String(first.id), String(second.id)] } },
          orderBy: { id: 'asc' },
        });

        for (const payload of [
          { items: [] },
          { items: [{ id: first.id, position: 0 }, { id: first.id, position: 1 }] },
          { items: [{ id: first.id, position: -1 }] },
          { items: [{ id: randomUUID(), position: 0 }] },
        ]) {
          const res = await postJson(app, cookie, `${NAVIGATION}/reorder`, payload);
          assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} -> ${res.body}`);
          assert.equal(
            res.json<{ error: { code: string } }>().error.code,
            'VALIDATION_ERROR',
          );
        }

        const after = await prisma.navigation.findMany({
          where: { id: { in: [String(first.id), String(second.id)] } },
          orderBy: { id: 'asc' },
        });
        assert.deepEqual(after, before, 'a rejected reorder must not change any position');
      } finally {
        await app.close();
      }
    });

    test('deleting a navigation parent orphans its children (SetNull)', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const parent = await createNavigation(app, cookie, {
          label: 'Padre',
          href: '/padre',
          location: 'HEADER',
        });
        const child = await createNavigation(app, cookie, {
          label: 'Hijo',
          href: '/hijo',
          location: 'HEADER',
          parentId: parent.id,
        });

        const deleted = await app.inject({
          method: 'DELETE',
          url: `${NAVIGATION}/${String(parent.id)}`,
          ...authed(cookie),
        });
        assert.equal(deleted.statusCode, 204, deleted.body);
        assert.equal(
          await prisma.navigation.count({ where: { id: String(parent.id) } }),
          0,
        );
        const orphan = await prisma.navigation.findUniqueOrThrow({
          where: { id: String(child.id) },
        });
        assert.equal(orphan.parentId, null);

        const missing = await app.inject({
          method: 'DELETE',
          url: `${NAVIGATION}/${String(parent.id)}`,
          ...authed(cookie),
        });
        assert.equal(missing.statusCode, 404, missing.body);
      } finally {
        await app.close();
      }
    });
  },
);
