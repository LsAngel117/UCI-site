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
import type {
  Person,
  Sermon,
  SermonSeries,
  SeoMetadata,
  Topic,
} from '@prisma/client';
import type {
  CreateSermonInput,
  PaginationMeta,
  PersonDto,
  SermonAdminDto,
  SermonListQuery,
  SermonRevisionDto,
  SermonSeoDto,
  SermonSeoInput,
  SermonSeriesDto,
  SermonSnapshot,
  TopicDto,
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

/**
 * Entity/purpose recorded in `MediaReference` for a sermon cover (Phase 5A).
 * Lowercase `sermon` is the canonical value for this relation; the Phase 4
 * reference-aware delete only counts rows, so it stays provider-agnostic.
 */
const COVER_ENTITY_TYPE = 'sermon';
const COVER_PURPOSE = 'cover';

/** Entity type used for `SeoMetadata` rows owned by a sermon. */
const SEO_ENTITY_TYPE = 'sermon';

/** Relations every admin sermon DTO is hydrated from. */
const sermonInclude = {
  preacher: true,
  series: true,
  topics: { include: { topic: true } },
} satisfies Prisma.SermonInclude;

type SermonWithRelations = Prisma.SermonGetPayload<{
  include: typeof sermonInclude;
}>;

/** Prisma transaction client (the subset used here). */
type Tx = Prisma.TransactionClient;

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
    preacherId: sermon.preacherId,
    seriesId: sermon.seriesId,
    coverMediaId: sermon.coverMediaId,
    notesMediaId: sermon.notesMediaId,
    videoProvider: sermon.videoProvider,
    videoExternalId: sermon.videoExternalId,
    videoUrl: sermon.videoUrl,
    audioUrl: sermon.audioUrl,
    notesContent: sermon.notesContent,
    durationMinutes: sermon.durationMinutes,
    featured: sermon.featured,
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
  const data: Prisma.SermonUncheckedUpdateInput = {
    title: snapshot.title,
    slug: snapshot.slug,
    description: snapshot.description ?? null,
    scriptureReference: snapshot.scriptureReference ?? null,
    scriptureText: snapshot.scriptureText ?? null,
    preacherName: snapshot.preacherName ?? null,
    sermonDate: snapshot.sermonDate ? new Date(snapshot.sermonDate) : null,
  };
  // Phase 5A fields are optional in the snapshot type: a revision stored before
  // the sermon domain landed must leave those columns untouched on restore.
  if (snapshot.preacherId !== undefined) data.preacherId = snapshot.preacherId;
  if (snapshot.seriesId !== undefined) data.seriesId = snapshot.seriesId;
  if (snapshot.coverMediaId !== undefined) data.coverMediaId = snapshot.coverMediaId;
  if (snapshot.notesMediaId !== undefined) data.notesMediaId = snapshot.notesMediaId;
  if (snapshot.videoProvider !== undefined) data.videoProvider = snapshot.videoProvider;
  if (snapshot.videoExternalId !== undefined) data.videoExternalId = snapshot.videoExternalId;
  if (snapshot.videoUrl !== undefined) data.videoUrl = snapshot.videoUrl;
  if (snapshot.audioUrl !== undefined) data.audioUrl = snapshot.audioUrl;
  if (snapshot.notesContent !== undefined) data.notesContent = snapshot.notesContent;
  if (snapshot.durationMinutes !== undefined) data.durationMinutes = snapshot.durationMinutes;
  if (snapshot.featured !== undefined) data.featured = snapshot.featured;
  return data;
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

function toPersonDto(person: Person): PersonDto {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    displayName: person.displayName,
    role: person.role,
    photoMediaId: person.photoMediaId,
    active: person.active,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function toSeriesDto(series: SermonSeries): SermonSeriesDto {
  return {
    id: series.id,
    name: series.name,
    slug: series.slug,
    startDate: series.startDate ? series.startDate.toISOString() : null,
    endDate: series.endDate ? series.endDate.toISOString() : null,
    coverMediaId: series.coverMediaId,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  };
}

function toTopicDto(topic: Topic): TopicDto {
  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
}

function toSeoDto(seo: SeoMetadata | null): SermonSeoDto | null {
  if (!seo) return null;
  return {
    title: seo.title,
    description: seo.description,
    canonicalUrl: seo.canonicalUrl,
    ogImageUrl: seo.ogImageUrl,
  };
}

/** Load the SEO row for a sermon (polymorphic, so not a Prisma relation). */
function loadSeo(entityId: string): Promise<SeoMetadata | null> {
  return prisma.seoMetadata.findUnique({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId },
    },
  });
}

