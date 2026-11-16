/**
 * Improvement Lote A — database-free unit coverage.
 *
 * Pins the pieces that can be verified without PostgreSQL:
 *   - APP_TIMEZONE validation + timezone-aware schedule parsing (A1);
 *   - orphan media cleanup with injected store/storage doubles (A4);
 *   - the scheduler's opt-in cleanup wiring (A4);
 *   - reset-token hashing (A5).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '@server/config';
import { resolveScheduleInstant } from '@server/cms/lifecycle';
import {
  cleanupOrphanMedia,
  type OrphanAssetRecord,
  type OrphanMediaStore,
} from '@server/media/cleanup';
import type { MediaStorage } from '@server/media/storage';
import { startScheduler } from '@server/scheduler';
import {
  DEFAULT_TIMEZONE,
  isValidTimeZone,
  parseZonedDateTime,
  requireValidTimeZone,
} from '@server/timezone';
import { hashResetToken } from '@server/auth/password-reset';

function record(
  id: string,
  createdAt: Date,
  variants: string[] = [],
): OrphanAssetRecord {
  return {
    id,
    filename: `${id}.png`,
    storageKey: `uploads/${id}.png`,
    size: 100,
    createdAt,
    variants: variants.map((storageKey) => ({ storageKey })),
  };
}

class FakeStore implements OrphanMediaStore {
  readonly deleted: string[] = [];

  constructor(private readonly records: OrphanAssetRecord[]) {}

  async listOrphans(cutoff: Date): Promise<OrphanAssetRecord[]> {
    return this.records.filter((row) => row.createdAt < cutoff);
  }

  async delete(id: string): Promise<void> {
    if (id === 'fail') throw new Error('simulated FK race');
    this.deleted.push(id);
  }
}

function fakeStorage(): { storage: MediaStorage; deletedKeys: string[] } {
  const deletedKeys: string[] = [];
  const storage: MediaStorage = {
    provider: 'test',
    async put() {},
    async get() {
      return Buffer.alloc(0);
    },
    async delete(key) {
      deletedKeys.push(key);
    },
    async exists() {
      return true;
    },
    getPublicUrl(key) {
      return `/media/${key}`;
    },
  };
  return { storage, deletedKeys };
}

describe('A1 — configurable church timezone', () => {
  test('APP_TIMEZONE validates IANA identifiers and defaults to America/Bogota', () => {
    assert.equal(DEFAULT_TIMEZONE, 'America/Bogota');
    assert.equal(isValidTimeZone('America/Bogota'), true);
    assert.equal(isValidTimeZone('America/Lima'), true);
    assert.equal(isValidTimeZone('Not/AZone'), false);
    assert.equal(isValidTimeZone(''), false);

    assert.equal(requireValidTimeZone(undefined), 'America/Bogota');
    assert.equal(requireValidTimeZone('Europe/Madrid'), 'Europe/Madrid');
    assert.throws(
      () => requireValidTimeZone('Not/AZone'),
      /Invalid APP_TIMEZONE/,
    );

    assert.equal(loadConfig({ APP_TIMEZONE: 'Europe/Madrid' }).timezone, 'Europe/Madrid');
    assert.throws(
      () => loadConfig({ APP_TIMEZONE: 'Not/AZone' }),
      /Invalid APP_TIMEZONE/,
    );
  });

  test('offset-less schedule values are interpreted in the church timezone', () => {
    assert.equal(
      parseZonedDateTime('2030-01-01T10:00', 'America/Bogota')?.toISOString(),
      '2030-01-01T15:00:00.000Z',
    );

    const now = new Date('2029-12-31T00:00:00.000Z');
    assert.equal(
      resolveScheduleInstant('2030-01-01T10:00', now, 'America/Bogota').toISOString(),
      '2030-01-01T15:00:00.000Z',
    );
    // An explicit offset is already an absolute instant and is not re-zoned.
    assert.equal(
      resolveScheduleInstant(
        '2030-01-01T10:00:00.000Z',
        now,
        'America/Bogota',
      ).toISOString(),
      '2030-01-01T10:00:00.000Z',
    );
  });
});

describe('A4 — orphan media cleanup', () => {
  const now = new Date('2030-06-01T00:00:00.000Z');
  const old = new Date('2030-05-01T00:00:00.000Z');
  const recent = new Date('2030-05-31T00:00:00.000Z');

  test('dry run lists candidates and never writes', async () => {
    const store = new FakeStore([record('old', old, ['old-thumb']), record('recent', recent)]);
    const { storage, deletedKeys } = fakeStorage();

    const result = await cleanupOrphanMedia(
      { olderThanDays: 10, dryRun: true },
      { store, storage, now: () => now },
    );

    assert.equal(result.dryRun, true);
    assert.equal(result.candidates, 1);
    assert.equal(result.deleted, 0);
    assert.equal(result.items[0]?.action, 'would_delete');
    assert.deepEqual(store.deleted, []);
    assert.deepEqual(deletedKeys, []);
  });

  test('real run deletes rows and every binary (original + variants)', async () => {
    const store = new FakeStore([record('old', old, ['old-thumb', 'old-small'])]);
    const { storage, deletedKeys } = fakeStorage();

    const result = await cleanupOrphanMedia(
      { olderThanDays: 10 },
      { store, storage, now: () => now },
    );

    assert.equal(result.deleted, 1);
    assert.equal(result.filesDeleted, 3);
    assert.equal(result.failures, 0);
    assert.deepEqual(store.deleted, ['old']);
    assert.deepEqual(deletedKeys.sort(), ['old-small', 'old-thumb', 'uploads/old.png'].sort());
  });

  test('one failing asset is reported and the rest of the batch continues', async () => {
    const store = new FakeStore([record('fail', old), record('old', old)]);
    const { storage } = fakeStorage();

    const result = await cleanupOrphanMedia(
      { olderThanDays: 10 },
      { store, storage, now: () => now },
    );

    assert.equal(result.failures, 1);
    assert.equal(result.deleted, 1);
    assert.deepEqual(
      result.items.map((item) => [item.id, item.action]),
      [
        ['fail', 'failed'],
        ['old', 'deleted'],
      ],
    );
  });

  test('a real run requires a storage adapter', async () => {
    const store = new FakeStore([record('old', old)]);
    await assert.rejects(
      cleanupOrphanMedia({ olderThanDays: 10 }, { store, now: () => now }),
      /MediaStorage adapter is required/,
    );
  });
});

describe('A4 — scheduler cleanup is opt-in', () => {
  test('olderThanDays = 0 never invokes cleanup', async () => {
    let calls = 0;
    const scheduler = startScheduler({
      intervalMs: 100_000,
      enabled: true,
      runImmediately: false,
      domains: [],
      mediaCleanup: {
        olderThanDays: 0,
        async run() {
          calls += 1;
          return { candidates: 0, deleted: 0, failures: 0 };
        },
      },
    });
    try {
      await scheduler.runNow();
    } finally {
      scheduler.stop();
    }
    assert.equal(calls, 0);
  });

  test('a positive age runs cleanup once after the publication sweep', async () => {
    let cleanupCalls = 0;
    let publicationCalls = 0;
    const scheduler = startScheduler({
      intervalMs: 100_000,
      enabled: true,
      runImmediately: false,
      domains: [
        {
          name: 'sermons',
          async publishDue() {
            publicationCalls += 1;
            return [];
          },
        },
      ],
      mediaCleanup: {
        olderThanDays: 30,
        async run() {
          cleanupCalls += 1;
          return { candidates: 2, deleted: 1, failures: 0 };
        },
      },
    });
    try {
      const summary = await scheduler.runNow();
      assert.equal(summary.results.length, 1);
    } finally {
      scheduler.stop();
    }
    assert.equal(publicationCalls, 1);
    assert.equal(cleanupCalls, 1);
  });
});

describe('A5 — reset token hashing', () => {
  test('tokens are stored as deterministic SHA-256 hex, never raw', () => {
    const token = 'opaque-reset-token';
    const hash = hashResetToken(token);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.notEqual(hash, token);
    assert.equal(hashResetToken(token), hash);
    assert.notEqual(hashResetToken('another-token'), hash);
  });
});
