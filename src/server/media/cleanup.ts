/**
 * Orphan media cleanup (improvement A4, docs/12 §18, §60).
 *
 * The media library already exposes a read-only orphan review. This module
 * adds the *explicit* destructive operation behind it with two safeguards:
 *
 *   - only assets with **zero** `MediaReference` rows are candidates;
 *   - only assets older than `olderThanDays` are eligible, so a fresh upload
 *     without a saved reference yet is never swept away.
 *
 * `dryRun` (the safe default at the HTTP layer) returns the exact candidate
 * list without touching the database or filesystem. A real run deletes the
 * row (variants cascade) and then its binaries; per-asset failures are counted
 * and never abort the rest of the batch.
 */
import type { MediaStorage } from './storage';
import { prisma } from '../db';

/** Minimal asset projection the cleanup needs. */
export interface OrphanAssetRecord {
  id: string;
  filename: string;
  storageKey: string;
  size: number;
  createdAt: Date;
  variants: Array<{ storageKey: string }>;
}

/** Persistence port so the cleanup is unit-testable without PostgreSQL. */
export interface OrphanMediaStore {
  /** Assets with no references created strictly before `cutoff`. */
  listOrphans(cutoff: Date): Promise<OrphanAssetRecord[]>;
  /** Delete one asset row (variants cascade). */
  delete(id: string): Promise<void>;
}

export interface CleanupOrphanMediaOptions {
  /** Minimum age in days; `0` means "everything older than now". */
  olderThanDays: number;
  /** When true only report candidates (no writes). Default false. */
  dryRun?: boolean;
}

export interface CleanupItem {
  id: string;
  filename: string;
  storageKey: string;
  size: number;
  createdAt: string;
  variantCount: number;
  action: 'would_delete' | 'deleted' | 'failed';
}

export interface CleanupOrphanMediaResult {
  olderThanDays: number;
  cutoff: string;
  dryRun: boolean;
  candidates: number;
  deleted: number;
  filesDeleted: number;
  failures: number;
  items: CleanupItem[];
}

export interface CleanupOrphanMediaDeps {
  store?: OrphanMediaStore;
  storage?: MediaStorage;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prisma-backed default store. */
export function createPrismaOrphanStore(): OrphanMediaStore {
  return {
    async listOrphans(cutoff) {
      const rows = await prisma.mediaAsset.findMany({
        where: {
          references: { none: {} },
          createdAt: { lt: cutoff },
        },
        orderBy: { createdAt: 'asc' },
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
}

/** Validate the age option; a non-integer/negative value is a programming error. */
function requireAgeDays(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `cleanupOrphanMedia: "olderThanDays" must be a non-negative integer (got ${value}).`,
    );
  }
  return value;
}

/**
 * Delete (or list, with `dryRun`) orphan media older than `olderThanDays`.
 *
 * Real deletion requires a storage adapter so the binaries are removed too.
 * A DB failure for one asset (e.g. a reference created mid-run, which the FK
 * `Restrict` turns into P2003) is recorded as `failed` and the batch
 * continues.
 */
export async function cleanupOrphanMedia(
  options: CleanupOrphanMediaOptions,
  deps: CleanupOrphanMediaDeps = {},
): Promise<CleanupOrphanMediaResult> {
  const olderThanDays = requireAgeDays(options.olderThanDays);
  const dryRun = options.dryRun === true;
  const store = deps.store ?? createPrismaOrphanStore();
  const now = deps.now ? deps.now() : new Date();
  const cutoff = new Date(now.getTime() - olderThanDays * DAY_MS);

  if (!dryRun && !deps.storage) {
    throw new Error(
      'cleanupOrphanMedia: a MediaStorage adapter is required for a real cleanup run.',
    );
  }

  const candidates = await store.listOrphans(cutoff);
  const items: CleanupItem[] = [];

  let deleted = 0;
  let filesDeleted = 0;
  let failures = 0;

  for (const asset of candidates) {
    const base: CleanupItem = {
      id: asset.id,
      filename: asset.filename,
      storageKey: asset.storageKey,
      size: asset.size,
      createdAt: asset.createdAt.toISOString(),
      variantCount: asset.variants.length,
      action: dryRun ? 'would_delete' : 'deleted',
    };

    if (dryRun) {
      items.push(base);
      continue;
    }

    try {
      await store.delete(asset.id);
    } catch {
      failures += 1;
      items.push({ ...base, action: 'failed' });
      continue;
    }

    deleted += 1;
    const keys = [
      asset.storageKey,
      ...asset.variants.map((variant) => variant.storageKey),
    ];
    const results = await Promise.allSettled(
      keys.map((key) => deps.storage!.delete(key)),
    );
    filesDeleted += results.filter((result) => result.status === 'fulfilled')
      .length;
    items.push(base);
  }

  return {
    olderThanDays,
    cutoff: cutoff.toISOString(),
    dryRun,
    candidates: candidates.length,
    deleted,
    filesDeleted,
    failures,
    items,
  };
}
