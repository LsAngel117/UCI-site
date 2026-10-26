/**
 * Idempotent database seed (docs/11 §8–9, docs/14 §42).
 *
 * Creates the two initial roles (ADMIN, EDITOR), the full permission
 * vocabulary, and the role↔permission grants. Everything is upserted or
 * inserted with `skipDuplicates`, so re-running never duplicates rows and never
 * destroys manual grants.
 *
 * The initial admin user is created ONLY when `ADMIN_EMAIL` and
 * `ADMIN_PASSWORD` are present in the environment — there is no hardcoded
 * credential (docs/11 §26). If the user already exists its password is left
 * untouched; only the ADMIN role grant is (re)asserted.
 *
 * Run with: `pnpm db:seed` (or `pnpm exec prisma db seed`).
 */
import { hashPassword } from '@server/auth/password';
import {
  EDITOR_PERMISSIONS,
  PERMISSIONS,
  describePermission,
} from '@server/auth/permissions';
import { prisma } from '@server/db';
import { loadEnvFile } from '@server/env';

/** Initial roles and their descriptions (docs/11 §8). */
const ROLES = [
  {
    name: 'ADMIN',
    description:
      'Full administrative access: users, roles, settings, content, media, publishing and audit.',
  },
  {
    name: 'EDITOR',
    description:
      'Editorial access: create and edit content, media and SEO. No publishing, deletion or administration.',
  },
] as const;

async function seedRolesAndPermissions(): Promise<Map<string, string>> {
  // 1. Permissions — one row per vocabulary entry (idempotent upsert).
  for (const name of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: describePermission(name) },
    });
  }

  // 2. Roles.
  const roleIds = new Map<string, string>();
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: { name: role.name, description: role.description },
    });
    roleIds.set(role.name, record.id);
  }

  // 3. Grants — ADMIN gets everything, EDITOR gets the baseline set. Additive
  //    with skipDuplicates, so the seed is safe to run repeatedly.
  const permissions = await prisma.permission.findMany({
    select: { id: true, name: true },
  });
  const permissionIdByName = new Map(
    permissions.map((permission) => [permission.name, permission.id]),
  );

  const adminId = roleIds.get('ADMIN');
  const editorId = roleIds.get('EDITOR');
  if (!adminId || !editorId) {
    throw new Error('Seed invariant violated: ADMIN/EDITOR role missing.');
  }

  const grants = [
    ...PERMISSIONS.map((name) => ({
      roleId: adminId,
      permissionId: permissionIdByName.get(name)!,
    })),
    ...EDITOR_PERMISSIONS.map((name) => ({
      roleId: editorId,
      permissionId: permissionIdByName.get(name)!,
    })),
  ];

  await prisma.rolePermission.createMany({
    data: grants,
    skipDuplicates: true,
  });

  return roleIds;
}

async function seedInitialAdmin(roleIds: Map<string, string>): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      '[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping initial admin user.',
    );
    return;
  }

  const adminRoleId = roleIds.get('ADMIN')!;
  const existing = await prisma.user.findUnique({ where: { email } });

  let userId: string;
  if (existing) {
    // Never overwrite a password on re-seed; only ensure the ADMIN grant.
    userId = existing.id;
    console.log(`[seed] Admin user ${email} already exists — kept as-is.`);
  } else {
    // First name is derived from the email so no personal data is invented.
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        firstName: email.split('@')[0] ?? 'Administrator',
        active: true,
      },
    });
    userId = created.id;
    console.log(`[seed] Created initial admin user ${email}.`);
  }

  await prisma.userRole.createMany({
    data: [{ userId, roleId: adminRoleId }],
    skipDuplicates: true,
  });
}

async function main(): Promise<void> {
  loadEnvFile();
  const roleIds = await seedRolesAndPermissions();
  await seedInitialAdmin(roleIds);
  console.log(
    `[seed] Done: ${PERMISSIONS.length} permissions, ${ROLES.length} roles.`,
  );
}

try {
  await main();
} catch (error) {
  console.error('[seed] Failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}