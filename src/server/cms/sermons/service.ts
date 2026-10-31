/**
 * Sermons service (Phase 3 — the core's first consumer, docs/05 §8, docs/08 §11).
 *
 * This module is deliberately thin: it implements the core's persistence ports
 * (`RevisionStore`, `PublicationStore`) with Prisma, maps rows to admin DTOs,
 * and delegates every editorial rule to `src/server/cms/*`. No lifecycle,
 * revision or slug logic is duplicated here — the module only *consumes* the
 * reusable core (docs/15 §9.9).
 */
import { Prisma } from '@prisma/client';
import type { Sermon } from '@prisma/client';
import type {
  CreateSermonInput,
  PaginationMeta,
  SermonAdminDto,
  SermonListQuery,
  SermonRevisionDto,
  SermonSnapshot,
  UpdateSermonInput,
} from '@shared/cms';
import { resolvePagination, paginationOffset, resolveSort, totalPages } from '@shared/query';
import { isContentStatus } from '@shared/types';
import { prisma } from '../../db';
import { recordAudit } from '../audit';
import { conflict, notFound, slugTaken, validation } from '../errors';
import { assertVersionMatches } from '../lifecycle';
import {
  createPublicationService,
  type PublicationService,
  type PublicationStore,
  type LifecyclePatch,
} from '../publication';
import {
  getRevision as getRevisionCore,
  listRevisions as listRevisionsCore,
  restoreRevision as restoreRevisionCore,
  type InsertRevisionInput,
  type RevisionRecord,
  type RevisionStore,
} from '../revisions';
import { generateUniqueSlug, requireAvailableSlug, type SlugTakenProbe } from '../slug';
import { isSlugUniqueViolation } from './prisma-errors';

const ENTITY_TYPE = 'SERMON';

// ---------------------------------------------------------------------------
// Snapshot projection (content frozen into a revision)
// ---------------------------------------------------------------------------

function buildSnapshot(sermon: Sermon): SermonSnapshot {
  return {
    title: sermon.title,
    slug: sermon.slug,
    description: sermon.description,
    scriptureReference: sermon.scriptureReference,
    scriptureText: sermon.scriptureText,
    preacherName: sermon.preacherName,
    sermonDate: sermon.sermonDate ? sermon.sermonDate.toISOString() : null,
  };
}

/** Narrow a stored JSON snapshot back to the sermon content shape. */
function isSermonSnapshot(value: unknown): value is SermonSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === 'string' && typeof candidate.slug === 'string';
}

/** Translate a snapshot into the Prisma data used to restore the live row. */
function snapshotToData(snapshot: unknown): Prisma.SermonUncheckedUpdateInput {
  if (!isSermonSnapshot(snapshot)) {
    throw validation('The stored revision snapshot is malformed.', {
      field: 'snapshot',
    });
  }
  return {
    title: snapshot.title,
    slug: snapshot.slug,
    description: snapshot.description ?? null,
    scriptureReference: snapshot.scriptureReference ?? null,
    scriptureText: snapshot.scriptureText ?? null,
    preacherName: snapshot.preacherName ?? null,
    sermonDate: snapshot.sermonDate ? new Date(snapshot.sermonDate) : null,
  };
}

// ---------------------------------------------------------------------------
// Core ports (Prisma implementations)
// ---------------------------------------------------------------------------

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.sermon.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

function toRevisionRecord(row: {
  id: string;
  sermonId: string;
  version: number;
  title: string;
  snapshot: Prisma.JsonValue;
  createdById: string | null;
  createdAt: Date;
}): RevisionRecord {
  return {
    id: row.id,
    entityId: row.sermonId,
    version: row.version,
    title: row.title,
    snapshot: row.snapshot,
    createdById: row.createdById,
    createdAt: row.createdAt,
  };
}

const sermonRevisionStore: RevisionStore = {
  async insert(input: InsertRevisionInput): Promise<RevisionRecord> {
    const row = await prisma.sermonRevision.create({
      data: {
        sermonId: input.entityId,
        version: input.version,
        title: input.title,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        createdById: input.createdById,
      },
    });
    return toRevisionRecord(row);
  },
  async list(entityId: string): Promise<RevisionRecord[]> {
    const rows = await prisma.sermonRevision.findMany({
      where: { sermonId: entityId },
      orderBy: { version: 'desc' },
    });
    return rows.map(toRevisionRecord);
  },
  async find(entityId: string, revisionId: string): Promise<RevisionRecord | null> {
    const row = await prisma.sermonRevision.findFirst({
      where: { id: revisionId, sermonId: entityId },
    });
    return row ? toRevisionRecord(row) : null;
  },
};

