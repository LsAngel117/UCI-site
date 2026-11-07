/**
 * Reusable revision service (docs/05 §32, docs/08 §11.9).
 *
 * Revision history belongs to every important content type, so the *semantics*
 * live here and are consumed — never re-implemented — by content modules:
 *
 *   - a revision is an immutable, self-contained snapshot of an entity;
 *   - restoring a revision NEVER deletes history: it applies the old snapshot
 *     to the live entity and appends a brand-new revision for the result.
 *
 * Storage is abstracted behind `RevisionStore` (a per-entity-type port), so the
 * same service can back Sermons now and Pages/Events later without change. The
 * Prisma-backed implementation for sermons lives in the sermons module.
 */
import { notFound } from './errors';

/** A persisted revision, decoupled from any ORM type. */
export interface RevisionRecord {
  id: string;
  /** Id of the entity the revision belongs to. */
  entityId: string;
  version: number;
  title: string;
  snapshot: unknown;
  createdById: string | null;
  createdAt: Date;
}

/** Input for appending a revision. */
export interface InsertRevisionInput {
  entityId: string;
  version: number;
  title: string;
  snapshot: unknown;
  createdById: string | null;
}

/**
 * Persistence port for revisions. A content module implements one instance per
 * entity type; the revision *service* below owns append-only semantics.
 */
export interface RevisionStore {
  /** Append a revision and return the persisted record. */
  insert(input: InsertRevisionInput): Promise<RevisionRecord>;
  /** List an entity's revisions, newest first. */
  list(entityId: string): Promise<RevisionRecord[]>;
  /** Fetch one revision scoped to its entity, or null. */
  find(entityId: string, revisionId: string): Promise<RevisionRecord | null>;
}

/** Outcome of applying a snapshot back onto the parent entity. */
export interface RestoredEntity {
  /** The entity's version after the restore was applied. */
  version: number;
  title: string;
}

export interface RestoreOptions {
  entityId: string;
  revisionId: string;
  createdById: string | null;
  /**
   * Apply `snapshot` to the parent entity (the content module owns that write)
   * and return the resulting version + title. Invoked BEFORE the new revision
   * is appended so the revision records the post-restore version.
   */
  applySnapshot: (
    snapshot: unknown,
    revision: RevisionRecord,
  ) => Promise<RestoredEntity>;
}

/** Append a new revision snapshot for an entity version. */
export function createRevision(
  store: RevisionStore,
  input: InsertRevisionInput,
): Promise<RevisionRecord> {
  return store.insert(input);
}

/** List an entity's revisions, newest first. */
export function listRevisions(
  store: RevisionStore,
  entityId: string,
): Promise<RevisionRecord[]> {
  return store.list(entityId);
}

/** Fetch one revision, throwing `NOT_FOUND` when it does not belong to the entity. */
export async function getRevision(
  store: RevisionStore,
  entityId: string,
  revisionId: string,
): Promise<RevisionRecord> {
  const revision = await store.find(entityId, revisionId);
  if (!revision) {
    throw notFound('Revision not found for this entity.');
  }
  return revision;
}

/**
 * Restore an entity to a previous revision.
 *
 * Applies the historical snapshot to the live entity and appends a NEW revision
 * capturing the restored state; the source revision and all others are left
 * untouched (docs/08 §11.9: "Restoration creates a new revision rather than
 * destroying historical data").
 */
export async function restoreRevision(
  store: RevisionStore,
  options: RestoreOptions,
): Promise<{ revision: RevisionRecord; entity: RestoredEntity }> {
  const source = await store.find(options.entityId, options.revisionId);
  if (!source) {
    throw notFound('Revision not found for this entity.');
  }

  const entity = await options.applySnapshot(source.snapshot, source);
  const revision = await store.insert({
    entityId: options.entityId,
    version: entity.version,
    title: entity.title,
    snapshot: source.snapshot,
    createdById: options.createdById,
  });

  return { revision, entity };
}
