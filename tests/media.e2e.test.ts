/**
 * Media end-to-end regression suite (Phase 4, docs/08 §15, docs/12).
 *
 * Exercises the real Fastify app through `app.inject()` plus a real
 * PostgreSQL database and a real filesystem root in a temporary directory.
 * The suite is skipped when `DATABASE_URL` is absent, matching the existing
 * auth/cms e2e suites.
 *
 * `MEDIA_ROOT` is set to an OS temp directory BEFORE the server modules load,
 * so no test writes binaries into the worktree. Every row and file created by
 * the suite is removed in teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { MediaDto, MediaVariantDto } from '@shared/media';
import type { PermissionName } from '@shared/api';
import type { MediaStorage } from '@server/media/storage';
import sharp from 'sharp';

const MEDIA_ROOT = mkdtempSync(join(tmpdir(), 'uci-media-e2e-'));
process.env.MEDIA_ROOT = MEDIA_ROOT;
process.env.MEDIA_PUBLIC_BASE = '/media';
process.env.MEDIA_MAX_UPLOAD_BYTES = String(10 * 1024 * 1024);

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let createMediaService!: typeof import('@server/media/service').createMediaService;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ createMediaService } = await import('@server/media/service'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const ADMIN_EMAIL = 'media-admin-e2e@uci.local';
const EDITOR_EMAIL = 'media-editor-e2e@uci.local';
const PASSWORD = 'Media-E2e-Passw0rd!';
const BASE = '/api/v1/admin/media';
const LOGIN_URL = '/api/v1/auth/login';

const userIds: string[] = [];

function makeApp(env: Record<string, string> = {}): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test', ...env }),
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

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

function multipartBody(
  fields: Record<string, string>,
  file: { filename: string; mimeType: string; data: Buffer },
): { payload: Buffer; contentType: string } {
  const boundary = `----uci-media-${randomUUID()}`;
  const chunks: Buffer[] = [];
  // Fields first so they are parsed before the file (a @fastify/multipart
  // recommendation); the route still consumes the file stream immediately.
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
  );
  chunks.push(file.data);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function upload(
  app: FastifyInstance,
  cookie: string,
  file: { filename: string; mimeType: string; data: Buffer },
  fields: Record<string, string> = {},
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  const form = multipartBody(fields, file);
  return app.inject({
    method: 'POST',
    url: `${BASE}/upload`,
    headers: { cookie, 'content-type': form.contentType },
    payload: form.payload,
  });
}

function json<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

/**
 * Provider-swap probe: a pure in-memory `MediaStorage`. The service and the
 * domain model must work against it without touching the filesystem, and the
 * DTO must expose this provider's identity and URLs (docs/12 §8, §11).
 */
class InMemoryStorage implements MediaStorage {
  readonly provider = 'memory-test';
  private readonly files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(data));
  }

  async get(key: string): Promise<Buffer> {
    const value = this.files.get(key);
    if (!value) throw new Error(`missing key: ${key}`);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }

  getPublicUrl(key: string): string {
    return `https://memory.example/${key}`;
  }
}

