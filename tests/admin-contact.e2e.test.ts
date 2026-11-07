/**
 * Phase 11A — admin contact inbox e2e (docs/08 §19, docs/11 §9).
 *
 * Proves against a real PostgreSQL database that:
 *   - every inbox route requires authentication and the exact permission
 *     (`contact.read` for list/get, `contact.manage` for the state transition);
 *   - the list paginates, filters by search/status/date and is newest-first;
 *   - a submission can be marked handled (and reopened) with `handledAt`
 *     derived server-side and the transition written to `audit_logs`;
 *   - the public `POST /api/v1/contact` still answers `201` while the
 *     best-effort notification pipeline is enabled.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. All rows
 * created by the suite are removed in teardown.
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

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'Phase11A-Passw0rd!';
const ADMIN_EMAIL = `contact11a-admin-${RUN}@uci.local`;
const READER_EMAIL = `contact11a-reader-${RUN}@uci.local`;
const MANAGER_EMAIL = `contact11a-manager-${RUN}@uci.local`;
const NO_ROLE_EMAIL = `contact11a-norole-${RUN}@uci.local`;
const TEST_EMAILS = [
  ADMIN_EMAIL,
  READER_EMAIL,
  MANAGER_EMAIL,
  NO_ROLE_EMAIL,
];

const SUBMISSION_PREFIX = `contact11a-${RUN}`;
const LIST_URL = '/api/v1/admin/contact-submissions';

let adminUserId: string;
let readerUserId: string;
let managerUserId: string;
let noRoleUserId: string;
let readerRoleId: string;
let managerRoleId: string;

const userIds: string[] = [];

function makeApp(extraEnv: Record<string, string> = {}): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      ...extraEnv,
    }),
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

async function createUser(email: string, roleIds: string[]): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true },
    create: {
      email,
      passwordHash,
      firstName: 'Contact',
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

interface SeedRow {
  id: string;
  email: string;
  createdAt: Date;
}

async function seedSubmission(
  suffix: string,
  createdAt: Date,
  status: 'NEW' | 'HANDLED' = 'NEW',
): Promise<SeedRow> {
  const email = `${SUBMISSION_PREFIX}-${suffix}@uci.test`;
  const row = await prisma.contactSubmission.create({
    data: {
      name: `Contacto ${suffix} ${RUN}`,
      email,
      message: `Mensaje ${SUBMISSION_PREFIX} ${suffix}`,
      status,
      ...(status === 'HANDLED' ? { handledAt: createdAt } : {}),
      createdAt,
    },
    select: { id: true, email: true, createdAt: true },
  });
  return row;
}

describe(
  'admin contact inbox e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    let adminCookie: string;
    let readerCookie: string;
    let managerCookie: string;
    let noRoleCookie: string;
    let first: SeedRow;
    let second: SeedRow;
    let third: SeedRow;

    before(async () => {
      const adminRoleId = await ensureAdminRole();
      readerRoleId = await ensureRole(`CONTACT11A_READER_${RUN}`, [
        'contact.read',
      ]);
      managerRoleId = await ensureRole(`CONTACT11A_MANAGER_${RUN}`, [
        'contact.read',
        'contact.manage',
      ]);

      adminUserId = await createUser(ADMIN_EMAIL, [adminRoleId]);
      readerUserId = await createUser(READER_EMAIL, [readerRoleId]);
      managerUserId = await createUser(MANAGER_EMAIL, [managerRoleId]);
      noRoleUserId = await createUser(NO_ROLE_EMAIL, []);
      userIds.push(adminUserId, readerUserId, managerUserId, noRoleUserId);

      adminCookie = await loginOnce(ADMIN_EMAIL);
      readerCookie = await loginOnce(READER_EMAIL);
      managerCookie = await loginOnce(MANAGER_EMAIL);
      noRoleCookie = await loginOnce(NO_ROLE_EMAIL);

      first = await seedSubmission('first', new Date('2026-01-01T10:00:00.000Z'));
      second = await seedSubmission(
        'second',
        new Date('2026-01-02T10:00:00.000Z'),
        'HANDLED',
      );
      third = await seedSubmission('third', new Date('2026-01-03T10:00:00.000Z'));
    });

    after(async () => {
      await prisma.contactSubmission.deleteMany({
        where: { email: { startsWith: SUBMISSION_PREFIX } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          action: 'auth.login_failed',
          entityType: 'AUTH',
          OR: TEST_EMAILS.map((email) => ({
            metadata: { path: ['email'], equals: email },
          })),
        },
      });
      await prisma.session.deleteMany({
        where: { user: { email: { in: TEST_EMAILS } } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: [readerRoleId, managerRoleId] } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: [readerRoleId, managerRoleId] } },
      });
      await prisma.$disconnect();
    });

    test('every inbox route requires authentication and its exact permission', async () => {
      const app = makeApp();
      try {
        const anonymousList = await get(app, LIST_URL);
        assert.equal(anonymousList.statusCode, 401, anonymousList.body);
        assert.equal(errorCode(anonymousList.body), 'UNAUTHORIZED');

        const anonymousOne = await get(app, `${LIST_URL}/${first.id}`);
        assert.equal(anonymousOne.statusCode, 401, anonymousOne.body);

        const noRole = await get(app, LIST_URL, noRoleCookie);
        assert.equal(noRole.statusCode, 403, noRole.body);
        assert.equal(errorCode(noRole.body), 'FORBIDDEN');

        const readerList = await get(app, LIST_URL, readerCookie);
        assert.equal(readerList.statusCode, 200, readerList.body);

        const readerOne = await get(app, `${LIST_URL}/${first.id}`, readerCookie);
        assert.equal(readerOne.statusCode, 200, readerOne.body);

        const readerPatch = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          readerCookie,
          { status: 'HANDLED' },
        );
        assert.equal(readerPatch.statusCode, 403, readerPatch.body);
        assert.equal(errorCode(readerPatch.body), 'FORBIDDEN');

        const anonymousPatch = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          undefined,
          { status: 'HANDLED' },
        );
        assert.equal(anonymousPatch.statusCode, 401, anonymousPatch.body);
      } finally {
        await app.close();
      }
    });

    test('lists newest-first with search, status, date filters and pagination', async () => {
      const app = makeApp();
      try {
        const all = await get(
          app,
          `${LIST_URL}?search=${SUBMISSION_PREFIX}`,
          readerCookie,
        );
        assert.equal(all.statusCode, 200, all.body);
        const rows = dataOf<Array<Record<string, unknown>>>(all.body);
        assert.equal(rows.length, 3);
        assert.deepEqual(
          rows.map((row) => row.id),
          [third.id, second.id, first.id],
          'newest-first ordering',
        );
        assert.deepEqual(Object.keys(rows[0]!).sort(), [
          'createdAt',
          'email',
          'handledAt',
          'id',
          'message',
          'name',
          'status',
          'updatedAt',
        ]);
        assert.equal(rows[1]!.status, 'HANDLED');
        assert.equal(typeof rows[1]!.handledAt, 'string');

        const handled = await get(
          app,
          `${LIST_URL}?search=${SUBMISSION_PREFIX}&status=handled`,
          readerCookie,
        );
        assert.equal(handled.statusCode, 200, handled.body);
        assert.deepEqual(
          dataOf<Array<Record<string, unknown>>>(handled.body).map(
            (row) => row.id,
          ),
          [second.id],
        );

        const ranged = await get(
          app,
          `${LIST_URL}?search=${SUBMISSION_PREFIX}&from=2026-01-02T00:00:00.000Z&to=2026-01-03T23:59:59.999Z`,
          readerCookie,
        );
        assert.equal(ranged.statusCode, 200, ranged.body);
        assert.deepEqual(
          dataOf<Array<Record<string, unknown>>>(ranged.body).map(
            (row) => row.id,
          ),
          [third.id, second.id],
        );

        const paged = await get(
          app,
          `${LIST_URL}?search=${SUBMISSION_PREFIX}&limit=1&page=2`,
          readerCookie,
        );
        assert.equal(paged.statusCode, 200, paged.body);
        assert.equal(metaOf(paged.body).total, 3);
        assert.equal(metaOf(paged.body).page, 2);
        assert.equal(
          dataOf<Array<Record<string, unknown>>>(paged.body)[0]!.id,
          second.id,
        );

        const invalidStatus = await get(
          app,
          `${LIST_URL}?status=bogus`,
          readerCookie,
        );
        assert.equal(invalidStatus.statusCode, 400);
        assert.equal(errorCode(invalidStatus.body), 'VALIDATION_ERROR');

        const inverted = await get(
          app,
          `${LIST_URL}?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z`,
          readerCookie,
        );
        assert.equal(inverted.statusCode, 400);
        assert.equal(errorCode(inverted.body), 'VALIDATION_ERROR');
      } finally {
        await app.close();
      }
    });

    test('search treats LIKE wildcards literally', async () => {
      const app = makeApp();
      const createdIds: string[] = [];
      try {
        const percent = await prisma.contactSubmission.create({
          data: {
            name: `Wildcard ${RUN}`,
            email: `${SUBMISSION_PREFIX}-wildcard@uci.test`,
            message: `Descuento 100% ${SUBMISSION_PREFIX}`,
          },
          select: { id: true },
        });
        const underscore = await prisma.contactSubmission.create({
          data: {
            name: `Underscore ${RUN}`,
            email: `${SUBMISSION_PREFIX}-underscore@uci.test`,
            message: `Codigo promo_${RUN} ${SUBMISSION_PREFIX}`,
          },
          select: { id: true },
        });
        const plain = await prisma.contactSubmission.create({
          data: {
            name: `Plain ${RUN}`,
            email: `${SUBMISSION_PREFIX}-plain@uci.test`,
            message: `Mensaje sin comodines ${SUBMISSION_PREFIX}`,
          },
          select: { id: true },
        });
        createdIds.push(percent.id, underscore.id, plain.id);

        const percentResult = await get(app, `${LIST_URL}?search=%25`, readerCookie);
        assert.equal(percentResult.statusCode, 200, percentResult.body);
        assert.deepEqual(
          dataOf<Array<Record<string, unknown>>>(percentResult.body).map(
            (row) => row.id,
          ),
          [percent.id],
          'a lone "%" matches only rows containing a literal percent sign',
        );
        assert.equal(
          metaOf(percentResult.body).total,
          1,
          'a wildcard search never matches every row',
        );

        const underscoreResult = await get(
          app,
          `${LIST_URL}?search=_`,
          readerCookie,
        );
        assert.equal(underscoreResult.statusCode, 200, underscoreResult.body);
        assert.deepEqual(
          dataOf<Array<Record<string, unknown>>>(underscoreResult.body).map(
            (row) => row.id,
          ),
          [underscore.id],
          'a lone "_" matches only rows containing a literal underscore',
        );
        assert.equal(metaOf(underscoreResult.body).total, 1);

        const backslashResult = await get(
          app,
          `${LIST_URL}?search=%5C`,
          readerCookie,
        );
        assert.equal(backslashResult.statusCode, 200, backslashResult.body);
        assert.equal(
          metaOf(backslashResult.body).total,
          0,
          'a lone backslash matches no row instead of acting as an escape',
        );
      } finally {
        if (createdIds.length > 0) {
          await prisma.contactSubmission.deleteMany({
            where: { id: { in: createdIds } },
          });
        }
        await app.close();
      }
    });

    test('reads one submission and 404s an unknown id', async () => {
      const app = makeApp();
      try {
        const one = await get(app, `${LIST_URL}/${second.id}`, readerCookie);
        assert.equal(one.statusCode, 200, one.body);
        const row = dataOf<Record<string, unknown>>(one.body);
        assert.equal(row.id, second.id);
        assert.equal(row.email, second.email);
        assert.equal(row.status, 'HANDLED');

        const missing = await get(
          app,
          `${LIST_URL}/${randomUUID()}`,
          readerCookie,
        );
        assert.equal(missing.statusCode, 404);
        assert.equal(errorCode(missing.body), 'NOT_FOUND');
      } finally {
        await app.close();
      }
    });

    test('marks handled, is idempotent, reopens and audits each real transition', async () => {
      const app = makeApp();
      try {
        const handled = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          managerCookie,
          { status: 'HANDLED' },
        );
        assert.equal(handled.statusCode, 200, handled.body);
        const handledRow = dataOf<Record<string, unknown>>(handled.body);
        assert.equal(handledRow.status, 'HANDLED');
        assert.equal(typeof handledRow.handledAt, 'string');

        const again = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          managerCookie,
          { status: 'HANDLED' },
        );
        assert.equal(again.statusCode, 200, again.body);
        assert.equal(
          dataOf<Record<string, unknown>>(again.body).handledAt,
          handledRow.handledAt,
          're-marking handled preserves the original handledAt',
        );

        const invalidStatus = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          managerCookie,
          { status: 'CLOSED' },
        );
        assert.equal(invalidStatus.statusCode, 400);
        assert.equal(errorCode(invalidStatus.body), 'VALIDATION_ERROR');

        const extraField = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          managerCookie,
          { status: 'NEW', handledAt: null },
        );
        assert.equal(extraField.statusCode, 400);
        assert.equal(errorCode(extraField.body), 'VALIDATION_ERROR');

        const unchanged = await prisma.contactSubmission.findUnique({
          where: { id: first.id },
        });
        assert.equal(unchanged?.status, 'HANDLED');
        assert.ok(unchanged?.handledAt, 'rejected input never mutates the row');

        const reopened = await patch(
          app,
          `${LIST_URL}/${first.id}`,
          managerCookie,
          { status: 'NEW' },
        );
        assert.equal(reopened.statusCode, 200, reopened.body);
        assert.equal(dataOf<Record<string, unknown>>(reopened.body).handledAt, null);

        const audits = await prisma.auditLog.findMany({
          where: {
            actorId: managerUserId,
            action: 'contact.update',
            entityId: first.id,
          },
          orderBy: { createdAt: 'asc' },
        });
        assert.equal(audits.length, 2, 'only real transitions are audited');
        assert.equal(audits[0]!.entityType, 'CONTACT_SUBMISSION');
        assert.deepEqual(audits[0]!.metadata, {
          previousStatus: 'NEW',
          status: 'HANDLED',
        });
        assert.deepEqual(audits[1]!.metadata, {
          previousStatus: 'HANDLED',
          status: 'NEW',
        });

        const missing = await patch(
          app,
          `${LIST_URL}/${randomUUID()}`,
          managerCookie,
          { status: 'HANDLED' },
        );
        assert.equal(missing.statusCode, 404);
      } finally {
        await app.close();
      }
    });

    test('public contact still answers 201 with notifications enabled', async () => {
      const app = makeApp({
        EMAIL_PROVIDER: 'log',
        CONTACT_NOTIFY_TO: 'ops@uci.test',
      });
      const email = `${SUBMISSION_PREFIX}-public@uci.test`;
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/contact',
          payload: {
            name: 'Ana Pública',
            email,
            message: 'Consulta pública',
          },
        });
        assert.equal(res.statusCode, 201, res.body);
        assert.deepEqual(JSON.parse(res.body), {
          data: { received: true },
        });

        const stored = await prisma.contactSubmission.findFirst({
          where: { email },
        });
        assert.ok(stored, 'the submission is stored even when a log provider runs');
        assert.equal(stored.status, 'NEW');
        assert.equal(stored.handledAt, null);
      } finally {
        await app.close();
      }
    });
  },
);
