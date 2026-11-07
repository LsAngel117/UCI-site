/**
 * Phase 9A1 — public + admin settings end-to-end suite (docs/08 §17,
 * docs/11 §9).
 *
 * Proves against a real PostgreSQL database that:
 *   - GET /api/v1/settings/public is unauthenticated, returns the documented
 *     shape and never leaks internal fields;
 *   - the public-settings seed is idempotent (two runs → one row) and never
 *     overwrites editor changes;
 *   - GET/PATCH /api/v1/admin/settings enforce settings.read / settings.update
 *     (401 anonymous, 403 without permission, 200 with it);
 *   - PATCH validates strictly (400) and a rejected payload leaves stored
 *     settings untouched; a successful PATCH is audited as settings.update.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. Every
 * row created by the suite (and the original settings blob) is restored in
 * teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PermissionName } from '@shared/api';
import type { PrismaClient } from '@prisma/client';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];
let seedPublicSettings!: typeof import('../src/db/seed/settings').seedPublicSettings;
let PUBLIC_SETTINGS_KEY!: string;
let DEFAULT_PUBLIC_SETTINGS!: unknown;

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
  ({ seedPublicSettings } = await import('../src/db/seed/settings'));
  ({ PUBLIC_SETTINGS_KEY, DEFAULT_PUBLIC_SETTINGS } = await import(
    '@server/settings/store'
  ));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `settings-admin-${RUN}@uci.local`;
const READER_EMAIL = `settings-reader-${RUN}@uci.local`;
const NO_ROLE_EMAIL = `settings-norole-${RUN}@uci.local`;
const PASSWORD = 'Settings-Phase9A1-Passw0rd!';

const userEmails = [ADMIN_EMAIL, READER_EMAIL, NO_ROLE_EMAIL];
let adminUserId: string;
let readerRoleId: string;
let originalSetting: { value: unknown } | null = null;

function makeApp(): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
  });
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, `login failed: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, 'expected a Set-Cookie header');
  return header.split(';')[0]!;
}

function get(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): Promise<{ statusCode: number; body: string }> {
  return app
    .inject({
      method: 'GET',
      url,
      ...(cookie ? { headers: { cookie } } : {}),
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.body }));
}

async function patch(
  app: FastifyInstance,
  url: string,
  cookie: string | undefined,
  payload: unknown,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: 'PATCH',
    url,
    ...(cookie ? { headers: { cookie } } : {}),
    payload: payload as Record<string, unknown>,
  });
  return { statusCode: res.statusCode, body: res.body };
}

function errorCode(body: string): string {
  return (JSON.parse(body) as { error: { code: string } }).error.code;
}

function dataOf(body: string): Record<string, unknown> {
  return (JSON.parse(body) as { data: Record<string, unknown> }).data;
}

async function ensureRoles(): Promise<{ adminRoleId: string; readerRoleId: string }> {
  const admin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });

  const permissionIds = new Map<string, string>();
  for (const name of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    permissionIds.set(name, permission.id);
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: admin.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }

  // A role that can read settings but not update them: proves PATCH is guarded
  // by settings.update specifically, not by "any settings access".
  const reader = await prisma.role.upsert({
    where: { name: `SETTINGS_READER_${RUN}` },
    update: {},
    create: {
      name: `SETTINGS_READER_${RUN}`,
      description: 'Read-only settings role for the Phase 9A1 e2e suite',
    },
  });
  const readPermissionId = permissionIds.get('settings.read');
  assert.ok(readPermissionId, 'settings.read permission was seeded');
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: reader.id,
        permissionId: readPermissionId,
      },
    },
    update: {},
    create: { roleId: reader.id, permissionId: readPermissionId },
  });

  return { adminRoleId: admin.id, readerRoleId: reader.id };
}

async function createUser(
  email: string,
  roleId: string | null,
): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true },
    create: {
      email,
      passwordHash,
      firstName: 'Settings',
      lastName: 'E2E',
      active: true,
    },
  });
  if (roleId) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }
  return user.id;
}

describe(
  'public + admin settings e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    let adminCookie: string;
    let readerCookie: string;
    let noRoleCookie: string;

    before(async () => {
      const { adminRoleId, readerRoleId: createdReaderRoleId } =
        await ensureRoles();
      readerRoleId = createdReaderRoleId;
      adminUserId = await createUser(ADMIN_EMAIL, adminRoleId);
      await createUser(READER_EMAIL, readerRoleId);
      await createUser(NO_ROLE_EMAIL, null);

      originalSetting = await prisma.setting.findUnique({
        where: { key: PUBLIC_SETTINGS_KEY },
      });

      const adminApp = makeApp();
      const readerApp = makeApp();
      const noRoleApp = makeApp();
      try {
        adminCookie = await login(adminApp, ADMIN_EMAIL);
        readerCookie = await login(readerApp, READER_EMAIL);
        noRoleCookie = await login(noRoleApp, NO_ROLE_EMAIL);
      } finally {
        await adminApp.close();
        await readerApp.close();
        await noRoleApp.close();
      }
    });

    after(async () => {
      await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
      await prisma.session.deleteMany({
        where: { user: { email: { in: userEmails } } },
      });
      await prisma.userRole.deleteMany({
        where: {
          userId: {
            in: (
              await prisma.user.findMany({
                where: { email: { in: userEmails } },
                select: { id: true },
              })
            ).map((user) => user.id),
          },
        },
      });
      await prisma.user.deleteMany({
        where: { email: { in: userEmails } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: readerRoleId },
      });
      await prisma.role.deleteMany({ where: { id: readerRoleId } });

      if (originalSetting) {
        await prisma.setting.upsert({
          where: { key: PUBLIC_SETTINGS_KEY },
          update: { value: originalSetting.value as never },
          create: { key: PUBLIC_SETTINGS_KEY, value: originalSetting.value as never },
        });
      } else {
        await prisma.setting.deleteMany({ where: { key: PUBLIC_SETTINGS_KEY } });
      }
      await prisma.$disconnect();
    });

    test('seed is idempotent: two runs create one row and never overwrite edits', async () => {
      // Start from scratch to prove the "create" path.
      await prisma.setting.deleteMany({ where: { key: PUBLIC_SETTINGS_KEY } });
      await seedPublicSettings();
      await seedPublicSettings();

      const rows = await prisma.setting.findMany({
        where: { key: PUBLIC_SETTINGS_KEY },
      });
      assert.equal(rows.length, 1, 'the seed never duplicates the settings row');
      assert.deepEqual(rows[0]!.value, DEFAULT_PUBLIC_SETTINGS);

      // A third run must preserve an editor's saved value.
      const edited = {
        church: {
          name: 'Edited church',
          shortDescription: 'Edited copy',
          address: null,
          city: null,
          state: null,
        },
        schedule: [],
        socials: [],
        giving: { title: 'Edited', message: 'Edited', ctaLabel: 'Edited', url: null },
      };
      await prisma.setting.update({
        where: { key: PUBLIC_SETTINGS_KEY },
        data: { value: edited },
      });
      await seedPublicSettings();
      const afterEdit = await prisma.setting.findUnique({
        where: { key: PUBLIC_SETTINGS_KEY },
      });
      assert.deepEqual(afterEdit!.value, edited);

      // Restore the documented defaults for the remaining tests.
      await prisma.setting.update({
        where: { key: PUBLIC_SETTINGS_KEY },
        data: { value: DEFAULT_PUBLIC_SETTINGS as never },
      });
    });

    test('public settings are unauthenticated and expose only the documented shape', async () => {
      const app = makeApp();
      try {
        const res = await get(app, '/api/v1/settings/public');
        assert.equal(res.statusCode, 200, res.body);
        const data = dataOf(res.body);

        assert.deepEqual(Object.keys(data).sort(), [
          'church',
          'giving',
          'schedule',
          'socials',
        ]);

        const church = data.church as Record<string, unknown>;
        assert.deepEqual(church, {
          name: 'Iglesia UCI',
          shortDescription:
            'Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.',
          address: 'Dirección por confirmar',
          city: 'Villavicencio',
          state: 'Meta',
          phone: null,
          email: null,
          whatsapp: null,
        });

        const schedule = data.schedule as Array<Record<string, unknown>>;
        assert.equal(schedule.length, 2);
        for (const entry of schedule) {
          assert.deepEqual(Object.keys(entry).sort(), [
            'active',
            'dayOfWeek',
            'endTime',
            'name',
            'startTime',
          ]);
        }

        const socials = data.socials as Array<Record<string, unknown>>;
        assert.equal(socials.length, 3);
        for (const social of socials) {
          assert.deepEqual(Object.keys(social).sort(), [
            'label',
            'platform',
            'url',
          ]);
          assert.equal(social.url, null, 'unconfigured social URL stays null');
        }

        const giving = data.giving as Record<string, unknown>;
        assert.deepEqual(Object.keys(giving).sort(), [
          'ctaLabel',
          'message',
          'title',
          'url',
        ]);
        assert.equal(giving.url, null);

        // No internal keys/values leak through the public endpoint.
        for (const forbidden of ['id', 'key', 'createdAt', 'updatedAt', 'value']) {
          assert.equal(forbidden in data, false, `no "${forbidden}" at the root`);
        }
      } finally {
        await app.close();
      }
    });

    test('admin settings enforce settings.read / settings.update', async () => {
      const app = makeApp();
      try {
        const anonymous = await get(app, '/api/v1/admin/settings');
        assert.equal(anonymous.statusCode, 401);
        assert.equal(errorCode(anonymous.body), 'UNAUTHORIZED');

        const noRole = await get(app, '/api/v1/admin/settings', noRoleCookie);
        assert.equal(noRole.statusCode, 403);
        assert.equal(errorCode(noRole.body), 'FORBIDDEN');

        const reader = await get(app, '/api/v1/admin/settings', readerCookie);
        assert.equal(reader.statusCode, 200, reader.body);

        const admin = await get(app, '/api/v1/admin/settings', adminCookie);
        assert.equal(admin.statusCode, 200, admin.body);
        const adminData = dataOf(admin.body);
        assert.deepEqual(Object.keys(adminData).sort(), [
          'church',
          'giving',
          'schedule',
          'socials',
        ]);
        assert.deepEqual(adminData, DEFAULT_PUBLIC_SETTINGS);

        const anonPatch = await patch(app, '/api/v1/admin/settings', undefined, {
          giving: { title: 'x' },
        });
        assert.equal(anonPatch.statusCode, 401);

        const noRolePatch = await patch(
          app,
          '/api/v1/admin/settings',
          noRoleCookie,
          { giving: { title: 'x' } },
        );
        assert.equal(noRolePatch.statusCode, 403);

        const readerPatch = await patch(
          app,
          '/api/v1/admin/settings',
          readerCookie,
          { giving: { title: 'x' } },
        );
        assert.equal(readerPatch.statusCode, 403);
        assert.equal(errorCode(readerPatch.body), 'FORBIDDEN');
      } finally {
        await app.close();
      }
    });

    test('PATCH updates validated settings, audits, and the public DTO reflects it', async () => {
      const app = makeApp();
      try {
        const updated = await patch(app, '/api/v1/admin/settings', adminCookie, {
          church: {
            name: `Iglesia UCI ${RUN}`,
            address: 'Calle Falsa 123',
            phone: '+57 300 111 2233',
            email: 'contacto@uci.example.org',
            whatsapp: '+57 300 111 2233',
          },
          schedule: [
            {
              name: 'Servicio único',
              dayOfWeek: 0,
              startTime: '10:00',
              endTime: '12:00',
              active: true,
            },
          ],
          socials: [
            {
              platform: 'instagram',
              label: 'Instagram',
              url: 'https://instagram.com/uci',
            },
            { platform: 'facebook', label: 'Facebook', url: null },
          ],
          giving: { title: 'DAR CON ALEGRÍA' },
        });
        assert.equal(updated.statusCode, 200, updated.body);
        const data = dataOf(updated.body);

        const church = data.church as Record<string, unknown>;
        assert.equal(church.name, `Iglesia UCI ${RUN}`);
        assert.equal(church.address, 'Calle Falsa 123');
        assert.equal(church.city, 'Villavicencio', 'omitted fields are preserved');
        assert.equal(church.state, 'Meta');
        assert.equal(church.phone, '+57 300 111 2233');
        assert.equal(church.email, 'contacto@uci.example.org');
        assert.equal(church.whatsapp, '+57 300 111 2233');

        const schedule = data.schedule as Array<Record<string, unknown>>;
        assert.deepEqual(schedule, [
          {
            name: 'Servicio único',
            dayOfWeek: 0,
            startTime: '10:00',
            endTime: '12:00',
            active: true,
          },
        ]);

        const socials = data.socials as Array<Record<string, unknown>>;
        assert.deepEqual(socials, [
          {
            platform: 'instagram',
            label: 'Instagram',
            url: 'https://instagram.com/uci',
          },
          { platform: 'facebook', label: 'Facebook', url: null },
        ]);

        const giving = data.giving as Record<string, unknown>;
        assert.equal(giving.title, 'DAR CON ALEGRÍA');
        assert.equal(giving.url, null);
        assert.equal(
          giving.message,
          DEFAULT_PUBLIC_SETTINGS &&
            (DEFAULT_PUBLIC_SETTINGS as { giving: { message: string } }).giving
              .message,
          'omitted giving copy is preserved',
        );

        const reread = await get(app, '/api/v1/admin/settings', adminCookie);
        assert.deepEqual(dataOf(reread.body), data);

        const publicRes = await get(app, '/api/v1/settings/public');
        assert.equal(publicRes.statusCode, 200);
        const publicData = dataOf(publicRes.body);
        assert.equal(
          (publicData.church as Record<string, unknown>).name,
          `Iglesia UCI ${RUN}`,
        );
        assert.equal(
          (publicData.schedule as unknown[]).length,
          1,
          'public schedule reflects the update',
        );
        const publicChurch = publicData.church as Record<string, unknown>;
        assert.equal(publicChurch.phone, '+57 300 111 2233');
        assert.equal(publicChurch.email, 'contacto@uci.example.org');
        assert.equal(publicChurch.whatsapp, '+57 300 111 2233');

        const audit = await prisma.auditLog.findFirst({
          where: {
            actorId: adminUserId,
            action: 'settings.update',
            entityType: 'site',
          },
          orderBy: { createdAt: 'desc' },
        });
        assert.ok(audit, 'a successful PATCH records a settings.update audit row');
      } finally {
        await app.close();
      }
    });

    test('PATCH rejects invalid payloads with 400 and leaves stored settings unchanged', async () => {
      const app = makeApp();
      try {
        const before = await get(app, '/api/v1/admin/settings', adminCookie);
        assert.equal(before.statusCode, 200, before.body);
        const beforeData = dataOf(before.body);

        const invalidPayloads: unknown[] = [
          [],
          { notASection: {} },
          { church: { name: '   ' } },
          { church: { phone: 123 } },
          { church: 'Iglesia' },
          { schedule: {} },
          {
            schedule: [
              { name: 'Servicio', dayOfWeek: 7, startTime: '10:00', active: true },
            ],
          },
          {
            schedule: [
              { name: 'Servicio', dayOfWeek: 0, startTime: '9:00', active: true },
            ],
          },
          {
            schedule: [
              {
                name: 'Servicio',
                dayOfWeek: 0,
                startTime: '10:00',
                endTime: '25:00',
                active: true,
              },
            ],
          },
          { socials: [{ platform: 'x', label: 'X', url: 'javascript:alert(1)' }] },
          { socials: [{ platform: 'x', label: 'X', url: 'https://' }] },
          { giving: { url: 'ftp://example.org' } },
          { giving: { message: 'x'.repeat(1001) } },
        ];

        for (const payload of invalidPayloads) {
          const res = await patch(
            app,
            '/api/v1/admin/settings',
            adminCookie,
            payload,
          );
          assert.equal(
            res.statusCode,
            400,
            `expected 400 for ${JSON.stringify(payload)}, got ${res.statusCode} — ${res.body}`,
          );
          assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
        }

        const after = await get(app, '/api/v1/admin/settings', adminCookie);
        assert.deepEqual(
          dataOf(after.body),
          beforeData,
          'rejected payloads never mutate stored settings',
        );

        const empty = await patch(app, '/api/v1/admin/settings', adminCookie, {});
        assert.equal(empty.statusCode, 200, empty.body);
        assert.deepEqual(dataOf(empty.body), beforeData);
      } finally {
        await app.close();
      }
    });
  },
);
