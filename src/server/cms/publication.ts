/**
 * Reusable publication service (docs/05 §29–30, docs/08 §22–23, §37, §39).
 *
 * Publishing is a server-side business operation, so the orchestration lives
 * here — validate the transition, checkpoint a revision, advance state, and
 * record the audit trail — and every content module consumes it through a
 * `PublicationStore` port instead of re-implementing the flow.
 *
 * Versioning rule (why lifecycle bumps `version`): a revision is uniquely keyed
 * by `(entityId, version)`, so the checkpointing actions (`publish`, `schedule`)
 * advance the entity's version — exactly like an edit — guaranteeing each
 * revision occupies a distinct version. Checkpoint-free actions (`archive`,
 * `unpublish`) only change state.
 *
 * Scheduling foundation: `publishDue(now)` promotes scheduled content whose
 * `publishAt` has passed. The real cron/worker is a follow-up; this gives the
 * operation a tested, reusable home.
 */
import { randomUUID } from 'node:crypto';
import type { ContentStatus } from '@shared/types';
import type { LifecycleAction } from '@shared/cms';
import { lifecycleAuditAction, recordAudit } from './audit';
import { notFound } from './errors';
import {
  assertTransition,
  resolveScheduleInstant,
  targetStatus,
} from './lifecycle';
import type { RevisionRecord, RevisionStore } from './revisions';

/** The slice of a publishable entity the publication service operates on. */
export interface PublicationEntity {
  id: string;
  title: string;
  status: ContentStatus;
  version: number;
}

/** Field patch applied when a lifecycle action moves an entity's state. */
export interface LifecyclePatch {
  status: ContentStatus;
  version: number;
  publishedAt?: Date | null;
  publishAt?: Date | null;
  unpublishedAt?: Date | null;
  updatedById?: string | null;
}

/** Actions that create a revision checkpoint (and therefore bump `version`). */
const CHECKPOINT_ACTIONS: readonly LifecycleAction[] = ['publish', 'schedule'];

/**
 * Persistence port for publication. The content module supplies the entity
 * read, the state write, the due-content query and the snapshot projection; the
 * service owns the orchestration.
 */
export interface PublicationStore<T extends PublicationEntity> {
  findById(id: string): Promise<T | null>;
  /** Scheduled entities whose `publishAt <= now`, oldest first. */
  listDueForPublish(now: Date): Promise<T[]>;
  /** Apply a lifecycle patch and return the updated entity. */
  applyLifecycle(id: string, patch: LifecyclePatch): Promise<T>;
  /** Project the entity's editable content into a revision snapshot. */
  buildSnapshot(entity: T): unknown;
}

export interface PublicationDeps<T extends PublicationEntity> {
  /** Entity label used for audit + revision typing, e.g. `SERMON`. */
  entityType: string;
  store: PublicationStore<T>;
  revisions: RevisionStore;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  clock?: () => Date;
}

export interface PublicationResult<T extends PublicationEntity> {
  entity: T;
  /** Present only for checkpointing actions. */
  revision: RevisionRecord | null;
}

export interface PublicationService<T extends PublicationEntity> {
  publish(id: string, actorId: string | null): Promise<PublicationResult<T>>;
  schedule(
    id: string,
    publishAt: unknown,
    actorId: string | null,
  ): Promise<PublicationResult<T>>;
  archive(id: string, actorId: string | null): Promise<PublicationResult<T>>;
  unpublish(id: string, actorId: string | null): Promise<PublicationResult<T>>;
  /** Promote every scheduled entity past its `publishAt`. Returns the published. */
  publishDue(now: Date): Promise<T[]>;
}

