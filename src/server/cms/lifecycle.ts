/**
 * Reusable editorial lifecycle model (docs/05 §28–30, docs/08 §22, §38).
 *
 * Pure, dependency-free rules shared by every publishable content type:
 *
 *   - which state transitions each explicit action allows (docs/08 §22: the
 *     server enforces valid transitions; a generic PATCH never changes state);
 *   - the optimistic-concurrency guard that turns a stale edit into a
 *     409 CONFLICT (docs/08 §38);
 *   - schedule-instant validation (docs/08 §37: a scheduled publication must
 *     have a valid future timestamp).
 *
 * No database access lives here, so the rules are trivially testable and reused
 * verbatim by each content module.
 */
import type { ContentStatus } from '@shared/types';
import type { LifecycleAction } from '@shared/cms';
import { conflict, validation } from './errors';

interface TransitionRule {
  /** States the action may start from. */
  readonly from: readonly ContentStatus[];
  /** State the action moves the entity to. */
  readonly to: ContentStatus;
}

/**
 * Allowed transitions. Repeating an action that is already satisfied (e.g.
 * publishing an already-published sermon) is a business conflict, not a no-op,
 * so the client learns its view of the state was stale.
 */
const TRANSITIONS: Record<LifecycleAction, TransitionRule> = {
  publish: {
    from: ['draft', 'scheduled', 'unpublished', 'archived'],
    to: 'published',
  },
  schedule: {
    from: ['draft', 'scheduled', 'unpublished'],
    to: 'scheduled',
  },
  archive: {
    from: ['draft', 'scheduled', 'published', 'unpublished'],
    to: 'archived',
  },
  unpublish: {
    from: ['published'],
    to: 'unpublished',
  },
};

/** The state an action moves content to, regardless of origin. */
export function targetStatus(action: LifecycleAction): ContentStatus {
  return TRANSITIONS[action].to;
}

/** True when `action` may be applied from `current`. */
export function canTransition(
  current: ContentStatus,
  action: LifecycleAction,
): boolean {
  return TRANSITIONS[action].from.includes(current);
}

/**
 * Assert a transition is legal, returning the destination status. Throws a
 * 409 CONFLICT describing the invalid transition otherwise.
 */
export function assertTransition(
  current: ContentStatus,
  action: LifecycleAction,
): ContentStatus {
  if (!canTransition(current, action)) {
    throw conflict(
      `Cannot ${action} content in status "${current}".`,
      { from: current, action },
    );
  }
  return TRANSITIONS[action].to;
}

/**
 * Optimistic-concurrency guard (docs/08 §38): the version the client edited
 * must equal the current one, or the write is rejected as a 409 CONFLICT to
 * prevent a silent overwrite. Returns the next version on success.
 */
export function assertVersionMatches(
  currentVersion: number,
  providedVersion: number,
): number {
  if (!Number.isInteger(providedVersion) || providedVersion < 1) {
    throw validation('A valid "version" is required.', { field: 'version' });
  }
  if (currentVersion !== providedVersion) {
    throw conflict(
      'The content was modified by someone else. Reload and try again.',
      { expected: currentVersion, provided: providedVersion },
    );
  }
  return currentVersion + 1;
}

/**
 * Validate and parse a schedule instant. Rejects unparseable values and
 * timestamps that are not strictly in the future (docs/08 §37).
 */
export function resolveScheduleInstant(raw: unknown, now: Date): Date {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw validation('A "publishAt" instant is required.', {
      field: 'publishAt',
    });
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) {
    throw validation('"publishAt" must be a valid ISO-8601 datetime.', {
      field: 'publishAt',
    });
  }
  if (instant.getTime() <= now.getTime()) {
    throw validation('"publishAt" must be in the future.', {
      field: 'publishAt',
    });
  }
  return instant;
}
