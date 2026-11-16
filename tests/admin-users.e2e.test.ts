/**
 * Phase 10D1 — administration backend e2e (docs/08 §8–§9, §21; docs/11 §9).
 *
 * Proves against a real PostgreSQL database that:
 *   - every admin endpoint is permission-guarded (401 anonymous, 403 without
 *     the exact permission) and authorization is server-side;
 *   - users can be listed/filtered, read, created (Argon2id), patched and
 *     disabled, and no response ever contains `passwordHash`;
 *   - disabling revokes the target's sessions immediately;
 *   - the last active ADMIN can never be disabled, deactivated or demoted;
 *   - roles expose their permission matrix, the vocabulary endpoint is stable
 *     and a role update replaces grants while protecting ADMIN's `roles.update`;
 *   - every user/role mutation is written to `audit_logs` and the audit read
 *     endpoint paginates, filters and orders newest-first.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. All rows
 * created by the suite are removed and the original state of other ADMIN users
 * is restored in teardown.
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
let verifyPassword!: typeof import('@server/auth/password').verifyPassword;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword, verifyPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'Admin-Phase10D1-Passw0rd!';
const ADMIN_EMAIL = `admin10d1-a-${RUN}@uci.local`;
const ADMIN_TWO_EMAIL = `admin10d1-b-${RUN}@uci.local`;
const READER_EMAIL = `admin10d1-reader-${RUN}@uci.local`;
const NO_ROLE_EMAIL = `admin10d1-norole-${RUN}@uci.local`;
const CREATED_EMAIL = `admin10d1-created-${RUN}@uci.local`;
const DISABLED_EMAIL = `admin10d1-disabled-${RUN}@uci.local`;
const ALIAS_EMAIL = `admin10d1-alias-${RUN}@uci.local`;
const EXTRA_EMAIL = `admin10d1-extra-${RUN}@uci.local`;

const TEST_EMAILS = [
  ADMIN_EMAIL,
  ADMIN_TWO_EMAIL,
  READER_EMAIL,
  NO_ROLE_EMAIL,
  CREATED_EMAIL,
  DISABLED_EMAIL,
  ALIAS_EMAIL,
  EXTRA_EMAIL,
];

let adminUserId: string;
let adminTwoUserId: string;
let readerRoleId: string;
let extraRoleId: string;
let createdUserId: string;
const deactivatedAdminIds: string[] = [];

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
  assert.equal(res.statusCode, 200, `login failed for ${email}: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, 'expected a Set-Cookie header');
  return header.split(';')[0]!;
}

async function loginOnce(email: string): Promise<string> {
  const app = makeApp();
  try {
    return await login(app, email);
  } finally {
    await app.close();
  }
}

interface CallResult {
  statusCode: number;
  body: string;
}

async function get(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): Promise<CallResult> {
  const res = await app.inject({
    method: 'GET',
    url,
    ...(cookie ? { headers: { cookie } } : {}),
  });
  return { statusCode: res.statusCode, body: res.body };
}

async function post(
  app: FastifyInstance,
  url: string,
  cookie: string | undefined,
  payload?: unknown,
): Promise<CallResult> {
  const res = await app.inject({
    method: 'POST',
    url,
    ...(cookie ? { headers: { cookie } } : {}),
    ...(payload === undefined
      ? {}
      : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body };
}

async function patch(
  app: FastifyInstance,
  url: string,
  cookie: string | undefined,
  payload: unknown,
): Promise<CallResult> {
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

function dataOf<T = Record<string, unknown>>(body: string): T {
  return (JSON.parse(body) as { data: T }).data;
}

function metaOf(body: string): Record<string, number> {
  return (JSON.parse(body) as { meta: Record<string, number> }).meta;
}

function assertNoPasswordHash(body: string): void {
  assert.equal(
    body.includes('passwordHash'),
    false,
    'no response may expose a password hash',
  );
}

async function ensureAdminRole(): Promise<string> {
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
  return admin.id;
}

async function ensureRole(
  name: string,
  permissions: readonly PermissionName[],
): Promise<string> {
  const role = await prisma.role.upsert({
    where: { name },
    update: {},
    create: { name, description: `E2E role ${name}` },
  });
  for (const permissionName of permissions) {
    const permission = await prisma.permission.upsert({
      where: { name: permissionName },
      update: {},
      create: { name: permissionName },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role.id;
}

async function createUser(
  email: string,
  roleIds: string[],
): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true },
    create: {
      email,
      passwordHash,
      firstName: 'Admin',
      lastName: 'E2E',
      active: true,
    },
  });
  for (const roleId of roleIds) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }
  return user.id;
}

describe(
  'admin users/roles/permissions/audit e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    let adminCookie: string;
    let adminTwoCookie: string;
    let readerCookie: string;
    let noRoleCookie: string;

    before(async () => {
      const adminRoleId = await ensureAdminRole();
      readerRoleId = await ensureRole(`ADMIN10D1_READER_${RUN}`, [
        'users.read',
      ]);
      extraRoleId = await ensureRole(`ADMIN10D1_EXTRA_${RUN}`, [
        'users.read',
        'roles.read',
      ]);

      adminUserId = await createUser(ADMIN_EMAIL, [adminRoleId]);
      adminTwoUserId = await createUser(ADMIN_TWO_EMAIL, [adminRoleId]);
      await createUser(READER_EMAIL, [readerRoleId]);
      await createUser(NO_ROLE_EMAIL, []);

      // Make the two suite admins the only ACTIVE admins so the
      // "last active ADMIN" safeguard is deterministic. The original state is
      // restored in `after`.
      const otherAdmins = await prisma.user.findMany({
        where: {
          active: true,
          email: { notIn: TEST_EMAILS },
          roles: { some: { role: { name: 'ADMIN' } } },
        },
        select: { id: true },
      });
      for (const other of otherAdmins) deactivatedAdminIds.push(other.id);
      if (deactivatedAdminIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: deactivatedAdminIds } },
          data: { active: false },
        });
      }

      adminCookie = await loginOnce(ADMIN_EMAIL);
      adminTwoCookie = await loginOnce(ADMIN_TWO_EMAIL);
      readerCookie = await loginOnce(READER_EMAIL);
      noRoleCookie = await loginOnce(NO_ROLE_EMAIL);
    });

    after(async () => {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: [adminUserId, adminTwoUserId] } },
      });
      await prisma.session.deleteMany({
        where: { user: { email: { in: TEST_EMAILS } } },
      });
      const users = await prisma.user.findMany({
        where: { email: { in: TEST_EMAILS } },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);
      await prisma.userRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });

      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: [readerRoleId, extraRoleId] } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: [readerRoleId, extraRoleId] } },
      });

      if (deactivatedAdminIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: deactivatedAdminIds } },
          data: { active: true },
        });
      }
      await prisma.$disconnect();
    });

    test('every admin endpoint requires authentication and its exact permission', async () => {
      const app = makeApp();
      try {
        const reads = [
          '/api/v1/admin/users',
          '/api/v1/admin/roles',
          '/api/v1/admin/permissions',
          '/api/v1/admin/audit',
        ];
        for (const url of reads) {
          const anonymous = await get(app, url);
          assert.equal(anonymous.statusCode, 401, `${url}: ${anonymous.body}`);
          assert.equal(errorCode(anonymous.body), 'UNAUTHORIZED');
        }

        const anonymousCreate = await post(app, '/api/v1/admin/users', undefined, {
          email: 'x@y.co',
          name: 'X',
          password: 'long-enough-pass',
        });
        assert.equal(anonymousCreate.statusCode, 401);

        for (const url of ['/api/v1/admin/users', '/api/v1/admin/roles', '/api/v1/admin/audit']) {
          const forbidden = await get(app, url, noRoleCookie);
          assert.equal(forbidden.statusCode, 403, `${url}: ${forbidden.body}`);
          assert.equal(errorCode(forbidden.body), 'FORBIDDEN');
        }

        // users.read alone can read users, but nothing else.
        const list = await get(app, '/api/v1/admin/users', readerCookie);
        assert.equal(list.statusCode, 200, list.body);
        for (const url of ['/api/v1/admin/roles', '/api/v1/admin/permissions', '/api/v1/admin/audit']) {
          const forbidden = await get(app, url, readerCookie);
          assert.equal(forbidden.statusCode, 403, `${url}: ${forbidden.body}`);
        }

        const createForbidden = await post(
          app,
          '/api/v1/admin/users',
          readerCookie,
          { email: 'x@y.co', name: 'X', password: 'long-enough-pass' },
        );
        assert.equal(createForbidden.statusCode, 403);

        const rolesPatchForbidden = await patch(
          app,
          `/api/v1/admin/roles/${extraRoleId}`,
          readerCookie,
          { permissions: ['users.read'] },
        );
        assert.equal(rolesPatchForbidden.statusCode, 403);
      } finally {
        await app.close();
      }
    });

    test('lists users with filters, pagination and roles but never a hash', async () => {
      const app = makeApp();
      try {
        const res = await get(
          app,
          '/api/v1/admin/users?search=admin10d1-a-&limit=5',
          adminCookie,
        );
        assert.equal(res.statusCode, 200, res.body);
        assertNoPasswordHash(res.body);

        const data = dataOf<Array<Record<string, unknown>>>(res.body);
        const meta = metaOf(res.body);
        assert.deepEqual(Object.keys(meta).sort(), [
          'limit',
          'page',
          'total',
          'totalPages',
        ]);
        assert.equal(meta.limit, 5);
        assert.equal(meta.page, 1);

        const user = data.find((row) => row.email === ADMIN_EMAIL);
        assert.ok(user, 'the suite admin is listed');
        assert.deepEqual(Object.keys(user).sort(), [
          'active',
          'createdAt',
          'email',
          'firstName',
          'id',
          'lastName',
          'name',
          'roles',
          'updatedAt',
        ]);
        assert.equal(user.active, true);
        assert.equal(typeof user.name, 'string');
        assert.equal(user.id, adminUserId);

        const roles = user.roles as Array<Record<string, unknown>>;
        assert.deepEqual(Object.keys(roles[0]!).sort(), [
          'description',
          'id',
          'name',
        ]);
        assert.equal(roles[0]!.name, 'ADMIN');
        assert.equal(roles[0]!.id, (await prisma.role.findUnique({
          where: { name: 'ADMIN' },
        }))!.id);

        const byRole = await get(
          app,
          `/api/v1/admin/users?role=${encodeURIComponent(`ADMIN10D1_READER_${RUN}`)}`,
          adminCookie,
        );
        assert.equal(byRole.statusCode, 200, byRole.body);
        const byRoleData = dataOf<Array<Record<string, unknown>>>(byRole.body);
        assert.ok(byRoleData.every((row) => row.email === READER_EMAIL));

        const active = await get(app, '/api/v1/admin/users?active=false', adminCookie);
        assert.equal(active.statusCode, 200, active.body);
        for (const row of dataOf<Array<Record<string, unknown>>>(active.body)) {
          assert.equal(row.active, false);
        }

        // docs/08 §8.1 `status` is an alias of `active` and must actually
        // filter, never be silently ignored.
        const activeStatus = await get(
          app,
          '/api/v1/admin/users?status=ACTIVE&search=admin10d1-a-',
          adminCookie,
        );
        assert.equal(activeStatus.statusCode, 200, activeStatus.body);
        const activeStatusRows =
          dataOf<Array<Record<string, unknown>>>(activeStatus.body);
        assert.ok(activeStatusRows.length >= 1);
        for (const row of activeStatusRows) assert.equal(row.active, true);

        const inactiveStatus = await get(
          app,
          '/api/v1/admin/users?status=inactive&search=admin10d1-a-',
          adminCookie,
        );
        assert.equal(inactiveStatus.statusCode, 200, inactiveStatus.body);
        assert.deepEqual(dataOf<unknown[]>(inactiveStatus.body), []);
        assert.equal(metaOf(inactiveStatus.body).total, 0);

        const invalidStatus = await get(
          app,
          '/api/v1/admin/users?status=PENDING',
          adminCookie,
        );
        assert.equal(invalidStatus.statusCode, 400, invalidStatus.body);
        assert.equal(errorCode(invalidStatus.body), 'VALIDATION_ERROR');
      } finally {
        await app.close();
      }
    });

    test('reads a user by id and answers 404 for an unknown id', async () => {
      const app = makeApp();
      try {
        const res = await get(
          app,
          `/api/v1/admin/users/${adminUserId}`,
          adminCookie,
        );
        assert.equal(res.statusCode, 200, res.body);
        assertNoPasswordHash(res.body);
        const user = dataOf<Record<string, unknown>>(res.body);
        assert.equal(user.id, adminUserId);
        assert.equal(user.email, ADMIN_EMAIL);

        const missing = await get(
          app,
          `/api/v1/admin/users/${randomUUID()}`,
          adminCookie,
        );
        assert.equal(missing.statusCode, 404);
        assert.equal(errorCode(missing.body), 'NOT_FOUND');
      } finally {
        await app.close();
      }
    });

    test('creates a user with Argon2id, assigns roles, rejects duplicates and invalid input', async () => {
      const app = makeApp();
      try {
        const res = await post(app, '/api/v1/admin/users', adminCookie, {
          email: `  ${CREATED_EMAIL.toUpperCase()}  `,
          name: '  Usuario Creado  ',
          password: PASSWORD,
          roles: [`ADMIN10D1_EXTRA_${RUN}`],
        });
        assert.equal(res.statusCode, 201, res.body);
        assertNoPasswordHash(res.body);

        const user = dataOf<Record<string, unknown>>(res.body);
        createdUserId = String(user.id);
        assert.equal(user.email, CREATED_EMAIL);
        assert.equal(user.name, 'Usuario Creado');
        assert.equal(user.active, true);
        const roles = user.roles as Array<Record<string, unknown>>;
        assert.equal(roles.length, 1);
        assert.equal(roles[0]!.name, `ADMIN10D1_EXTRA_${RUN}`);

        const stored = await prisma.user.findUnique({
          where: { id: createdUserId },
        });
        assert.ok(stored);
        assert.notEqual(stored.passwordHash, PASSWORD);
        assert.equal(await verifyPassword(stored.passwordHash, PASSWORD), true);

        const duplicate = await post(app, '/api/v1/admin/users', adminCookie, {
          email: CREATED_EMAIL,
          name: 'Duplicate',
          password: PASSWORD,
        });
        assert.equal(duplicate.statusCode, 409);
        assert.equal(errorCode(duplicate.body), 'CONFLICT');

        // docs/08 §8.3 body: singular `role` and `status` aliases.
        const aliased = await post(app, '/api/v1/admin/users', adminCookie, {
          email: `  ${ALIAS_EMAIL.toUpperCase()}  `,
          name: 'Alias Creado',
          password: PASSWORD,
          role: `ADMIN10D1_READER_${RUN}`,
          status: 'INACTIVE',
        });
        assert.equal(aliased.statusCode, 201, aliased.body);
        const aliasedUser = dataOf<Record<string, unknown>>(aliased.body);
        assert.equal(aliasedUser.email, ALIAS_EMAIL);
        assert.equal(aliasedUser.active, false);
        assert.deepEqual(
          (aliasedUser.roles as Array<Record<string, unknown>>).map(
            (role) => role.name,
          ),
          [`ADMIN10D1_READER_${RUN}`],
        );

        const unknownRoleAlias = await post(
          app,
          '/api/v1/admin/users',
          adminCookie,
          {
            email: `admin10d1-alias-unknown-${RUN}@uci.local`,
            name: 'Alias Unknown',
            password: PASSWORD,
            role: `DOES_NOT_EXIST_${RUN}`,
          },
        );
        assert.equal(unknownRoleAlias.statusCode, 400);
        assert.equal(errorCode(unknownRoleAlias.body), 'VALIDATION_ERROR');

        const unknownRole = await post(app, '/api/v1/admin/users', adminCookie, {
          email: `admin10d1-unknown-${RUN}@uci.local`,
          name: 'Unknown Role',
          password: PASSWORD,
          roles: [`DOES_NOT_EXIST_${RUN}`],
        });
        assert.equal(unknownRole.statusCode, 400);
        assert.equal(errorCode(unknownRole.body), 'VALIDATION_ERROR');

        const badPayloads: unknown[] = [
          {},
          { email: 'bad', name: 'X', password: PASSWORD },
          { email: `ok-${RUN}@uci.local`, name: 'X', password: 'short' },
          { email: `ok-${RUN}@uci.local`, name: 'X', password: PASSWORD, roles: 'ADMIN' },
          { email: `ok-${RUN}@uci.local`, name: 'X', password: PASSWORD, passwordHash: 'x' },
        ];
        for (const payload of badPayloads) {
          const bad = await post(app, '/api/v1/admin/users', adminCookie, payload);
          assert.equal(bad.statusCode, 400, JSON.stringify(payload));
          assert.equal(errorCode(bad.body), 'VALIDATION_ERROR');
        }
        assert.equal(
          await prisma.user.count({
            where: { email: `admin10d1-unknown-${RUN}@uci.local` },
          }),
          0,
          'a rejected create never persists a user',
        );

        const audit = await prisma.auditLog.findFirst({
          where: { actorId: adminUserId, action: 'user.create', entityId: createdUserId },
        });
        assert.ok(audit, 'user.create is audited');
        assert.equal(audit.entityType, 'USER');
      } finally {
        await app.close();
      }
    });

    test('patches name, active and roles, never the password', async () => {
      const app = makeApp();
      try {
        const renamed = await patch(
          app,
          `/api/v1/admin/users/${createdUserId}`,
          adminCookie,
          { name: '  Nombre Editado  ', active: true },
        );
        assert.equal(renamed.statusCode, 200, renamed.body);
        assertNoPasswordHash(renamed.body);
        assert.equal(dataOf<Record<string, unknown>>(renamed.body).name, 'Nombre Editado');

        const reroled = await patch(
          app,
          `/api/v1/admin/users/${createdUserId}`,
          adminCookie,
          { roles: [`ADMIN10D1_READER_${RUN}`] },
        );
        assert.equal(reroled.statusCode, 200, reroled.body);
        const roles = dataOf<Record<string, unknown>>(reroled.body).roles as Array<
          Record<string, unknown>
        >;
        assert.deepEqual(
          roles.map((role) => role.name),
          [`ADMIN10D1_READER_${RUN}`],
        );

        const passwordPatch = await patch(
          app,
          `/api/v1/admin/users/${createdUserId}`,
          adminCookie,
          { password: 'another-long-password' },
        );
        assert.equal(passwordPatch.statusCode, 400);
        assert.equal(errorCode(passwordPatch.body), 'VALIDATION_ERROR');

        const unknownRole = await patch(
          app,
          `/api/v1/admin/users/${createdUserId}`,
          adminCookie,
          { roles: [`NOPE_${RUN}`] },
        );
        assert.equal(unknownRole.statusCode, 400);

        const missing = await patch(
          app,
          `/api/v1/admin/users/${randomUUID()}`,
          adminCookie,
          { name: 'Nobody' },
        );
        assert.equal(missing.statusCode, 404);

        const audit = await prisma.auditLog.findFirst({
          where: {
            actorId: adminUserId,
            action: 'user.update',
            entityId: createdUserId,
          },
          orderBy: { createdAt: 'desc' },
        });
        assert.ok(audit, 'user.update is audited');
      } finally {
        await app.close();
      }
    });

    test('disables an account, revokes its sessions and blocks its login', async () => {
      const created = await post(makeApp(), '/api/v1/admin/users', adminCookie, {
        email: DISABLED_EMAIL,
        name: 'Para Deshabilitar',
        password: PASSWORD,
        roles: [`ADMIN10D1_READER_${RUN}`],
      });
      assert.equal(created.statusCode, 201, created.body);
      const targetId = String(dataOf<Record<string, unknown>>(created.body).id);

      const targetCookie = await loginOnce(DISABLED_EMAIL);
      assert.ok(targetCookie.length > 0);
      const activeSession = await prisma.session.findFirst({
        where: { userId: targetId, revokedAt: null },
      });
      assert.ok(activeSession, 'the target has an active session before disable');

      const app = makeApp();
      try {
        const disabled = await post(
          app,
          `/api/v1/admin/users/${targetId}/disable`,
          adminCookie,
        );
        assert.equal(disabled.statusCode, 200, disabled.body);
        assertNoPasswordHash(disabled.body);
        const user = dataOf<Record<string, unknown>>(disabled.body);
        assert.equal(user.active, false);

        const revoked = await prisma.session.findFirst({
          where: { userId: targetId },
          orderBy: { createdAt: 'desc' },
        });
        assert.ok(revoked?.revokedAt, 'disable revokes the active session');

        const relogin = await post(app, '/api/v1/auth/login', undefined, {
          email: DISABLED_EMAIL,
          password: PASSWORD,
        });
        assert.equal(relogin.statusCode, 401, 'a disabled account cannot log in');

        const audit = await prisma.auditLog.findFirst({
          where: { actorId: adminUserId, action: 'user.disable', entityId: targetId },
        });
        assert.ok(audit, 'user.disable is audited');

        // Re-enable so the row does not linger disabled for later assertions.
        const reenabled = await patch(
          app,
          `/api/v1/admin/users/${targetId}`,
          adminCookie,
          { active: true },
        );
        assert.equal(reenabled.statusCode, 200, reenabled.body);
      } finally {
        await app.close();
      }
    });

    test('never disables, deactivates or demotes the last active ADMIN', async () => {
      const app = makeApp();
      try {
        const disableSecond = await post(
          app,
          `/api/v1/admin/users/${adminTwoUserId}/disable`,
          adminCookie,
        );
        assert.equal(disableSecond.statusCode, 200, disableSecond.body);
        assert.equal(
          dataOf<Record<string, unknown>>(disableSecond.body).active,
          false,
        );

        const disableLast = await post(
          app,
          `/api/v1/admin/users/${adminUserId}/disable`,
          adminCookie,
        );
        assert.equal(disableLast.statusCode, 409, disableLast.body);
        assert.equal(errorCode(disableLast.body), 'CONFLICT');
        assert.equal(
          (JSON.parse(disableLast.body) as { error: { details?: { reason?: string } } })
            .error.details?.reason,
          'LAST_ACTIVE_ADMIN',
        );

        const deactivateLast = await patch(
          app,
          `/api/v1/admin/users/${adminUserId}`,
          adminCookie,
          { active: false },
        );
        assert.equal(deactivateLast.statusCode, 409, deactivateLast.body);
        assert.equal(errorCode(deactivateLast.body), 'CONFLICT');

        const demoteLast = await patch(
          app,
          `/api/v1/admin/users/${adminUserId}`,
          adminCookie,
          { roles: [] },
        );
        assert.equal(demoteLast.statusCode, 409, demoteLast.body);

        const stillAdmin = await prisma.user.findUnique({
          where: { id: adminUserId },
          include: { roles: { include: { role: true } } },
        });
        assert.equal(stillAdmin?.active, true);
        assert.deepEqual(
          stillAdmin?.roles.map((link) => link.role.name),
          ['ADMIN'],
        );

        const harmless = await patch(
          app,
          `/api/v1/admin/users/${adminUserId}`,
          adminCookie,
          { name: 'Admin Renombrado' },
        );
        assert.equal(harmless.statusCode, 200, harmless.body);

        const restore = await patch(
          app,
          `/api/v1/admin/users/${adminTwoUserId}`,
          adminCookie,
          { active: true },
        );
        assert.equal(restore.statusCode, 200, restore.body);
      } finally {
        await app.close();
      }
    });

    test('exposes roles with their permission matrix and the canonical vocabulary', async () => {
      const app = makeApp();
      try {
        const rolesRes = await get(app, '/api/v1/admin/roles', adminCookie);
        assert.equal(rolesRes.statusCode, 200, rolesRes.body);
        const roles = dataOf<Array<Record<string, unknown>>>(rolesRes.body);
        const adminRole = roles.find((role) => role.name === 'ADMIN');
        assert.ok(adminRole, 'ADMIN is listed');
        assert.deepEqual(Object.keys(adminRole).sort(), [
          'createdAt',
          'description',
          'id',
          'name',
          'permissions',
          'updatedAt',
        ]);
        const permissions = adminRole.permissions as Array<Record<string, unknown>>;
        assert.equal(permissions.length, ALL_PERMISSIONS.length);
        for (const permission of permissions) {
          assert.deepEqual(Object.keys(permission).sort(), ['description', 'name']);
          assert.ok(
            ALL_PERMISSIONS.includes(permission.name as PermissionName),
            `unexpected permission ${String(permission.name)}`,
          );
        }

        const permissionsRes = await get(
          app,
          '/api/v1/admin/permissions',
          adminCookie,
        );
        assert.equal(permissionsRes.statusCode, 200, permissionsRes.body);
        const vocabulary = dataOf<Array<Record<string, unknown>>>(permissionsRes.body);
        assert.deepEqual(
          vocabulary.map((permission) => permission.name),
          [...ALL_PERMISSIONS],
        );
      } finally {
        await app.close();
      }
    });

    test('updates a role grant set, validates the vocabulary and protects ADMIN', async () => {
      const app = makeApp();
      try {
        // Make the stale `updatedAt` deterministic: a grant change must bump
        // the role's own timestamp, not only the RolePermission rows.
        const staleUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
        await prisma.role.update({
          where: { id: extraRoleId },
          data: { updatedAt: staleUpdatedAt },
        });

        const updated = await patch(
          app,
          `/api/v1/admin/roles/${extraRoleId}`,
          adminCookie,
          { permissions: ['users.read', 'roles.read', 'users.read'] },
        );
        assert.equal(updated.statusCode, 200, updated.body);
        const role = dataOf<Record<string, unknown>>(updated.body);
        assert.deepEqual(
          (role.permissions as Array<Record<string, unknown>>).map(
            (permission) => permission.name,
          ),
          ['users.read', 'roles.read'],
        );
        const bumpedUpdatedAt = String(role.updatedAt);
        assert.ok(
          new Date(bumpedUpdatedAt).getTime() > staleUpdatedAt.getTime(),
          `role.updatedAt must advance on a grant change (got ${bumpedUpdatedAt})`,
        );

        const grants = await prisma.rolePermission.findMany({
          where: { roleId: extraRoleId },
          include: { permission: true },
        });
        assert.deepEqual(
          grants.map((grant) => grant.permission.name).sort(),
          ['roles.read', 'users.read'],
        );

        const unknown = await patch(
          app,
          `/api/v1/admin/roles/${extraRoleId}`,
          adminCookie,
          { permissions: ['users.read', 'not.a.permission'] },
        );
        assert.equal(unknown.statusCode, 400);
        assert.equal(errorCode(unknown.body), 'VALIDATION_ERROR');
        const unchanged = await prisma.rolePermission.count({
          where: { roleId: extraRoleId },
        });
        assert.equal(unchanged, 2, 'a rejected update never mutates grants');
        const afterRejected = await prisma.role.findUnique({
          where: { id: extraRoleId },
          select: { updatedAt: true },
        });
        assert.equal(
          afterRejected?.updatedAt.toISOString(),
          new Date(bumpedUpdatedAt).toISOString(),
          'a rejected update never bumps role.updatedAt',
        );

        const adminRole = await prisma.role.findUnique({
          where: { name: 'ADMIN' },
        });
        assert.ok(adminRole);
        const stripped = await patch(
          app,
          `/api/v1/admin/roles/${adminRole.id}`,
          adminCookie,
          { permissions: ['users.read'] },
        );
        assert.equal(stripped.statusCode, 409, stripped.body);
        assert.equal(errorCode(stripped.body), 'CONFLICT');
        assert.equal(
          (JSON.parse(stripped.body) as { error: { details?: { reason?: string } } })
            .error.details?.reason,
          'ADMIN_CRITICAL_PERMISSION',
        );
        const adminGrants = await prisma.rolePermission.count({
          where: { roleId: adminRole.id },
        });
        assert.equal(
          adminGrants,
          ALL_PERMISSIONS.length,
          'the rejected ADMIN update leaves its grants intact',
        );

        const missing = await patch(
          app,
          `/api/v1/admin/roles/${randomUUID()}`,
          adminCookie,
          { permissions: ['users.read'] },
        );
        assert.equal(missing.statusCode, 404);

        const audit = await prisma.auditLog.findFirst({
          where: { actorId: adminUserId, action: 'role.update', entityId: extraRoleId },
          orderBy: { createdAt: 'desc' },
        });
        assert.ok(audit, 'role.update is audited');
        assert.equal(audit.entityType, 'ROLE');
      } finally {
        await app.close();
      }
    });

    test('reads the audit trail newest-first with precise filters', async () => {
      const app = makeApp();
      try {
        const all = await get(app, '/api/v1/admin/audit?limit=100', adminCookie);
        assert.equal(all.statusCode, 200, all.body);
        const rows = dataOf<Array<Record<string, unknown>>>(all.body);
        const meta = metaOf(all.body);
        assert.ok(meta.total >= 1, 'the suite produced audit rows');
        assert.equal(meta.limit, 100);
        for (let index = 1; index < rows.length; index += 1) {
          const previous = new Date(String(rows[index - 1]!.createdAt)).getTime();
          const current = new Date(String(rows[index]!.createdAt)).getTime();
          assert.ok(previous >= current, 'audit is ordered newest-first');
        }

        const created = await get(
          app,
          `/api/v1/admin/audit?actor=${adminUserId}&action=user.create&entityType=USER&entityId=${createdUserId}`,
          adminCookie,
        );
        assert.equal(created.statusCode, 200, created.body);
        const createdRows = dataOf<Array<Record<string, unknown>>>(created.body);
        assert.equal(createdRows.length, 1, created.body);
        assert.deepEqual(Object.keys(createdRows[0]!).sort(), [
          'action',
          'actor',
          'createdAt',
          'entityId',
          'entityType',
          'id',
          'metadata',
        ]);
        assert.equal(createdRows[0]!.action, 'user.create');
        assert.equal(createdRows[0]!.entityType, 'USER');
        assert.equal(createdRows[0]!.entityId, createdUserId);
        const actor = createdRows[0]!.actor as Record<string, unknown>;
        assert.deepEqual(Object.keys(actor).sort(), ['email', 'id', 'name']);
        assert.equal(actor.id, adminUserId);
        assert.equal(actor.email, ADMIN_EMAIL);
        assert.equal(JSON.stringify(createdRows[0]!).includes('password'), false);

        // docs/08 §21 aliases still resolve to the canonical filters.
        const aliased = await get(
          app,
          `/api/v1/admin/audit?user=${adminUserId}&action=user.create&resource=USER&resourceId=${createdUserId}`,
          adminCookie,
        );
        assert.equal(aliased.statusCode, 200, aliased.body);
        assert.equal(dataOf<unknown[]>(aliased.body).length, 1);

        const range = await get(
          app,
          '/api/v1/admin/audit?from=2000-01-01T00:00:00.000Z&to=2999-01-01T00:00:00.000Z',
          adminCookie,
        );
        assert.equal(range.statusCode, 200, range.body);
        assert.ok(metaOf(range.body).total >= 1);

        const invalidRange = await get(
          app,
          '/api/v1/admin/audit?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
          adminCookie,
        );
        assert.equal(invalidRange.statusCode, 400);
        assert.equal(errorCode(invalidRange.body), 'VALIDATION_ERROR');
      } finally {
        await app.close();
      }
    });
  },
);
