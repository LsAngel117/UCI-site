/**
 * Scheduled-publication scheduler (Phase 12B, docs/07 §505, docs/14 §1159).
 *
 * The CMS core already owns the publication rules and exposes one
 * `publishDue*` function per content collection. Until Phase 12B nothing
 * called them, so content left in `scheduled` state never reached the public
 * site. This module is the missing integration point:
 *
 *   - `runDuePublishing(now)` performs one sweep and is pure enough to be
 *     invoked directly by tests (injectable clock + publisher list);
 *   - `startScheduler` owns the process-level `setInterval`, runs one sweep
 *     immediately and then on every tick, and never overlaps sweeps;
 *   - one failing domain is logged and skipped so the remaining collections
 *     still publish on the same tick.
 *
 * Composition rule: only `server.ts` (the process entrypoint that calls
 * `listen`) starts the timer. `buildServer` stays side-effect free so tests
 * and the Astro build never spawn a background scheduler.
 */
import { publishDueEvents } from './cms/events/service';
import { publishDueMinistries } from './cms/ministries/service';
import { publishDuePages } from './cms/pages/service';
import { publishDueSermons } from './cms/sermons/service';
import { publishDueStories } from './cms/stories/service';

/** Structural logger so the scheduler stays independent of Fastify/pino. */
export interface SchedulerLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

/** One content collection that can promote scheduled rows. */
export interface PublishingDomain {
  /** Stable label used in logs and test summaries (`sermons`, `events`, ...). */
  readonly name: string;
  /** Promote every scheduled row whose `publishAt <= now`. */
  readonly publishDue: (now: Date) => Promise<readonly unknown[]>;
}

/** The collections the scheduler sweeps. Order is deterministic for tests. */
export const DEFAULT_PUBLISHING_DOMAINS: readonly PublishingDomain[] = [
  { name: 'sermons', publishDue: publishDueSermons },
  { name: 'events', publishDue: publishDueEvents },
  { name: 'ministries', publishDue: publishDueMinistries },
  { name: 'pages', publishDue: publishDuePages },
  { name: 'stories', publishDue: publishDueStories },
];

export interface DomainPublishingResult {
  domain: string;
  /** Number of rows promoted during this sweep. */
  published: number;
  /** False when this domain threw and was skipped for the tick. */
  ok: boolean;
}

export interface DuePublishingSummary {
  ranAt: Date;
  results: DomainPublishingResult[];
}

export interface RunDuePublishingOptions {
  /** Override the collections (tests / future domains). */
  domains?: readonly PublishingDomain[];
  /** Optional structured logger. */
  logger?: SchedulerLogger;
}

/**
 * Run one publication sweep. A domain failure never stops the other domains:
 * each is attempted and its outcome is recorded in the summary.
 */
export async function runDuePublishing(
  now: Date = new Date(),
  options: RunDuePublishingOptions = {},
): Promise<DuePublishingSummary> {
  const domains = options.domains ?? DEFAULT_PUBLISHING_DOMAINS;
  const results: DomainPublishingResult[] = [];

  for (const domain of domains) {
    try {
      const published = await domain.publishDue(now);
      results.push({
        domain: domain.name,
        published: published.length,
        ok: true,
      });
      if (published.length > 0) {
        options.logger?.info(
          { domain: domain.name, published: published.length },
          'Scheduled publication sweep promoted due content',
        );
      }
    } catch (error) {
      // Isolate domains: a broken sermon query must not block events.
      options.logger?.error(
        { err: error, domain: domain.name },
        'Scheduled publication sweep failed for a domain',
      );
      results.push({ domain: domain.name, published: 0, ok: false });
    }
  }

  return { ranAt: now, results };
}

/**
 * Opt-in orphan-media cleanup run after each publication sweep. It only runs
 * when `olderThanDays > 0`; `0` (the config default) disables it entirely.
 */
export interface ScheduledMediaCleanup {
  /** Minimum orphan age in days; must be > 0 to run. */
  olderThanDays: number;
  run: () => Promise<{
    candidates: number;
    deleted: number;
    failures: number;
  }>;
}

export interface SchedulerOptions {
  /** Milliseconds between sweeps (`SCHEDULER_INTERVAL_MS`). */
  intervalMs: number;
  /**
   * Optional orphan-media cleanup wired to the same tick. Only invoked when
   * `olderThanDays > 0` (improvement A4).
   */
  mediaCleanup?: ScheduledMediaCleanup;
  /**
   * Hard kill switch. `server.ts` passes `config.nodeEnv !== 'test'`; tests
   * can also construct a scheduler explicitly disabled.
   */
  enabled?: boolean;
  logger?: SchedulerLogger;
  domains?: readonly PublishingDomain[];
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Run one sweep right after startup (default true). */
  runImmediately?: boolean;
}

export interface SchedulerHandle {
  /** Stop the interval. Pending in-flight work is left to finish. */
  stop(): void;
  /** Run one sweep now; concurrent calls share the in-flight promise. */
  runNow(): Promise<DuePublishingSummary>;
}

function emptySummary(now: Date): DuePublishingSummary {
  return { ranAt: now, results: [] };
}

/**
 * Start the process-level publication scheduler.
 *
 * Sweeps never overlap: if a tick fires while the previous one is still
 * running, it joins the in-flight promise instead of starting a second query
 * batch. The interval is `unref`'d so it never keeps a shutting-down process
 * alive on its own.
 */
export function startScheduler(
  options: SchedulerOptions,
): SchedulerHandle {
  const clock = options.now ?? (() => new Date());

  if (options.enabled === false) {
    return {
      stop(): void {},
      runNow: async () => emptySummary(clock()),
    };
  }

  let active: Promise<DuePublishingSummary> | null = null;

  const runNow = (): Promise<DuePublishingSummary> => {
    if (active) return active;
    active = (async () => {
      const summary = await runDuePublishing(clock(), {
        ...(options.domains ? { domains: options.domains } : {}),
        ...(options.logger ? { logger: options.logger } : {}),
      });

      const cleanup = options.mediaCleanup;
      if (cleanup && cleanup.olderThanDays > 0) {
        try {
          const result = await cleanup.run();
          options.logger?.info(
            {
              olderThanDays: cleanup.olderThanDays,
              candidates: result.candidates,
              deleted: result.deleted,
              failures: result.failures,
            },
            'Media orphan cleanup sweep finished',
          );
        } catch (error) {
          // Maintenance is best-effort: a cleanup failure never cancels the
          // publication sweep or the next tick.
          options.logger?.error(
            { err: error, olderThanDays: cleanup.olderThanDays },
            'Media orphan cleanup sweep failed',
          );
        }
      }

      return summary;
    })().finally(() => {
      active = null;
    });
    return active;
  };

  const timer = setInterval(() => {
    void runNow();
  }, options.intervalMs);
  timer.unref();

  if (options.runImmediately !== false) {
    void runNow();
  }

  return {
    stop(): void {
      clearInterval(timer);
    },
    runNow,
  };
}
