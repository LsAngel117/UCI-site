/**
 * Reusable CMS editorial contracts (Phase 3, docs/05 §28–33, docs/08 §11.3–11.9).
 *
 * These are the *admin* content DTOs: what the CMS API accepts and returns for
 * publishable entities. They are deliberately content-type-agnostic where the
 * behaviour is shared (lifecycle actions, revision shape, pagination) and only
 * concrete for Sermons, the first content type proven against the core.
 *
 * Nothing in `@shared` imports Prisma or storage internals — the admin UI and
 * the API agree on exactly these shapes (docs/02 §66, docs/08 §48, §55).
 */
import type { ContentStatus } from './types';
import type {
  ApiResponse,
  ListResponse,
  PaginationMeta,
  PaginationParams,
  SortParams,
} from './api';

// Re-export the shared envelope + pagination primitives so a consumer of the
// admin contracts imports from a single place without re-deriving them.
export type { ApiResponse, ListResponse, PaginationMeta, PaginationParams };

// ---------------------------------------------------------------------------
// Editorial actions (docs/05 §30, docs/08 §22–23)
// ---------------------------------------------------------------------------

/**
 * Explicit lifecycle operations. These are the *only* way content changes
 * state: a generic PATCH never does (docs/08 §22). `unpublish` is retained on
 * the core for completeness even though Phase 3 exposes no dedicated endpoint.
 */
export const LIFECYCLE_ACTIONS = [
  'publish',
  'schedule',
  'archive',
  'unpublish',
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/** Type guard for validating untrusted action values at the boundary. */
export function isLifecycleAction(value: unknown): value is LifecycleAction {
  return (
    typeof value === 'string' &&
    (LIFECYCLE_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Publish request body. Publishing is an explicit, body-less business
 * operation (`POST /api/v1/admin/sermons/:id/publish`): it takes no request
 * body and therefore **no `version`** — a stale version never blocks it
 * (docs/08 §22). Contrast `UpdateSermonInput` below, whose `version` is the
 * required optimistic-concurrency guard.
 */
export type PublishInput = Record<string, never>;

/** Schedule request body (`POST /api/v1/admin/sermons/:id/schedule`). */
export interface ScheduleInput {
  /** ISO-8601 instant; must be a valid future timestamp (docs/08 §37). */
  publishAt: string;
}

// ---------------------------------------------------------------------------
// Revisions (docs/05 §32, docs/08 §11.9)
// ---------------------------------------------------------------------------

/**
 * A self-contained snapshot of a content entity's editable fields. Stored in
 * `Revision.snapshot` so a revision can be restored without reconstructing it
 * from the live row. Serialized to JSON in storage, so all values are
 * primitives (dates as ISO strings).
 */
export interface SermonSnapshot {
  title: string;
  slug: string;
  description: string | null;
  scriptureReference: string | null;
  scriptureText: string | null;
  preacherName: string | null;
  /** ISO-8601 date string, or null. */
  sermonDate: string | null;
}

/** Generic revision summary returned by the revisions endpoints. */
export interface RevisionDto {
  id: string;
  /** Parent entity id (the revision belongs to exactly one entity). */
  entityId: string;
  version: number;
  title: string;
  /** The stored snapshot (shape depends on the entity type). */
  snapshot: unknown;
  createdById: string | null;
  createdAt: string;
}

/** Sermon revision with a typed snapshot. */
export interface SermonRevisionDto extends RevisionDto {
  snapshot: SermonSnapshot;
}

// ---------------------------------------------------------------------------
// Admin content DTOs (docs/08 §11.3–11.9)
// ---------------------------------------------------------------------------

/** Full admin representation of a sermon. */
export interface SermonAdminDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  scriptureReference: string | null;
  scriptureText: string | null;
  preacherName: string | null;
  /** ISO-8601 date string, or null. */
  sermonDate: string | null;
  status: ContentStatus;
  /** Optimistic-concurrency counter (docs/08 §38). */
  version: number;
  publishedAt: string | null;
  publishAt: string | null;
  unpublishedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create-sermon body. `status` is deliberately absent — creation always
 * produces a draft; only explicit lifecycle actions may publish (docs/08 §22).
 */
export interface CreateSermonInput {
  title: string;
  /** Auto-generated from the title when omitted (docs/05 §27). */
  slug?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: string | null;
}

/**
 * Update-sermon body. `version` is REQUIRED: it is the optimistic-concurrency
 * guard, and a mismatch is a 409 CONFLICT (docs/08 §38). `status` is absent by
 * design — a PATCH never changes lifecycle state (docs/08 §22).
 */
export interface UpdateSermonInput {
  version: number;
  title?: string;
  slug?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: string | null;
}

/** Admin listing filters (`GET /api/v1/admin/sermons`, docs/08 §11.3). */
export interface SermonListFilters {
  status?: ContentStatus;
  /** Filter by the author (createdBy) user id. */
  author?: string;
  /** Case-insensitive match on the preacher name. */
  preacher?: string;
  publishedFrom?: string;
  publishedTo?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** Query shape accepted by the admin sermon listing (filters + pagination + sort). */
export interface SermonListQuery
  extends PaginationParams, SortParams, SermonListFilters {}

// ---------------------------------------------------------------------------
// ActionResult — paper trail attached to editorial mutations
// ---------------------------------------------------------------------------

/**
 * The revision produced by an editorial action, when one was created. Returned
 * alongside the entity so a client can link straight to the new revision
 * without a follow-up list request.
 */
export interface ActionResult<T> {
  entity: T;
  revision?: RevisionDto;
}