const sermonPublicationStore: PublicationStore<Sermon> = {
  findById: (id) => prisma.sermon.findUnique({ where: { id } }),
  listDueForPublish: (now) =>
    prisma.sermon.findMany({
      where: { status: 'scheduled', publishAt: { lte: now } },
      orderBy: { publishAt: 'asc' },
    }),
  applyLifecycle: async (id, patch: LifecyclePatch) => {
    const data: Prisma.SermonUncheckedUpdateInput = {
      status: patch.status,
      version: patch.version,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishAt !== undefined) data.publishAt = patch.publishAt;
    if (patch.unpublishedAt !== undefined) data.unpublishedAt = patch.unpublishedAt;
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById;
    return prisma.sermon.update({ where: { id }, data });
  },
  buildSnapshot,
};

/** The reusable publication service wired to sermons. */
const publication: PublicationService<Sermon> = createPublicationService<Sermon>({
  entityType: ENTITY_TYPE,
  store: sermonPublicationStore,
  revisions: sermonRevisionStore,
});

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toSermonDto(sermon: Sermon): SermonAdminDto {
  return {
    id: sermon.id,
    slug: sermon.slug,
    title: sermon.title,
    description: sermon.description,
    scriptureReference: sermon.scriptureReference,
    scriptureText: sermon.scriptureText,
    preacherName: sermon.preacherName,
    sermonDate: sermon.sermonDate ? sermon.sermonDate.toISOString() : null,
    status: sermon.status,
    version: sermon.version,
    publishedAt: sermon.publishedAt ? sermon.publishedAt.toISOString() : null,
    publishAt: sermon.publishAt ? sermon.publishAt.toISOString() : null,
    unpublishedAt: sermon.unpublishedAt ? sermon.unpublishedAt.toISOString() : null,
    createdById: sermon.createdById,
    updatedById: sermon.updatedById,
    createdAt: sermon.createdAt.toISOString(),
    updatedAt: sermon.updatedAt.toISOString(),
  };
}

function toRevisionDto(record: RevisionRecord): SermonRevisionDto {
  return {
    id: record.id,
    entityId: record.entityId,
    version: record.version,
    title: record.title,
    snapshot: record.snapshot as SermonSnapshot,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Input parsing (boundary validation — never trust the body)
// ---------------------------------------------------------------------------

function requireTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation('A non-empty "title" is required.', { field: 'title' });
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an ISO date string or null.`, { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be a valid date.`, { field });
  }
  return date;
}

/** Scalar content columns shared by create and update. */
interface SermonContentData {
  title?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: Date | null;
}

