/**
 * Idempotent seed for the public settings blob (Phase 9A1, docs/14 §42).
 *
 * Creates the `church.public` `Setting` row with the documented defaults only
 * when it does not exist. Re-running the seed never duplicates the row and
 * never overwrites editor changes — `update: {}` intentionally keeps whatever
 * the admin panel has saved.
 *
 * Exported as a function (instead of inline in `prisma/seed.ts`) so the
 * idempotency guarantee is covered by a database test.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@server/db';
import {
  DEFAULT_PUBLIC_SETTINGS,
  PUBLIC_SETTINGS_KEY,
} from '@server/settings/store';

export async function seedPublicSettings(
  db: PrismaClient = prisma,
): Promise<void> {
  await db.setting.upsert({
    where: { key: PUBLIC_SETTINGS_KEY },
    update: {},
    create: {
      key: PUBLIC_SETTINGS_KEY,
      value: DEFAULT_PUBLIC_SETTINGS as unknown as Prisma.InputJsonValue,
    },
  });
}