export function createPublicationService<T extends PublicationEntity>(
  deps: PublicationDeps<T>,
): PublicationService<T> {
  const { entityType, store, revisions } = deps;
  const clock = deps.clock ?? (() => new Date());

  async function load(id: string): Promise<T> {
    const entity = await store.findById(id);
    if (!entity) {
      throw notFound('The requested content was not found.');
    }
    return entity;
  }

  function checkpoint(
    entity: T,
    version: number,
    actorId: string | null,
  ): Promise<RevisionRecord> {
    return revisions.insert({
      entityId: entity.id,
      version,
      title: entity.title,
      snapshot: store.buildSnapshot(entity),
      createdById: actorId,
    });
  }

  async function audit(
    action: LifecycleAction,
    entity: T,
    actorId: string | null,
    metadata: unknown,
  ): Promise<void> {
    await recordAudit({
      actorId,
      action: lifecycleAuditAction(entityType, action),
      entityType,
      entityId: entity.id,
      metadata,
    });
  }

  async function apply(
    entity: T,
    action: LifecycleAction,
    actorId: string | null,
    extra: Partial<LifecyclePatch>,
    version: number,
  ): Promise<PublicationResult<T>> {
    const updated = await store.applyLifecycle(entity.id, {
      status: targetStatus(action),
      version,
      updatedById: actorId,
      ...extra,
    });
    await audit(action, updated, actorId, {
      previousStatus: entity.status,
      status: updated.status,
      version,
    });
    return { entity: updated, revision: null };
  }

  async function checkpointed(
    entity: T,
    action: LifecycleAction,
    actorId: string | null,
    extra: Partial<LifecyclePatch>,
  ): Promise<PublicationResult<T>> {
    assertTransition(entity.status, action);
    const version = entity.version + 1;
    const revision = await checkpoint(entity, version, actorId);
    const updated = await store.applyLifecycle(entity.id, {
      status: targetStatus(action),
      version,
      updatedById: actorId,
      ...extra,
    });
    await audit(action, updated, actorId, {
      previousStatus: entity.status,
      status: updated.status,
      version,
    });
    return { entity: updated, revision };
  }

  return {
    async publish(id, actorId) {
      const entity = await load(id);
      return checkpointed(entity, 'publish', actorId, {
        publishedAt: clock(),
        publishAt: null,
      });
    },

    async schedule(id, publishAt, actorId) {
      const entity = await load(id);
      assertTransition(entity.status, 'schedule');
      const instant = resolveScheduleInstant(publishAt, clock());
      return checkpointed(entity, 'schedule', actorId, { publishAt: instant });
    },

    async archive(id, actorId) {
      const entity = await load(id);
      assertTransition(entity.status, 'archive');
      const extra: Partial<LifecyclePatch> = {};
      // Retiring published content records when it left the public site.
      if (entity.status === 'published') extra.unpublishedAt = clock();
      return apply(entity, 'archive', actorId, extra, entity.version);
    },

    async unpublish(id, actorId) {
      const entity = await load(id);
      assertTransition(entity.status, 'unpublish');
      return apply(entity, 'unpublish', actorId, {
        unpublishedAt: clock(),
      }, entity.version);
    },

    async publishDue(now) {
      const due = await store.listDueForPublish(now);
      const published: T[] = [];
      for (const entity of due) {
        // System action (actorId null); reuses the same checkpointed flow so a
        // scheduled publication looks identical to a manual one.
        const result = await checkpointed(entity, 'publish', null, {
          publishedAt: now,
          publishAt: null,
        });
        published.push(result.entity);
      }
      return published;
    },
  };
}

/** True when an action creates a revision checkpoint. */
export function isCheckpointAction(action: LifecycleAction): boolean {
  return CHECKPOINT_ACTIONS.includes(action);
}

/**
 * Revision store for content types that intentionally have no revision table
 * (Phase 6 decision: docs/05 §32 reserves revisions for "important content";
 * Events and Ministries reuse lifecycle/publication/slug/concurrency/media/SEO
 * only). It satisfies the `RevisionStore` port so the publication service keeps
 * owning the orchestration — including the version bump that guarantees the
 * lifecycle state transitions stay observable — while persisting nothing.
 *
 * `list`/`find` return empty/null because no revision endpoint is exposed for
 * these collections; `insert` returns the record the caller would have
 * persisted, with an ephemeral id.
 */
export function createNullRevisionStore(): RevisionStore {
  return {
    async insert(input) {
      return {
        id: randomUUID(),
        entityId: input.entityId,
        version: input.version,
        title: input.title,
        snapshot: input.snapshot,
        createdById: input.createdById,
        createdAt: new Date(),
      };
    },
    async list() {
      return [];
    },
    async find() {
      return null;
    },
  };
}