/** Batch-load SEO rows for a page of sermons (avoids an N+1 query). */
async function loadSeoMap(ids: string[]): Promise<Map<string, SeoMetadata>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.seoMetadata.findMany({
    where: { entityType: SEO_ENTITY_TYPE, entityId: { in: ids } },
  });
  return new Map(rows.map((row) => [row.entityId, row]));
}

function toSermonDto(
  sermon: SermonWithRelations,
  seo: SeoMetadata | null,
): SermonAdminDto {
  return {
    id: sermon.id,
    slug: sermon.slug,
    title: sermon.title,
    description: sermon.description,
    scriptureReference: sermon.scriptureReference,
    scriptureText: sermon.scriptureText,
    preacherName: sermon.preacherName,
    sermonDate: sermon.sermonDate ? sermon.sermonDate.toISOString() : null,
    preacherId: sermon.preacherId,
    preacher: sermon.preacher ? toPersonDto(sermon.preacher) : null,
    seriesId: sermon.seriesId,
    series: sermon.series ? toSeriesDto(sermon.series) : null,
    topics: sermon.topics.map((link) => toTopicDto(link.topic)),
    coverMediaId: sermon.coverMediaId,
    notesMediaId: sermon.notesMediaId,
    videoProvider: sermon.videoProvider,
    videoExternalId: sermon.videoExternalId,
    videoUrl: sermon.videoUrl,
    audioUrl: sermon.audioUrl,
    notesContent: sermon.notesContent,
    durationMinutes: sermon.durationMinutes,
    featured: sermon.featured,
    seo: toSeoDto(seo),
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

/** A non-negative integer, or null. */
function optionalInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw validation(`"${field}" must be a non-negative integer or null.`, {
      field,
    });
  }
  return value;
}

/** A boolean, or null when omitted. */
function optionalBool(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw validation(`"${field}" must be a boolean or null.`, { field });
  }
  return value;
}

/**
 * Reject an explicit lifecycle `status` on a generic create/update body: state
 * changes are business actions (`publish`/`schedule`/`archive`), never plain
 * editorial fields (docs/08 §22). The only accepted value is `'draft'`
 * (case-insensitive), which matches the canonical create default; an omitted
 * value is a no-op. Any other provided value is a 400 before any write, so a
 * rejected payload leaves stored data untouched.
 */
function assertNoDirectStatus(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === 'string' && value.toLowerCase() === 'draft') return;
  throw validation(
    '"status" cannot be set directly; use publish/schedule/archive actions.',
    { field: 'status' },
  );
}

/** Scalar content columns shared by create and update. */
interface SermonContentData {
  title?: string;
  description?: string | null;
  scriptureReference?: string | null;
  scriptureText?: string | null;
  preacherName?: string | null;
  sermonDate?: Date | null;
  preacherId?: string | null;
  seriesId?: string | null;
  coverMediaId?: string | null;
  notesMediaId?: string | null;
  videoProvider?: string | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  notesContent?: string | null;
  durationMinutes?: number | null;
  featured?: boolean;
}

