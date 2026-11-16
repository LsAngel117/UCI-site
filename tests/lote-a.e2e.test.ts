/**
 * Improvement Lote A — end-to-end suite (requires DATABASE_URL).
 *
 * Proves against PostgreSQL + a temporary media root:
 *   - A2: story create → publish → public listing/detail, with the
 *         editorial-approval gate hiding published-but-unapproved stories and
 *         every draft;
 *   - A3: sermon rich `content` round-trips through admin and public DTOs and
 *         an invalid content type is a 400 that stores nothing;
 *   - A1: `settings/public` exposes the configured APP_TIMEZONE;
 *   - A4: orphan cleanup dry-run vs real run, and a referenced asset survives;
 *   - A5: password-reset request is generic, confirm rotates the Argon2id hash,
 *         revokes sessions and audits the action.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. All rows,
 * files and the temporary media root are removed in teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PermissionName } from '@shared/api';
import type { OrphanMediaStore } from '@server/media/cleanup';
import sharp from 'sharp';

const MEDIA_ROOT = mkdtempSync(join(tmpdir(), 'uci-lote-a-e2e-'));
process.env.MEDIA_ROOT = MEDIA_ROOT;
process.env.MEDIA_PUBLIC_BASE = '/media';
process.env.MEDIA_MAX_UPLOAD_BYTES = String(10 * 1024 * 1024);

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) rmSync(MEDIA_ROOT, { recursive: true, force: true });

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let issuePasswordResetToken!: typeof import('@server/auth/password-reset').issuePasswordResetToken;
let cleanupOrphanMedia!: typeof import('@server/media/cleanup').cleanupOrphanMedia;
let createMediaStorage!: typeof import('@server/media/storage').createMediaStorage;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ issuePasswordResetToken } = await import('@server/auth/password-reset'));
  ({ cleanupOrphanMedia } = await import('@server/media/cleanup'));
  ({ createMediaStorage } = await import('@server/media/storage'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `lote-a-admin-${RUN}@uci.local`;
const RESET_EMAIL = `lote-a-reset-${RUN}@uci.local`;
const UNKNOWN_EMAIL = `lote-a-unknown-${RUN}@uci.local`;
const PASSWORD = 'Lote-A-Passw0rd!';
const NEW_PASSWORD = 'Lote-A-New-Passw0rd!';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];
const storyIds: string[] = [];
const sermonIds: string[] = [];
const mediaAssetIds: string[] = [];

function makeApp(env: Record<string, string> = {}): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test', ...env }),
  });
}

async function login(
  app: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: LOGIN_URL,
    payload: { email, password },
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

async function png(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 30, g: 110, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

function multipart(
  file: { filename: string; mimeType: string; data: Buffer },
): { payload: Buffer; contentType: string } {
  const boundary = `----uci-lote-a-${randomUUID()}`;
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadAsset(
  app: FastifyInstance,
  cookie: string,
  name: string,
): Promise<{ id: string; storageKey: string }> {
  const form = multipart({
    filename: `${name}.png`,
    mimeType: 'image/png',
    data: await png(),
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/media/upload',
    headers: { cookie, 'content-type': form.contentType },
    payload: form.payload,
  });
  assert.equal(res.statusCode, 201, `upload failed: ${res.body}`);
  const data = res.json<{ data: { id: string; storageKey: string } }>().data;
  mediaAssetIds.push(data.id);
  return data;
}

async function createJson<T>(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
  expected = 201,
): Promise<T> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: { cookie },
    payload,
  });
  assert.equal(res.statusCode, expected, `${url} failed: ${res.body}`);
  return res.json<{ data: T }>().data;
}

function get(app: FastifyInstance, url: string, cookie?: string) {
  return app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
}

describe(
  'improvement Lote A e2e (requires DATABASE_URL)',
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
          firstName: 'Lote',
          lastName: 'Admin',
          active: true,
        },
      });
      const resetUser = await prisma.user.upsert({
        where: { email: RESET_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: RESET_EMAIL,
          passwordHash,
          firstName: 'Reset',
          lastName: 'User',
          active: true,
        },
      });
      userIds.push(admin.id, resetUser.id);

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });
    });

    after(async () => {
      await prisma.passwordResetToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.mediaReference.deleteMany({
        where: { mediaAssetId: { in: mediaAssetIds } },
      });
      await prisma.story.deleteMany({ where: { id: { in: storyIds } } });
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
      rmSync(MEDIA_ROOT, { recursive: true, force: true });
    });

    test('A2: story create → publish → public, draft/unapproved hidden', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const base = '/api/v1/admin/stories';
        const cover = await uploadAsset(app, cookie, `story-cover-${RUN}`);

        const approved = await createJson<Record<string, unknown>>(
          app,
          cookie,
          base,
          {
            title: `Historia aprobada ${RUN}`,
            displayName: 'Ana',
            quote: 'Dios es fiel.',
            fullStory: 'Una historia completa de fidelidad.',
            coverMediaId: cover.id,
            date: '2030-02-01',
            editorialApproved: true,
            featured: true,
            seo: {
              title: 'Historia SEO',
              description: 'Meta descripción de la historia.',
            },
          },
        );
        storyIds.push(String(approved.id));
        const approvedSlug = String(approved.slug);
        assert.equal(approved.coverMediaId, cover.id);
        assert.deepEqual(approved.seo, {
          title: 'Historia SEO',
          description: 'Meta descripción de la historia.',
          canonicalUrl: null,
          ogImageUrl: null,
        });
        assert.ok(
          await prisma.mediaReference.findFirst({
            where: {
              entityType: 'story',
              entityId: String(approved.id),
              purpose: 'cover',
            },
          }),
          'the story cover must create a MediaReference',
        );

        // Draft is never public even when approved for publication.
        assert.equal(
          (await get(app, `/api/v1/stories/${approvedSlug}`)).statusCode,
          404,
        );

        const published = await app.inject({
          method: 'POST',
          url: `${base}/${approved.id}/publish`,
          headers: { cookie },
        });
        assert.equal(published.statusCode, 200, published.body);
        assert.equal(
          published.json<{ data: { status: string } }>().data.status,
          'published',
        );

        const publicDetail = await get(app, `/api/v1/stories/${approvedSlug}`);
        assert.equal(publicDetail.statusCode, 200, publicDetail.body);
        const detail = publicDetail.json<{
          data: {
            title: string;
            displayName: string;
            quote: string;
            fullStory: string;
            coverImageUrl: string | null;
            seo: { title: string; canonicalUrl: string };
          };
        }>().data;
        assert.equal(detail.displayName, 'Ana');
        assert.equal(detail.quote, 'Dios es fiel.');
        assert.equal(detail.fullStory, 'Una historia completa de fidelidad.');
        assert.ok(detail.coverImageUrl, 'the public DTO resolves the cover URL');
        assert.equal(detail.seo.title, 'Historia SEO');
        assert.match(detail.seo.canonicalUrl, /\/historias\//);

        const list = await get(app, '/api/v1/stories');
        assert.equal(list.statusCode, 200, list.body);
        const items = list.json<{ data: Array<{ slug: string }> }>().data;
        assert.ok(items.some((item) => item.slug === approvedSlug));

        // Published but NOT editorially approved: still hidden.
        const unapproved = await createJson<Record<string, unknown>>(
          app,
          cookie,
          base,
          {
            title: `Historia no aprobada ${RUN}`,
            displayName: 'Beto',
            quote: 'Pendiente.',
            fullStory: 'No debe publicarse.',
            editorialApproved: false,
          },
        );
        storyIds.push(String(unapproved.id));
        const publishedUnapproved = await app.inject({
          method: 'POST',
          url: `${base}/${unapproved.id}/publish`,
          headers: { cookie },
        });
        assert.equal(publishedUnapproved.statusCode, 200);
        assert.equal(
          (await get(app, `/api/v1/stories/${String(unapproved.slug)}`))
            .statusCode,
          404,
        );
        const listAfter = await get(app, '/api/v1/stories');
        const afterItems = listAfter.json<{ data: Array<{ slug: string }> }>().data;
        assert.ok(!afterItems.some((item) => item.slug === unapproved.slug));

        // Version guard: a stale update is a 409.
        const stale = await app.inject({
          method: 'PATCH',
          url: `${base}/${approved.id}`,
          headers: { cookie },
          payload: { version: 1, quote: 'stale' },
        });
        assert.equal(stale.statusCode, 409, stale.body);
      } finally {
        await app.close();
      }
    });

    test('A3: sermon rich content round-trips; invalid content is a 400', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const base = '/api/v1/admin/sermons';
        const content = [
          { type: 'heading', level: 2, text: 'Introducción' },
          { type: 'paragraph', text: 'Un mensaje con bloques.' },
        ];

        const created = await createJson<Record<string, unknown>>(
          app,
          cookie,
          base,
          {
            title: `Sermón con contenido ${RUN}`,
            slug: `sermon-contenido-${RUN}`,
            sermonDate: '2030-03-01',
            content,
          },
        );
        sermonIds.push(String(created.id));
        assert.deepEqual(created.content, content);

        const read = await get(app, `${base}/${created.id}`, cookie);
        assert.equal(read.statusCode, 200, read.body);
        assert.deepEqual(
          read.json<{ data: { content: unknown } }>().data.content,
          content,
        );

        const published = await app.inject({
          method: 'POST',
          url: `${base}/${created.id}/publish`,
          headers: { cookie },
        });
        assert.equal(published.statusCode, 200, published.body);

        const publicDetail = await get(
          app,
          `/api/v1/sermons/sermon-contenido-${RUN}`,
        );
        assert.equal(publicDetail.statusCode, 200, publicDetail.body);
        assert.deepEqual(
          publicDetail.json<{ data: { content: unknown } }>().data.content,
          content,
        );

        const before = await prisma.sermon.count({
          where: { createdById: String(created.createdById) },
        });
        const invalid = await app.inject({
          method: 'POST',
          url: base,
          headers: { cookie },
          payload: { title: `Contenido inválido ${RUN}`, content: 'not-blocks' },
        });
        assert.equal(invalid.statusCode, 400, invalid.body);
        assert.equal(
          await prisma.sermon.count({
            where: { createdById: String(created.createdById) },
          }),
          before,
          'a rejected payload stores nothing',
        );
      } finally {
        await app.close();
      }
    });

    test('A1: settings/public exposes the configured APP_TIMEZONE', async () => {
      const app = makeApp({ APP_TIMEZONE: 'America/Lima' });
      try {
        const res = await get(app, '/api/v1/settings/public');
        assert.equal(res.statusCode, 200, res.body);
        const data = res.json<{ data: { timezone: string } }>().data;
        assert.equal(data.timezone, 'America/Lima');
      } finally {
        await app.close();
      }
    });

    test('A4: orphan cleanup dry-run vs real run; referenced assets survive', async () => {
      const app = makeApp();
      try {
        const cookie = await login(app, ADMIN_EMAIL);
        const orphan = await uploadAsset(app, cookie, `orphan-${RUN}`);
        const referenced = await uploadAsset(app, cookie, `referenced-${RUN}`);

        // Give both assets an age beyond the threshold.
        const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        await prisma.mediaAsset.updateMany({
          where: { id: { in: [orphan.id, referenced.id] } },
          data: { createdAt: old },
        });
        // The referenced asset has a content reference, so it is not orphaned.
        await prisma.mediaReference.create({
          data: {
            mediaAssetId: referenced.id,
            entityType: 'story',
            entityId: `lote-a-fixture-${RUN}`,
            purpose: 'cover',
          },
        });

        const dry = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/media/cleanup',
          headers: { cookie },
          payload: { dryRun: true, olderThanDays: 1 },
        });
        assert.equal(dry.statusCode, 200, dry.body);
        const dryResult = dry.json<{
          data: {
            dryRun: boolean;
            candidates: number;
            deleted: number;
            items: Array<{ id: string; action: string }>;
          };
        }>().data;
        assert.equal(dryResult.dryRun, true);
        assert.equal(dryResult.deleted, 0);
        assert.ok(dryResult.items.some((item) => item.id === orphan.id));
        assert.ok(!dryResult.items.some((item) => item.id === referenced.id));
        assert.ok(await prisma.mediaAsset.findUnique({ where: { id: orphan.id } }));

        // The real run is scoped to this fixture so the shared local database
        // can never lose another suite's media. It still exercises the actual
        // Prisma delete + filesystem removal path.
        const scopedStore: OrphanMediaStore = {
          async listOrphans(cutoff) {
            const rows = await prisma.mediaAsset.findMany({
              where: {
                id: orphan.id,
                references: { none: {} },
                createdAt: { lt: cutoff },
              },
              include: { variants: { select: { storageKey: true } } },
            });
            return rows.map((row) => ({
              id: row.id,
              filename: row.filename,
              storageKey: row.storageKey,
              size: row.size,
              createdAt: row.createdAt,
              variants: row.variants,
            }));
          },
          async delete(id) {
            await prisma.mediaAsset.delete({ where: { id } });
          },
        };
        const storage = createMediaStorage({
          root: MEDIA_ROOT,
          publicBase: '/media',
        });
        const realResult = await cleanupOrphanMedia(
          { olderThanDays: 1 },
          { store: scopedStore, storage },
        );
        assert.equal(realResult.deleted, 1);
        assert.equal(realResult.failures, 0);

        assert.equal(
          await prisma.mediaAsset.findUnique({ where: { id: orphan.id } }),
          null,
        );
        assert.ok(
          await prisma.mediaAsset.findUnique({ where: { id: referenced.id } }),
          'a referenced asset must never be swept',
        );
        assert.equal(
          existsSync(join(MEDIA_ROOT, ...orphan.storageKey.split('/'))),
          false,
          'the orphan binary is removed from storage',
        );
      } finally {
        await app.close();
      }
    });

    test('A5: password reset request is generic, confirm rotates hash + revokes sessions', async () => {
      const app = makeApp();
      try {
        const oldCookie = await login(app, RESET_EMAIL);

        const requestKnown = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password-reset/request',
          payload: { email: RESET_EMAIL },
        });
        assert.equal(requestKnown.statusCode, 202, requestKnown.body);
        const knownBody = requestKnown.json<{ data: { message: string } }>();
        assert.match(knownBody.data.message, /If the account exists/i);
        assert.doesNotMatch(requestKnown.body, /token/i);

        const requestUnknown = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password-reset/request',
          payload: { email: UNKNOWN_EMAIL },
        });
        assert.equal(requestUnknown.statusCode, 202, requestUnknown.body);
        assert.deepEqual(
          requestUnknown.json<{ data: { message: string } }>().data,
          knownBody.data,
          'unknown addresses get the exact same acknowledgement',
        );

        const resetUser = await prisma.user.findUniqueOrThrow({
          where: { email: RESET_EMAIL },
        });
        assert.equal(
          await prisma.passwordResetToken.count({
            where: { userId: resetUser.id, usedAt: null },
          }),
          1,
          'a request stores exactly one unused token',
        );

        // The raw token is only delivered by email; the e2e flow obtains it
        // through the same helper the request path uses.
        const issued = await issuePasswordResetToken(resetUser.id);

        const confirm = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password-reset/confirm',
          payload: { token: issued.token, password: NEW_PASSWORD },
        });
        assert.equal(confirm.statusCode, 200, confirm.body);
        assert.doesNotMatch(confirm.body, /tokenHash|argon2|passwordHash/i);

        const afterReset = await prisma.user.findUniqueOrThrow({
          where: { id: resetUser.id },
        });
        assert.ok(afterReset.passwordHash.startsWith('$argon2id$'));
        assert.notEqual(afterReset.passwordHash, resetUser.passwordHash);
        assert.equal(
          await prisma.passwordResetToken.count({
            where: { userId: resetUser.id, usedAt: null },
          }),
          0,
        );

        // Every session created before the reset is revoked.
        const me = await get(app, '/api/v1/auth/me', oldCookie);
        assert.equal(me.statusCode, 401, me.body);

        const oldLogin = await app.inject({
          method: 'POST',
          url: LOGIN_URL,
          payload: { email: RESET_EMAIL, password: PASSWORD },
        });
        assert.equal(oldLogin.statusCode, 401);
        const newCookie = await login(app, RESET_EMAIL, NEW_PASSWORD);
        assert.ok(newCookie.startsWith('uci_session='));

        // A consumed token is single-use: the same raw token is a generic 400.
        const replay = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password-reset/confirm',
          payload: { token: issued.token, password: 'Another-Passw0rd!' },
        });
        assert.equal(replay.statusCode, 400, replay.body);
        assert.doesNotMatch(replay.body, /hash|user|exists/i);

        const audit = await prisma.auditLog.findFirst({
          where: {
            action: 'auth.password_reset',
            entityId: resetUser.id,
          },
        });
        assert.ok(audit, 'password reset must be audited');
        assert.doesNotMatch(JSON.stringify(audit?.metadata ?? {}), /token/i);
      } finally {
        await app.close();
      }
    });
  },
);
