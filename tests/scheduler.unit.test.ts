/**
 * Scheduled-publication scheduler unit suite (Phase 12B, docs/15 §18.6).
 *
 * Database-free characterization of the orchestration contract:
 *   - one failing collection never blocks the remaining sweeps;
 *   - the summary records per-domain outcomes;
 *   - a disabled scheduler performs no work (tests/build kill switch);
 *   - an enabled scheduler sweeps on demand and stops cleanly.
 *
 * The real `publishDue*` functions run against PostgreSQL in
 * `scheduler.e2e.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  runDuePublishing,
  startScheduler,
  type PublishingDomain,
} from '@server/scheduler';

describe('scheduled publication runner', () => {
  test('a failing domain is isolated and the others still publish', async () => {
    const called: string[] = [];
    const logged: unknown[] = [];
    const domains: PublishingDomain[] = [
      {
        name: 'sermons',
        publishDue: async () => {
          called.push('sermons');
          throw new Error('sermon query exploded');
        },
      },
      {
        name: 'events',
        publishDue: async () => {
          called.push('events');
          return [{ id: 'e1' }, { id: 'e2' }];
        },
      },
      {
        name: 'ministries',
        publishDue: async () => {
          called.push('ministries');
          return [];
        },
      },
    ];

    const summary = await runDuePublishing(new Date('2030-01-01T00:00:00Z'), {
      domains,
      logger: {
        info: () => {},
        error: (context) => {
          logged.push(context.err);
        },
      },
    });

    assert.deepEqual(called, ['sermons', 'events', 'ministries']);
    assert.equal(summary.results.length, 3);
    assert.deepEqual(
      summary.results.map((result) => [result.domain, result.published, result.ok]),
      [
        ['sermons', 0, false],
        ['events', 2, true],
        ['ministries', 0, true],
      ],
    );
    assert.equal(logged.length, 1);
    assert.match(String((logged[0] as Error).message), /sermon query exploded/);
  });

  test('a disabled scheduler never invokes a domain', async () => {
    let calls = 0;
    const domains: PublishingDomain[] = [
      {
        name: 'sermons',
        publishDue: async () => {
          calls += 1;
          return [];
        },
      },
    ];

    const scheduler = startScheduler({
      intervalMs: 10,
      enabled: false,
      domains,
    });
    const summary = await scheduler.runNow();
    scheduler.stop();

    assert.equal(calls, 0);
    assert.deepEqual(summary.results, []);
  });

  test('an enabled scheduler runs on demand and stops without further ticks', async () => {
    let calls = 0;
    const domains: PublishingDomain[] = [
      {
        name: 'sermons',
        publishDue: async () => {
          calls += 1;
          return [];
        },
      },
    ];

    const scheduler = startScheduler({
      intervalMs: 1_000,
      runImmediately: false,
      domains,
    });

    assert.equal(calls, 0);
    await scheduler.runNow();
    assert.equal(calls, 1);
    // Concurrent callers join the in-flight sweep instead of duplicating it.
    await Promise.all([scheduler.runNow(), scheduler.runNow()]);
    assert.equal(calls, 2);
    scheduler.stop();
    // Several intervals' worth of time must not produce another sweep.
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls, 2);
  });
});