/** Build the content columns from any provided editorial fields. */
function contentData(input: {
  title?: unknown;
  description?: unknown;
  scriptureReference?: unknown;
  scriptureText?: unknown;
  preacherName?: unknown;
  sermonDate?: unknown;
  preacherId?: unknown;
  seriesId?: unknown;
  coverMediaId?: unknown;
  notesMediaId?: unknown;
  videoProvider?: unknown;
  videoExternalId?: unknown;
  videoUrl?: unknown;
  audioUrl?: unknown;
  notesContent?: unknown;
  durationMinutes?: unknown;
  featured?: unknown;
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
  if (input.preacherId !== undefined) {
    data.preacherId = optionalString(input.preacherId, 'preacherId');
  }
  if (input.seriesId !== undefined) {
    data.seriesId = optionalString(input.seriesId, 'seriesId');
  }
  if (input.coverMediaId !== undefined) {
    data.coverMediaId = optionalString(input.coverMediaId, 'coverMediaId');
  }
  if (input.notesMediaId !== undefined) {
    data.notesMediaId = optionalString(input.notesMediaId, 'notesMediaId');
  }
  if (input.videoProvider !== undefined) {
    data.videoProvider = optionalString(input.videoProvider, 'videoProvider');
  }
  if (input.videoExternalId !== undefined) {
    data.videoExternalId = optionalString(
      input.videoExternalId,
      'videoExternalId',
    );
  }
  if (input.videoUrl !== undefined) {
    data.videoUrl = optionalString(input.videoUrl, 'videoUrl');
  }
  if (input.audioUrl !== undefined) {
    data.audioUrl = optionalString(input.audioUrl, 'audioUrl');
  }
  if (input.notesContent !== undefined) {
    data.notesContent = optionalString(input.notesContent, 'notesContent');
  }
  if (input.durationMinutes !== undefined) {
    data.durationMinutes = optionalInt(input.durationMinutes, 'durationMinutes');
  }
  if (input.featured !== undefined) {
    const featured = optionalBool(input.featured, 'featured');
    if (featured === null) {
      throw validation('"featured" must be a boolean.', { field: 'featured' });
    }
    data.featured = featured;
  }
  if (input.slug !== undefined) {
    if (typeof input.slug !== 'string') {
      throw validation('"slug" must be a string.', { field: 'slug' });
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Phase 5A — reference validation + relation synchronisation
// ---------------------------------------------------------------------------

/**
 * Validate every FK a create/update provides. A missing reference is a 400
 * (never a raw FK 500), and validation happens before any write so a rejected
 * payload leaves stored data untouched.
 */
async function validateReferences(input: {
  preacherId?: unknown;
  seriesId?: unknown;
  topicIds?: unknown;
  coverMediaId?: unknown;
  notesMediaId?: unknown;
}): Promise<void> {
  if (typeof input.preacherId === 'string') {
    await assertPersonExists(input.preacherId, 'preacherId');
  }
  if (typeof input.seriesId === 'string') {
    await assertSeriesExists(input.seriesId, 'seriesId');
  }
  if (input.topicIds !== undefined) {
    const ids = normalizeTopicIds(input.topicIds);
    if (ids.length > 0) {
      const found = await prisma.topic.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw validation('One or more topics do not exist.', { field: 'topicIds' });
      }
    }
  }
  if (typeof input.coverMediaId === 'string') {
    await assertMediaExists(input.coverMediaId, 'coverMediaId');
  }
  if (typeof input.notesMediaId === 'string') {
    await assertMediaExists(input.notesMediaId, 'notesMediaId');
  }
}

async function assertPersonExists(id: string, field: string): Promise<void> {
  const found = await prisma.person.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw validation('The referenced preacher does not exist.', { field });
}

async function assertSeriesExists(id: string, field: string): Promise<void> {
  const found = await prisma.sermonSeries.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw validation('The referenced series does not exist.', { field });
}

async function assertMediaExists(id: string, field: string): Promise<void> {
  const found = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw validation('The referenced media asset does not exist.', {
    field,
  });
}

/** Parse a topic-id list: strings only, de-duplicated, order preserved. */
function normalizeTopicIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw validation('"topicIds" must be an array of topic ids.', {
      field: 'topicIds',
    });
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw validation('"topicIds" must contain non-empty strings.', {
        field: 'topicIds',
      });
    }
    if (!seen.has(entry)) {
      seen.add(entry);
      ids.push(entry);
    }
  }
  return ids;
}

/**
 * Keep the cover `MediaReference` in sync with `Sermon.coverMediaId`. The
 * relation is rewritten only when the cover actually changed, and a cleared
 * cover removes every `cover`-purpose row for the sermon.
 */
async function syncCoverReference(
  tx: Tx,
  sermonId: string,
  previousId: string | null,
  nextId: string | null | undefined,
): Promise<void> {
  if (nextId === undefined || nextId === previousId) return;
  await tx.mediaReference.deleteMany({
    where: {
      entityType: COVER_ENTITY_TYPE,
      entityId: sermonId,
      purpose: COVER_PURPOSE,
    },
  });
  if (nextId) {
    await tx.mediaReference.create({
      data: {
        mediaAssetId: nextId,
        entityType: COVER_ENTITY_TYPE,
        entityId: sermonId,
        purpose: COVER_PURPOSE,
      },
    });
  }
}

/** Validate an optional http(s) URL used by SEO fields. */
function seoUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  return value;
}

/** Validate an optional SEO text field. */
function seoText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  return value;
}

/** The only keys `SermonSeoInput` accepts (docs/05 §26, `@shared/cms`). */
const SEO_INPUT_KEYS = new Set(['title', 'description', 'canonicalUrl', 'ogImageUrl']);