/** Build the content columns from any provided editorial fields. */
function contentData(input: {
  title?: unknown;
  description?: unknown;
  scriptureReference?: unknown;
  scriptureText?: unknown;
  preacherName?: unknown;
  sermonDate?: unknown;
  slug?: unknown;
}): SermonContentData {
  const data: SermonContentData = {};
  if (input.title !== undefined) data.title = requireTitle(input.title);
  if (input.description !== undefined) {
    data.description = optionalString(input.description, 'description');
  }
  if (input.scriptureReference !== undefined) {
    data.scriptureReference = optionalString(
      input.scriptureReference,
      'scriptureReference',
    );
  }
  if (input.scriptureText !== undefined) {
    data.scriptureText = optionalString(input.scriptureText, 'scriptureText');
  }
  if (input.preacherName !== undefined) {
    data.preacherName = optionalString(input.preacherName, 'preacherName');
  }
  if (input.sermonDate !== undefined) {
    data.sermonDate = optionalDate(input.sermonDate, 'sermonDate');
  }
  if (input.slug !== undefined) {
    if (typeof input.slug !== 'string') {
      throw validation('"slug" must be a string.', { field: 'slug' });
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

const LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'publishedAt',
  'sermonDate',
  'title',
] as const;

async function findSermonOrThrow(id: string): Promise<Sermon> {
  const sermon = await prisma.sermon.findUnique({ where: { id } });
  if (!sermon) throw notFound('Sermon not found.');
  return sermon;
}

export async function listSermons(
  query: SermonListQuery,
): Promise<{ data: SermonAdminDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.SermonWhereInput = {};

  if (query.status !== undefined) {
    if (!isContentStatus(query.status)) {
      throw validation('Invalid "status" filter.', { field: 'status' });
    }
    where.status = query.status;
  }
  if (query.author) where.createdById = query.author;
  if (query.preacher) {
    where.preacherName = { contains: query.preacher, mode: 'insensitive' };
  }
  const publishedRange = dateRange(query.publishedFrom, query.publishedTo);
  if (publishedRange) where.publishedAt = publishedRange;
  const createdRange = dateRange(query.createdFrom, query.createdTo);
  if (createdRange) where.createdAt = createdRange;

  const requested = resolveSort(query.sort, query.order, LIST_SORT_FIELDS);
  const orderBy = (
    requested
      ? { [requested.field]: requested.order }
      : { createdAt: 'desc' }
  ) as Prisma.SermonOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.sermon.count({ where }),
    prisma.sermon.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  return {
    data: rows.map(toSermonDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

function dateRange(
  from: unknown,
  to: unknown,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (typeof from === 'string' && from.length > 0) {
    const date = new Date(from);
    if (Number.isNaN(date.getTime())) throw validation('Invalid date filter.');
    range.gte = date;
  }
  if (typeof to === 'string' && to.length > 0) {
    const date = new Date(to);
    if (Number.isNaN(date.getTime())) throw validation('Invalid date filter.');
    range.lte = date;
  }
  return range.gte === undefined && range.lte === undefined ? undefined : range;
}

export function getSermon(id: string): Promise<SermonAdminDto> {
  return findSermonOrThrow(id).then(toSermonDto);
}

export async function createSermon(
  input: CreateSermonInput,
  actorId: string | null,
): Promise<SermonAdminDto> {
  const title = requireTitle(input.title);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(title, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const data = contentData(input);
  let created: Sermon;
  try {
    created = await prisma.sermon.create({
      data: {
        ...data,
        title,
        slug,
        status: 'draft',
        version: 1,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  } catch (error) {
    // The slug probe and the INSERT are not atomic: a concurrent create can
    // take `slug` in between. Map that unique-constraint race back to the same
    // 409 SLUG_TAKEN the probe would have produced (docs/05 §27).
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }
  await recordAudit({
    actorId,
    action: 'sermon.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toSermonDto(created);
}

export async function updateSermon(
  id: string,
  input: UpdateSermonInput,
  actorId: string | null,
): Promise<SermonAdminDto> {
  const current = await findSermonOrThrow(id);
  // Throws 409 CONFLICT on a stale version, 400 on a missing/invalid one.
  const nextVersion = assertVersionMatches(current.version, input.version);

  const data: Prisma.SermonUncheckedUpdateInput = contentData(input);
  let nextSlug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    nextSlug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
    data.slug = nextSlug;
  }
  data.version = nextVersion;
  data.updatedById = actorId;

  // Atomic guard: only the row still at `input.version` is updated. A racing
  // writer turns this into a 409 rather than a silent overwrite (docs/08 §38).
  let result: { count: number };
  try {
    result = await prisma.sermon.updateMany({
      where: { id, version: input.version },
      data,
    });
  } catch (error) {
    // Same non-atomic probe/write race as create, but for a slug change: map
    // the unique-constraint violation to 409 SLUG_TAKEN instead of a 500.
    if (nextSlug !== undefined && isSlugUniqueViolation(error)) {
      throw slugTaken(nextSlug);
    }
    throw error;
  }
  if (result.count === 0) {
    throw conflict(
      'The content was modified by someone else. Reload and try again.',
      { expected: current.version, provided: input.version },
    );
  }

  const updated = await findSermonOrThrow(id);
  await recordAudit({
    actorId,
    action: 'sermon.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toSermonDto(updated);
}

export async function publishSermon(
  id: string,
  actorId: string | null,
): Promise<SermonAdminDto> {
  const result = await publication.publish(id, actorId);
  return toSermonDto(result.entity);
}

export async function scheduleSermon(
  id: string,
  publishAt: unknown,
  actorId: string | null,
): Promise<SermonAdminDto> {
  const result = await publication.schedule(id, publishAt, actorId);
  return toSermonDto(result.entity);
}

export async function archiveSermon(
  id: string,
  actorId: string | null,
): Promise<SermonAdminDto> {
  const result = await publication.archive(id, actorId);
  return toSermonDto(result.entity);
}

export async function previewSermon(id: string): Promise<SermonAdminDto> {
  return getSermon(id);
}

export async function listSermonRevisions(
  id: string,
): Promise<SermonRevisionDto[]> {
  await findSermonOrThrow(id);
  const records = await listRevisionsCore(sermonRevisionStore, id);
  return records.map(toRevisionDto);
}

export async function getSermonRevision(
  id: string,
  revisionId: string,
): Promise<SermonRevisionDto> {
  await findSermonOrThrow(id);
  const record = await getRevisionCore(sermonRevisionStore, id, revisionId);
  return toRevisionDto(record);
}

export async function restoreSermonRevision(
  id: string,
  revisionId: string,
  actorId: string | null,
): Promise<SermonAdminDto> {
  await findSermonOrThrow(id);
  await restoreRevisionCore(sermonRevisionStore, {
    entityId: id,
    revisionId,
    createdById: actorId,
    async applySnapshot(snapshot) {
      const currentRow = await findSermonOrThrow(id);
      const updated = await prisma.sermon.update({
        where: { id },
        data: {
          ...snapshotToData(snapshot),
          version: currentRow.version + 1,
          updatedById: actorId,
        },
      });
      return { version: updated.version, title: updated.title };
    },
  });
  const restored = await findSermonOrThrow(id);
  await recordAudit({
    actorId,
    action: 'sermon.restored',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { revisionId, version: restored.version },
  });
  return toSermonDto(restored);
}

/** Promote scheduled sermons whose `publishAt` has passed (scheduling foundation). */
export function publishDueSermons(now: Date): Promise<Sermon[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as SERMON_ENTITY_TYPE };
