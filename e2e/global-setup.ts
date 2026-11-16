/**
 * Playwright global setup (Lote C).
 *
 * Creates a disposable ADMIN account so the browser suite is self-contained
 * and never depends on production data or on a previous manual `db:seed`. The
 * account uses the ADMIN role with every permission, which is what the
 * editorial flow needs (publish + archive).
 *
 * Safety: the setup refuses to run against NODE_ENV=production, and the
 * matching teardown removes the account, its sessions, its audits and every
 * sermon whose slug starts with the E2E prefix.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { PERMISSIONS } from '../src/shared/api';
import {
  API_BASE_URL,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  PUBLIC_BASE_URL,
  USE_WEBSERVER,
} from './support/env';

async function assertReachable(url: string, hint: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `E2E precondition failed: ${url} is not reachable (${String(error)}). ${hint}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the E2E suite with NODE_ENV=production: it creates a disposable admin user in the target database.',
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required by the Playwright global setup (set it in the shell or in .env).',
    );
  }

  // The API plugin already waits on /api/v1/health; the extra check turns a
  // missing admin build into an actionable message instead of a confusing 404.
  await assertReachable(
    `${API_BASE_URL}/api/v1/health`,
    'Start the API with `pnpm start:server` (or remove E2E_NO_WEBSERVER).',
  );
  await assertReachable(
    `${PUBLIC_BASE_URL}/`,
    'Start the Astro site with `pnpm dev --port 4321` (or remove E2E_NO_WEBSERVER).',
  );

  const panelResponse = await fetch(`${API_BASE_URL}/panel/login`);
  if (panelResponse.status === 404) {
    throw new Error(
      'The admin panel is not served by the API: run `pnpm build:admin` before the E2E suite.',
    );
  }
  if (!panelResponse.ok) {
    throw new Error(
      `The admin panel answered ${panelResponse.status} — expected 200 from /panel/login.`,
    );
  }
  if (!USE_WEBSERVER) {
    // Kept as a hint in the readiness output only; no behaviour depends on it.
    console.log('[e2e] E2E_NO_WEBSERVER=1 — using the stack already running.');
  }

  const prisma = new PrismaClient();
  try {
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: { description: 'Full administrative access (E2E suite).' },
      create: {
        name: 'ADMIN',
        description: 'Full administrative access (E2E suite).',
      },
    });

    for (const name of PERMISSIONS) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      });
    }

    const passwordHash = await hashPassword(E2E_ADMIN_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: E2E_ADMIN_EMAIL },
      update: { passwordHash, active: true },
      create: {
        email: E2E_ADMIN_EMAIL,
        passwordHash,
        firstName: 'E2E',
        lastName: 'Playwright',
        active: true,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id },
    });

    console.log(`[e2e] Ready: test admin ${E2E_ADMIN_EMAIL} has the ADMIN role.`);
  } finally {
    await prisma.$disconnect();
  }
}