/**
 * Validate the untrusted `seo` field of a create/update body against the
 * `SermonSeoInput` contract (docs/05 §26). An omitted (or explicit `null`)
 * field is a no-op — the shared DTO allows `SermonSeoInput | null` — but a
 * *provided* non-null field must be a plain object carrying only the supported
 * keys with the right scalar types. A string or array is a 400, not a silently
 * ignored value (the previous behaviour persisted nothing and hid the client's
 * mistake). Validation happens before any write, so a rejected payload leaves
 * stored data and counters untouched.
 */
function parseSeoInput(value: unknown): SermonSeoInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw validation('"seo" must be an object.', { field: 'seo' });
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!SEO_INPUT_KEYS.has(key)) {
      throw validation(`"seo.${key}" is not a supported SEO field.`, {
        field: `seo.${key}`,
      });
    }
  }
  const parsed: SermonSeoInput = {};
  if ('title' in input) parsed.title = seoText(input.title, 'seo.title');
  if ('description' in input) {
    parsed.description = seoText(input.description, 'seo.description');
  }
  if ('canonicalUrl' in input) {
    parsed.canonicalUrl = seoUrl(input.canonicalUrl, 'seo.canonicalUrl');
  }
  if ('ogImageUrl' in input) {
    parsed.ogImageUrl = seoUrl(input.ogImageUrl, 'seo.ogImageUrl');
  }
  return parsed;
}

/**
 * Upsert a sermon's `SeoMetadata` from the already-validated SEO fields.
 * Unspecified keys keep their stored value. A no-op when `seo` was omitted.
 */
