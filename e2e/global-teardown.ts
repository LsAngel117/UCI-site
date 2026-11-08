/**
 * Playwright global teardown (Lote C).
 *
 * Removes everything the suite may have created:
 *   - every sermon whose slug starts with the E2E prefix (topics/revisions
 *     cascade; SEO rows and SERMON audit rows are polymorphic, so they are
 *     deleted explicitly);
 *   - the disposable admin user, its sessions, role grants and audit rows.
 *
 * Idempotent and best-effort: a teardown failure is logged, never masking the
 * test result. It is a no-op when DATABASE_URL is absent.
 */
import { PrismaClient } from '@prisma/client';
import {
  E2E_ADMIN_EMAIL,
  E2E_SERMON_SLUG_PREFIX,
} from './support/env';

export default async function globalTeardown(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const prisma = new PrismaClient();
  try {
    const sermons = await prisma.sermon.findMany({
      where: { slug: { startsWith: E2E_SERMON_SLUG_PREFIX } },
      select: { id: true },
    });
    const sermonIds = sermons.map((sermon) => sermon.id);

    if (sermonIds.length > 0) {
      await prisma.seoMetadata.deleteMany({
        where: { entityType: 'sermon', entityId: { in: sermonIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'SERMON', entityId: { in: sermonIds } },
      });
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
    }

    const user = await prisma.user.findUnique({
      where: { email: E2E_ADMIN_EMAIL },
      select: { id: true },
    });
    if (user) {
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    console.log(
      `[e2e] Cleanup: ${sermonIds.length} sermon(s) and the test admin removed.`,
    );
  } catch (error) {
    console.error('[e2e] Teardown failed (the test result above still stands):', error);
  } finally {
    await prisma.$disconnect();
  }
}