async function ensureRoles(): Promise<void> {
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });
  await prisma.role.upsert({
    where: { name: 'EDITOR' },
    update: {},
    create: { name: 'EDITOR', description: 'E2E editor role (no delete grant)' },
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
  'media e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    before(async () => {
      await ensureRoles();
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'ADMIN' },
      });
      const editorRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'EDITOR' },
      });
      const passwordHash = await hashPassword(PASSWORD);

      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'Media',
          lastName: 'Admin',
          active: true,
        },
      });
      const editor = await prisma.user.upsert({
        where: { email: EDITOR_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: EDITOR_EMAIL,
          passwordHash,
          firstName: 'Media',
          lastName: 'Editor',
          active: true,
        },
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
      await prisma.mediaReference.deleteMany({
        where: { mediaAsset: { createdById: { in: userIds } } },
      });
      await prisma.mediaAsset.deleteMany({
        where: { createdById: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.session.deleteMany({
        where: { user: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ADMIN_EMAIL, EDITOR_EMAIL] } },
      });
      await prisma.$disconnect();
      rmSync(MEDIA_ROOT, { recursive: true, force: true });
    });

    test('unauthenticated access is 401 and a permission-less editor cannot delete (403)', async () => {
      const app = makeApp();
      try {
        const anonymous = await app.inject({ method: 'GET', url: BASE });
        assert.equal(anonymous.statusCode, 401);
        assert.equal(
          json<{ error: { code: string } }>(anonymous).error.code,
          'UNAUTHORIZED',
        );

        const editorCookie = await login(app, EDITOR_EMAIL);
        const forbidden = await app.inject({
          method: 'DELETE',
          url: `${BASE}/not-a-real-id`,
          headers: { cookie: editorCookie },
        });
        assert.equal(forbidden.statusCode, 403);
        assert.equal(
          json<{ error: { code: string } }>(forbidden).error.code,
          'FORBIDDEN',
        );
      } finally {
        await app.close();
      }
    });

    test('valid upload stores metadata + generated key + variants, and serves the public URL', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const before = await prisma.mediaAsset.count();
        const image = await png(1600, 900);

        const res = await upload(
          app,
          adminCookie,
          { filename: 'foto secreta.png', mimeType: 'image/png', data: image },
          {
            folder: 'sermons',
            alt: 'Predicación del domingo',
            title: 'Portada',
            caption: 'Pie de foto',
            description: 'Imagen de prueba',
          },
        );
        assert.equal(res.statusCode, 201, res.body);

        const media = json<{ data: Record<string, unknown> }>(res).data;
        assert.equal(media.filename, 'foto secreta.png');
        assert.equal(media.mimeType, 'image/png');
        assert.equal(media.type, 'IMAGE');
        assert.equal(media.folder, 'sermons');
        assert.equal(media.alt, 'Predicación del domingo');
        assert.equal(media.title, 'Portada');
        assert.equal(media.width, 1600);
        assert.equal(media.height, 900);

        const storageKey = String(media.storageKey);
        assert.match(
          storageKey,
          /^sermons\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/,
        );
        assert.ok(
          !storageKey.includes('foto'),
          'the storage key must never derive from the user filename',
        );
        assert.ok(
          existsSync(join(MEDIA_ROOT, storageKey)),
          'the original binary must exist under MEDIA_ROOT',
        );

        const variants = media.variants as Array<Record<string, unknown>>;
        assert.deepEqual(
          variants.map((variant) => variant.label),
          ['thumbnail', 'small', 'medium'],
        );
        assert.deepEqual(
          variants.map((variant) => variant.width),
          [320, 640, 1280],
        );
        for (const variant of variants) {
          assert.equal(variant.format, 'webp');
          assert.ok(String(variant.url).startsWith('/media/'));
          assert.ok(
            existsSync(join(MEDIA_ROOT, String(variant.storageKey))),
            'every variant binary must exist under MEDIA_ROOT',
          );
        }

        const publicUrl = String(media.url);
        assert.ok(publicUrl.startsWith('/media/'));
        const served = await app.inject({ method: 'GET', url: publicUrl });
        assert.equal(served.statusCode, 200);
        assert.match(String(served.headers['content-type']), /^image\/png/);
        // Storage keys are content-addressed by UUID, so derivatives are
        // immutable and must be cacheable aggressively (docs/12 §45–46).
        assert.match(String(served.headers['cache-control']), /immutable/);

        const byId = await app.inject({
          method: 'GET',
          url: `${BASE}/${String(media.id)}`,
          headers: { cookie: adminCookie },
        });
        assert.equal(byId.statusCode, 200);

        const list = await app.inject({
          method: 'GET',
          url: `${BASE}?search=foto&type=IMAGE&folder=sermons&sort=size&order=asc`,
          headers: { cookie: adminCookie },
        });
        assert.equal(list.statusCode, 200, list.body);
        const listed = json<{ data: Array<Record<string, unknown>>; meta: { total: number } }>(
          list,
        );
        assert.ok(listed.meta.total >= 1);
        assert.ok(listed.data.some((item) => item.id === media.id));

        const patch = await app.inject({
          method: 'PATCH',
          url: `${BASE}/${String(media.id)}`,
          headers: { cookie: adminCookie },
          payload: { alt: 'Texto alternativo nuevo', caption: null },
        });
        assert.equal(patch.statusCode, 200, patch.body);
        const patched = json<{ data: Record<string, unknown> }>(patch).data;
        assert.equal(patched.alt, 'Texto alternativo nuevo');
        assert.equal(patched.caption, null);

        const references = await app.inject({
          method: 'GET',
          url: `${BASE}/${String(media.id)}/references`,
          headers: { cookie: adminCookie },
        });
        assert.equal(references.statusCode, 200);
        assert.deepEqual(
          json<{ data: { references: unknown[] } }>(references).data.references,
          [],
        );

        const deleted = await app.inject({
          method: 'DELETE',
          url: `${BASE}/${String(media.id)}`,
          headers: { cookie: adminCookie },
        });
        assert.equal(deleted.statusCode, 200, deleted.body);
        assert.equal(existsSync(join(MEDIA_ROOT, storageKey)), false);
        assert.equal(await prisma.mediaAsset.count(), before);
      } finally {
        await app.close();
      }
    });

    test('invalid MIME and mismatched signatures are rejected without creating a row', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const before = await prisma.mediaAsset.count();

        const svg = await upload(app, adminCookie, {
          filename: 'logo.svg',
          mimeType: 'image/svg+xml',
          data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        });
        assert.equal(svg.statusCode, 422, svg.body);
        assert.equal(
          json<{ error: { code: string } }>(svg).error.code,
          'UNSUPPORTED_MEDIA_TYPE',
        );

        const mismatch = await upload(app, adminCookie, {
          filename: 'fake.png',
          mimeType: 'image/png',
          data: Buffer.from('%PDF-1.7\nnot really a png'),
        });
        assert.equal(mismatch.statusCode, 422, mismatch.body);
        assert.equal(
          json<{ error: { code: string } }>(mismatch).error.code,
          'UNSUPPORTED_MEDIA_TYPE',
        );

        assert.equal(await prisma.mediaAsset.count(), before);
      } finally {
        await app.close();
      }
    });

    test('oversized uploads return 413 FILE_TOO_LARGE', async () => {
      const app = makeApp({ MEDIA_MAX_UPLOAD_BYTES: '1024' });
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const before = await prisma.mediaAsset.count();
        const large = await png(1600, 900);

        const res = await upload(app, adminCookie, {
          filename: 'large.png',
          mimeType: 'image/png',
          data: large,
        });
        assert.equal(res.statusCode, 413, res.body);
        assert.equal(
          json<{ error: { code: string } }>(res).error.code,
          'FILE_TOO_LARGE',
        );
        assert.equal(await prisma.mediaAsset.count(), before);
      } finally {
        await app.close();
      }
    });

    test('delete is reference-aware (409) and force=true removes references + binaries', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const image = await png(800, 600);
        const created = await upload(app, adminCookie, {
          filename: 'cover.png',
          mimeType: 'image/png',
          data: image,
        });
        assert.equal(created.statusCode, 201, created.body);
        const media = json<{ data: Record<string, unknown> }>(created).data;
        const mediaId = String(media.id);
        const storageKey = String(media.storageKey);

        const reference = await prisma.mediaReference.create({
          data: {
            mediaAssetId: mediaId,
            entityType: 'SERMON',
            entityId: randomUUID(),
            purpose: 'cover',
          },
        });

        const listed = await app.inject({
          method: 'GET',
          url: `${BASE}/${mediaId}/references`,
          headers: { cookie: adminCookie },
        });
        assert.equal(listed.statusCode, 200, listed.body);
        const refs = json<{ data: { references: Array<Record<string, unknown>> } }>(
          listed,
        ).data.references;
        assert.equal(refs.length, 1);
        assert.equal(refs[0]!.id, reference.id);
        assert.equal(refs[0]!.entityType, 'SERMON');

        const blocked = await app.inject({
          method: 'DELETE',
          url: `${BASE}/${mediaId}`,
          headers: { cookie: adminCookie },
        });
        assert.equal(blocked.statusCode, 409, blocked.body);
        assert.equal(
          json<{ error: { code: string } }>(blocked).error.code,
          'MEDIA_REFERENCED',
        );
        assert.ok(await prisma.mediaAsset.findUnique({ where: { id: mediaId } }));
        assert.ok(existsSync(join(MEDIA_ROOT, storageKey)));

        const forced = await app.inject({
          method: 'DELETE',
          url: `${BASE}/${mediaId}?force=true`,
          headers: { cookie: adminCookie },
        });
        assert.equal(forced.statusCode, 200, forced.body);
        assert.equal(
          await prisma.mediaAsset.findUnique({ where: { id: mediaId } }),
          null,
        );
        assert.equal(
          await prisma.mediaReference.findUnique({ where: { id: reference.id } }),
          null,
        );
        assert.equal(existsSync(join(MEDIA_ROOT, storageKey)), false);
      } finally {
        await app.close();
      }
    });

    test('an editor without media.delete cannot delete an asset (403)', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const editorCookie = await login(app, EDITOR_EMAIL);
        const image = await png(400, 300);
        const created = await upload(app, adminCookie, {
          filename: 'protected.png',
          mimeType: 'image/png',
          data: image,
        });
        assert.equal(created.statusCode, 201, created.body);
        const mediaId = String(json<{ data: Record<string, unknown> }>(created).data.id);

        const forbidden = await app.inject({
          method: 'DELETE',
          url: `${BASE}/${mediaId}`,
          headers: { cookie: editorCookie },
        });
        assert.equal(forbidden.statusCode, 403);
        assert.ok(await prisma.mediaAsset.findUnique({ where: { id: mediaId } }));
      } finally {
        await app.close();
      }
    });

    test('a malicious filename never becomes the storage key', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);
        const image = await png(80, 60);

        const res = await upload(app, adminCookie, {
          filename: '../../evil.png',
          mimeType: 'image/png',
          data: image,
        });
        assert.equal(res.statusCode, 201, res.body);

        const media = json<{ data: Record<string, unknown> }>(res).data;
        // The original name is preserved as metadata only, with the path stripped.
        assert.equal(media.filename, 'evil.png');
        const storageKey = String(media.storageKey);
        assert.match(storageKey, /^[a-z]+\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
        assert.ok(
          !storageKey.includes('evil'),
          'the storage key must never derive from the user filename',
        );

        const deleted = await app.inject({
          method: 'DELETE',
          url: `${BASE}/${String(media.id)}`,
          headers: { cookie: adminCookie },
        });
        assert.equal(deleted.statusCode, 200, deleted.body);
      } finally {
        await app.close();
      }
    });

    test('the size limit is inclusive: exact size is accepted, one byte less is rejected', async () => {
      const image = await png(60, 40);
      const atLimit = makeApp({ MEDIA_MAX_UPLOAD_BYTES: String(image.length) });
      const underLimit = makeApp({
        MEDIA_MAX_UPLOAD_BYTES: String(image.length - 1),
      });
      try {
        const atCookie = await login(atLimit, ADMIN_EMAIL);
        const underCookie = await login(underLimit, ADMIN_EMAIL);
        const before = await prisma.mediaAsset.count();

        const accepted = await upload(atLimit, atCookie, {
          filename: 'exact.png',
          mimeType: 'image/png',
          data: image,
        });
        assert.equal(accepted.statusCode, 201, accepted.body);

        const rejected = await upload(underLimit, underCookie, {
          filename: 'one-byte-less.png',
          mimeType: 'image/png',
          data: image,
        });
        assert.equal(rejected.statusCode, 413, rejected.body);
        assert.equal(
          json<{ error: { code: string } }>(rejected).error.code,
          'FILE_TOO_LARGE',
        );

        const mediaId = String(
          json<{ data: Record<string, unknown> }>(accepted).data.id,
        );
        const deleted = await atLimit.inject({
          method: 'DELETE',
          url: `${BASE}/${mediaId}`,
          headers: { cookie: atCookie },
        });
        assert.equal(deleted.statusCode, 200, deleted.body);
        assert.equal(await prisma.mediaAsset.count(), before);
      } finally {
        await atLimit.close();
        await underLimit.close();
      }
    });

    test('invalid sort/order are rejected with 400 instead of being ignored', async () => {
      const app = makeApp();
      try {
        const adminCookie = await login(app, ADMIN_EMAIL);

        for (const url of [
          `${BASE}?sort=bogus`,
          `${BASE}?sort=createdAt&order=sideways`,
        ]) {
          const res = await app.inject({
            method: 'GET',
            url,
            headers: { cookie: adminCookie },
          });
          assert.equal(res.statusCode, 400, `${url} -> ${res.body}`);
          assert.equal(
            json<{ error: { code: string } }>(res).error.code,
            'VALIDATION_ERROR',
          );
        }

        // A valid sort/order still succeeds.
        const valid = await app.inject({
          method: 'GET',
          url: `${BASE}?sort=createdAt&order=asc`,
          headers: { cookie: adminCookie },
        });
        assert.equal(valid.statusCode, 200, valid.body);
      } finally {
        await app.close();
      }
    });

    test('a storage-provider swap keeps the domain model off the filesystem', async () => {
      const storage = new InMemoryStorage();
      const service = createMediaService({
        storage,
        maxUploadBytes: 10 * 1024 * 1024,
      });
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: ADMIN_EMAIL },
      });
      const image = await png(1600, 900);

      const media: MediaDto = await service.upload(
        { filename: 'provider-swap.png', mimeType: 'image/png', data: image },
        {},
        admin.id,
      );

      try {
        assert.equal(media.provider, 'memory-test');
        assert.equal(media.url, `https://memory.example/${media.storageKey}`);
        assert.ok(
          media.variants.length > 0,
          'a large image must produce variants through the active provider',
        );
        for (const variant of media.variants as MediaVariantDto[]) {
          assert.equal(
            variant.url,
            `https://memory.example/${variant.storageKey}`,
          );
        }
      } finally {
        await service.delete(media.id, true, admin.id);
      }

      assert.equal(
        await prisma.mediaAsset.findUnique({ where: { id: media.id } }),
        null,
      );
    });
  },
);