async function upsertSeo(
  tx: Tx,
  sermonId: string,
  seo: SermonSeoInput | undefined,
): Promise<void> {
  if (seo === undefined) return;
  const input = seo as Record<string, unknown>;
  const update: Prisma.SeoMetadataUncheckedUpdateInput = {};
  const create: Prisma.SeoMetadataUncheckedCreateInput = {
    entityType: SEO_ENTITY_TYPE,
    entityId: sermonId,
  };
  if ('title' in input) {
    const title = seoText(input.title, 'seo.title');
    update.title = title;
    create.title = title;
  }
  if ('description' in input) {
    const description = seoText(input.description, 'seo.description');
    update.description = description;
    create.description = description;
  }
  if ('canonicalUrl' in input) {
    const canonicalUrl = seoUrl(input.canonicalUrl, 'seo.canonicalUrl');
    update.canonicalUrl = canonicalUrl;
    create.canonicalUrl = canonicalUrl;
  }
  if ('ogImageUrl' in input) {
    const ogImageUrl = seoUrl(input.ogImageUrl, 'seo.ogImageUrl');
    update.ogImageUrl = ogImageUrl;
    create.ogImageUrl = ogImageUrl;
  }
  if (Object.keys(update).length === 0) return;

  await tx.seoMetadata.upsert({
    where: {
      entityType_entityId: { entityType: SEO_ENTITY_TYPE, entityId: sermonId },
    },
    update,
    create,
  });
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

async function findSermonOrThrow(id: string): Promise<SermonWithRelations> {
  const sermon = await prisma.sermon.findUnique({
    where: { id },
    include: sermonInclude,
  });
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
    // Mirror the public archive: the term matches the legacy denormalized name,
    // the related `Person.displayName`, or the preacher id itself, so a sermon
    // linked through `preacherId` is found even when `preacherName` is unset.
    where.OR = [
      { preacherName: { contains: query.preacher, mode: 'insensitive' } },
      {
        preacher: {
          is: { displayName: { contains: query.preacher, mode: 'insensitive' } },
        },
      },
      { preacherId: query.preacher },
    ];
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
      include: sermonInclude,
    }),
  ]);

  const seoByEntity = await loadSeoMap(rows.map((row) => row.id));

  return {
    data: rows.map((row) => toSermonDto(row, seoByEntity.get(row.id) ?? null)),
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

export async function getSermon(id: string): Promise<SermonAdminDto> {
  const sermon = await findSermonOrThrow(id);
  const seo = await loadSeo(id);
  return toSermonDto(sermon, seo);
}

export async function createSermon(
  input: CreateSermonInput,
  actorId: string | null,
): Promise<SermonAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const title = requireTitle(input.title);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(title, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const content = contentData(input);
  const topicIds = normalizeTopicIds(input.topicIds);
  // Validate the whole payload (including `seo`) before touching the database,
  // so a rejected payload leaves no partial row behind (docs/08 §30).
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.sermon.create({
        data: {
          ...content,
          title,
          slug,
          status: 'draft',
          version: 1,
          createdById: actorId,
          updatedById: actorId,
        },
      });

      if (topicIds.length > 0) {
        await tx.sermonTopic.createMany({
          data: topicIds.map((topicId) => ({ sermonId: created.id, topicId })),
        });
      }
      if (content.coverMediaId) {
        await syncCoverReference(tx, created.id, null, content.coverMediaId);
      }
      await upsertSeo(tx, created.id, seoInput);
      return created.id;
    });
  } catch (error) {
    // The slug probe and the INSERT are not atomic: a concurrent create can
    // take `slug` in between. Map that unique-constraint race back to the same
    // 409 SLUG_TAKEN the probe would have produced (docs/05 §27).
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }

  const created = await findSermonOrThrow(createdId);
  const seo = await loadSeo(createdId);
  await recordAudit({
    actorId,
    action: 'sermon.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toSermonDto(created, seo);
}

export async function updateSermon(
  id: string,
  input: UpdateSermonInput,
  actorId: string | null,
): Promise<SermonAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const current = await findSermonOrThrow(id);
  // Throws 409 CONFLICT on a stale version, 400 on a missing/invalid one.
  const nextVersion = assertVersionMatches(current.version, input.version);

  const content = contentData(input);
  // Validate `seo` before any write: a malformed value is a 400, never a
  // silently ignored field (docs/08 §30).
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);
  const topicIds =
    input.topicIds === undefined ? undefined : normalizeTopicIds(input.topicIds);

  const data: Prisma.SermonUncheckedUpdateInput = {
    ...content,
    version: nextVersion,
    updatedById: actorId,
  };
  let nextSlug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    nextSlug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
    data.slug = nextSlug;
  }

  // Atomic guard: only the row still at `input.version` is updated. A racing
  // writer turns this into a 409 rather than a silent overwrite (docs/08 §38).
  // The related rows (topics, cover reference, SEO) are written in the same
  // transaction so a failure never leaves them out of sync with the sermon.
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.sermon.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (result.count === 0) {
        throw conflict(
          'The content was modified by someone else. Reload and try again.',
          { expected: current.version, provided: input.version },
        );
      }

      if (topicIds !== undefined) {
        await tx.sermonTopic.deleteMany({ where: { sermonId: id } });
        if (topicIds.length > 0) {
          await tx.sermonTopic.createMany({
            data: topicIds.map((topicId) => ({ sermonId: id, topicId })),
          });
        }
      }
      await syncCoverReference(tx, id, current.coverMediaId, content.coverMediaId);
      await upsertSeo(tx, id, seoInput);
    });
  } catch (error) {
    // Same non-atomic probe/write race as create, but for a slug change: map
    // the unique-constraint violation to 409 SLUG_TAKEN instead of a 500.
    if (nextSlug !== undefined && isSlugUniqueViolation(error)) {
      throw slugTaken(nextSlug);
    }
    throw error;
  }

  const updated = await findSermonOrThrow(id);
  const seo = await loadSeo(id);
  await recordAudit({
    actorId,
    action: 'sermon.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toSermonDto(updated, seo);
}

export async function publishSermon(
  id: string,
  actorId: string | null,
): Promise<SermonAdminDto> {
  await publication.publish(id, actorId);
  return getSermon(id);
}

export async function scheduleSermon(
  id: string,
  publishAt: unknown,
  actorId: string | null,
): Promise<SermonAdminDto> {
  await publication.schedule(id, publishAt, actorId);
  return getSermon(id);
}

export async function archiveSermon(
  id: string,
  actorId: string | null,
): Promise<SermonAdminDto> {
  await publication.archive(id, actorId);
  return getSermon(id);
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
      const restoredCover =
        isSermonSnapshot(snapshot) && snapshot.coverMediaId !== undefined
          ? snapshot.coverMediaId
          : undefined;
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.sermon.update({
          where: { id },
          data: {
            ...snapshotToData(snapshot),
            version: currentRow.version + 1,
            updatedById: actorId,
          },
        });
        // A restored cover must keep the reference-aware delete in sync with
        // the live `coverMediaId` (docs/12 §20).
        await syncCoverReference(tx, id, currentRow.coverMediaId, restoredCover);
        return row;
      });
      return { version: updated.version, title: updated.title };
    },
  });
  const restored = await findSermonOrThrow(id);
  const seo = await loadSeo(id);
  await recordAudit({
    actorId,
    action: 'sermon.restored',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { revisionId, version: restored.version },
  });
  return toSermonDto(restored, seo);
}

/** Promote scheduled sermons whose `publishAt` has passed (scheduling foundation). */
export function publishDueSermons(now: Date): Promise<Sermon[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as SERMON_ENTITY_TYPE };
