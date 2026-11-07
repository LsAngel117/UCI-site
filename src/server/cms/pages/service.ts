/**
 * Pages service (Phase 7A, docs/05 §20, docs/08 §10, docs/11 §9).
 *
 * Implements the reusable CMS core ports (`RevisionStore`,
 * `PublicationStore`) with Prisma, validates the boundary payload, and keeps
 * the cover `MediaReference`, SEO row and slug-change redirect in sync. Every
 * editorial rule (lifecycle, publication, slug, concurrency, audit) is
 * delegated to `src/server/cms/*` — nothing is re-implemented here.
 *
 * Redirect foundation (docs/08 §14): when a PUBLISHED page changes slug, the
 * old slug is recorded so the Phase 9 HTTP layer can answer a permanent
 * redirect. Draft slug changes are deliberately not recorded.
 */
import type { Page, SeoMetadata } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreatePageInput,
  PageAdminDto,
  PageContent,
  PageListQuery,
  PageRevisionDto,
  PageSnapshot,
  PaginationMeta,
  UpdatePageInput,
} from '@shared/cms';
import {
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { isContentStatus } from '@shared/types';
import { prisma } from '../../db';
import { recordAudit } from '../audit';
import { conflict, notFound, slugTaken, validation } from '../errors';
import { assertVersionMatches } from '../lifecycle';
import {
  createPublicationService,
  type LifecyclePatch,
  type PublicationService,
  type PublicationStore,
} from '../publication';
import {
  getRevision as getRevisionCore,
  listRevisions as listRevisionsCore,
  restoreRevision as restoreRevisionCore,
  type InsertRevisionInput,
  type RevisionRecord,
  type RevisionStore,
} from '../revisions';
import { loadSeo, loadSeoMap, parseSeoInput, toSeoDto, upsertSeo } from '../seo';
import { generateUniqueSlug, requireAvailableSlug, type SlugTakenProbe } from '../slug';
import { isSlugUniqueViolation } from '../sermons/prisma-errors';

const ENTITY_TYPE = 'PAGE';
const COVER_ENTITY_TYPE = 'page';
const COVER_PURPOSE = 'cover';
const SEO_ENTITY_TYPE = 'page';
const REDIRECT_ENTITY_TYPE = 'page';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Snapshot projection (content frozen into a revision)
// ---------------------------------------------------------------------------

function toPageContent(value: Prisma.JsonValue | null | undefined): PageContent | null {
  if (value === null || value === undefined) return null;
  return value as PageContent;
}

function buildSnapshot(page: Page): PageSnapshot {
  return {
    title: page.title,
    slug: page.slug,
    excerpt: page.excerpt,
    content: toPageContent(page.content),
    coverMediaId: page.coverMediaId,
  };
}

/** Narrow a stored JSON snapshot back to the page content shape. */
function isPageSnapshot(value: unknown): value is PageSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === 'string' && typeof candidate.slug === 'string';
}

/** Translate a snapshot into the Prisma data used to restore the live row. */
function snapshotToData(snapshot: unknown): Prisma.PageUncheckedUpdateInput {
  if (!isPageSnapshot(snapshot)) {
    throw validation('The stored revision snapshot is malformed.', {
      field: 'snapshot',
    });
  }
  const data: Prisma.PageUncheckedUpdateInput = {
    title: snapshot.title,
    slug: snapshot.slug,
    excerpt: snapshot.excerpt ?? null,
  };
  // Older revisions may predate the content/cover columns: leave them untouched.
  if ('content' in snapshot) {
    data.content =
      snapshot.content === null
        ? Prisma.DbNull
        : (snapshot.content as Prisma.InputJsonValue);
  }
  if (snapshot.coverMediaId !== undefined) {
    data.coverMediaId = snapshot.coverMediaId;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Core ports (Prisma implementations)
// ---------------------------------------------------------------------------

const slugTakenProbe: SlugTakenProbe = async (slug, exceptId) => {
  const existing = await prisma.page.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
};

function toRevisionRecord(row: {
  id: string;
  pageId: string;
  version: number;
  title: string;
  snapshot: Prisma.JsonValue;
  createdById: string | null;
  createdAt: Date;
}): RevisionRecord {
  return {
    id: row.id,
    entityId: row.pageId,
    version: row.version,
    title: row.title,
    snapshot: row.snapshot,
    createdById: row.createdById,
    createdAt: row.createdAt,
  };
}

const pageRevisionStore: RevisionStore = {
  async insert(input: InsertRevisionInput): Promise<RevisionRecord> {
    const row = await prisma.pageRevision.create({
      data: {
        pageId: input.entityId,
        version: input.version,
        title: input.title,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        createdById: input.createdById,
      },
    });
    return toRevisionRecord(row);
  },
  async list(entityId: string): Promise<RevisionRecord[]> {
    const rows = await prisma.pageRevision.findMany({
      where: { pageId: entityId },
      orderBy: { version: 'desc' },
    });
    return rows.map(toRevisionRecord);
  },
  async find(entityId: string, revisionId: string): Promise<RevisionRecord | null> {
    const row = await prisma.pageRevision.findFirst({
      where: { id: revisionId, pageId: entityId },
    });
    return row ? toRevisionRecord(row) : null;
  },
};

const pagePublicationStore: PublicationStore<Page> = {
  findById: (id) => prisma.page.findUnique({ where: { id } }),
  listDueForPublish: (now) =>
    prisma.page.findMany({
      where: { status: 'scheduled', publishAt: { lte: now } },
      orderBy: { publishAt: 'asc' },
    }),
  applyLifecycle: async (id, patch: LifecyclePatch) => {
    const data: Prisma.PageUncheckedUpdateInput = {
      status: patch.status,
      version: patch.version,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishAt !== undefined) data.publishAt = patch.publishAt;
    if (patch.unpublishedAt !== undefined) data.unpublishedAt = patch.unpublishedAt;
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById;
    return prisma.page.update({ where: { id }, data });
  },
  buildSnapshot,
};

const publication: PublicationService<Page> = createPublicationService<Page>({
  entityType: ENTITY_TYPE,
  store: pagePublicationStore,
  revisions: pageRevisionStore,
});

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toPageDto(page: Page, seo: SeoMetadata | null): PageAdminDto {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    excerpt: page.excerpt,
    content: toPageContent(page.content),
    coverMediaId: page.coverMediaId,
    seo: toSeoDto(seo),
    status: page.status,
    version: page.version,
    publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
    publishAt: page.publishAt ? page.publishAt.toISOString() : null,
    unpublishedAt: page.unpublishedAt ? page.unpublishedAt.toISOString() : null,
    createdById: page.createdById,
    updatedById: page.updatedById,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

function toRevisionDto(record: RevisionRecord): PageRevisionDto {
  return {
    id: record.id,
    entityId: record.entityId,
    version: record.version,
    title: record.title,
    snapshot: record.snapshot as PageSnapshot,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
  };
}

// The redirect lookup lives in a reusable module (Phase 7B, T7) and is
// re-exported here so existing callers keep a single page-service entry point.
export { findRedirect } from '../redirects/service';

// ---------------------------------------------------------------------------
// Boundary validation
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

/**
 * Validate structured page content. Only a JSON object (or null to clear) is
 * accepted — a string, array or primitive is a 400 before any write, so a
 * rejected payload leaves stored data untouched.
 */
function parseContent(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw validation('"content" must be a JSON object or null.', {
      field: 'content',
    });
  }
  return value as Prisma.InputJsonValue;
}

/**
 * Reject an explicit lifecycle `status` on a generic create/update body: state
 * changes are business actions, never plain editorial fields (docs/08 §22).
 * The only accepted value is `'draft'` (case-insensitive).
 */
function assertNoDirectStatus(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === 'string' && value.toLowerCase() === 'draft') return;
  throw validation(
    '"status" cannot be set directly; use publish/archive actions.',
    { field: 'status' },
  );
}

interface PageContentData {
  title?: string;
  excerpt?: string | null;
  content?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  coverMediaId?: string | null;
}

/** Build the content columns from any provided editorial fields. */
function contentData(input: {
  title?: unknown;
  excerpt?: unknown;
  content?: unknown;
  coverMediaId?: unknown;
}): PageContentData {
  const data: PageContentData = {};
  if (input.title !== undefined) data.title = requireTitle(input.title);
  if (input.excerpt !== undefined) {
    data.excerpt = optionalString(input.excerpt, 'excerpt');
  }
  if (input.content !== undefined) data.content = parseContent(input.content);
  if (input.coverMediaId !== undefined) {
    data.coverMediaId = optionalString(input.coverMediaId, 'coverMediaId');
  }
  return data;
}

/** Validate the cover FK before any write (a missing reference is a 400). */
async function validateReferences(input: { coverMediaId?: unknown }): Promise<void> {
  if (typeof input.coverMediaId !== 'string') return;
  const found = await prisma.mediaAsset.findUnique({
    where: { id: input.coverMediaId },
    select: { id: true },
  });
  if (!found) {
    throw validation('The referenced media asset does not exist.', {
      field: 'coverMediaId',
    });
  }
}

/**
 * Keep the cover `MediaReference` in sync with `Page.coverMediaId`. The
 * relation is rewritten only when the cover actually changed, and a cleared
 * cover removes every `cover`-purpose row for the page.
 */
async function syncCoverReference(
  tx: Tx,
  pageId: string,
  previousId: string | null,
  nextId: string | null | undefined,
): Promise<void> {
  if (nextId === undefined || nextId === previousId) return;
  await tx.mediaReference.deleteMany({
    where: {
      entityType: COVER_ENTITY_TYPE,
      entityId: pageId,
      purpose: COVER_PURPOSE,
    },
  });
  if (nextId) {
    await tx.mediaReference.create({
      data: {
        mediaAssetId: nextId,
        entityType: COVER_ENTITY_TYPE,
        entityId: pageId,
        purpose: COVER_PURPOSE,
      },
    });
  }
}

/**
 * Record/refresh the redirect for a published page whose slug changed. The old
 * slug is the lookup key, so a row is created the first time and updated when
 * the same old slug is mapped to a newer destination.
 */
async function upsertSlugRedirect(
  tx: Tx,
  pageId: string,
  previousSlug: string,
  nextSlug: string,
): Promise<void> {
  if (previousSlug === nextSlug) return;
  await tx.redirect.upsert({
    where: { fromPath: previousSlug },
    update: {
      toPath: nextSlug,
      entityType: REDIRECT_ENTITY_TYPE,
      entityId: pageId,
    },
    create: {
      fromPath: previousSlug,
      toPath: nextSlug,
      entityType: REDIRECT_ENTITY_TYPE,
      entityId: pageId,
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'publishedAt',
  'title',
] as const;

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

async function findPageOrThrow(id: string): Promise<Page> {
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) throw notFound('Page not found.');
  return page;
}

export async function listPages(
  query: PageListQuery,
): Promise<{ data: PageAdminDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.PageWhereInput = {};

  if (query.status !== undefined) {
    if (!isContentStatus(query.status)) {
      throw validation('Invalid "status" filter.', { field: 'status' });
    }
    where.status = query.status;
  }
  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
      { excerpt: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (typeof query.author === 'string' && query.author.length > 0) {
    where.createdById = query.author;
  }
  const publishedRange = dateRange(query.publishedFrom, query.publishedTo);
  if (publishedRange) where.publishedAt = publishedRange;
  const createdRange = dateRange(query.createdFrom, query.createdTo);
  if (createdRange) where.createdAt = createdRange;
  const updatedRange = dateRange(query.updatedFrom, query.updatedTo);
  if (updatedRange) where.updatedAt = updatedRange;

  const requested = resolveSort(query.sort, query.order, LIST_SORT_FIELDS);
  const orderBy = (
    requested ? { [requested.field]: requested.order } : { createdAt: 'desc' }
  ) as Prisma.PageOrderByWithRelationInput;

  const [total, rows] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      orderBy,
      skip: paginationOffset(page, limit),
      take: limit,
    }),
  ]);

  const seoByEntity = await loadSeoMap(SEO_ENTITY_TYPE, rows.map((row) => row.id));

  return {
    data: rows.map((row) => toPageDto(row, seoByEntity.get(row.id) ?? null)),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

export async function getPage(id: string): Promise<PageAdminDto> {
  const page = await findPageOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  return toPageDto(page, seo);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createPage(
  input: CreatePageInput,
  actorId: string | null,
): Promise<PageAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const title = requireTitle(input.title);
  const slug =
    input.slug === undefined || input.slug === null
      ? await generateUniqueSlug(title, slugTakenProbe)
      : await requireAvailableSlug(input.slug, slugTakenProbe);

  const content = contentData(input);
  // Validate the whole payload (including `seo`/cover) before touching the
  // database, so a rejected payload leaves no partial row behind (docs/08 §30).
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.page.create({
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
      if (typeof content.coverMediaId === 'string') {
        await syncCoverReference(tx, created.id, null, content.coverMediaId);
      }
      await upsertSeo(tx, SEO_ENTITY_TYPE, created.id, seoInput);
      return created.id;
    });
  } catch (error) {
    if (isSlugUniqueViolation(error)) throw slugTaken(slug);
    throw error;
  }

  const created = await findPageOrThrow(createdId);
  const seo = await loadSeo(SEO_ENTITY_TYPE, createdId);
  await recordAudit({
    actorId,
    action: 'page.created',
    entityType: ENTITY_TYPE,
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });
  return toPageDto(created, seo);
}

export async function updatePage(
  id: string,
  input: UpdatePageInput,
  actorId: string | null,
): Promise<PageAdminDto> {
  assertNoDirectStatus((input as { status?: unknown }).status);
  const current = await findPageOrThrow(id);
  // Throws 409 CONFLICT on a stale version, 400 on a missing/invalid one.
  const nextVersion = assertVersionMatches(current.version, input.version);

  const content = contentData(input);
  const seoInput = parseSeoInput(input.seo);
  await validateReferences(input);

  const data: Prisma.PageUncheckedUpdateInput = {
    ...content,
    version: nextVersion,
    updatedById: actorId,
  };
  let nextSlug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    nextSlug = await requireAvailableSlug(input.slug, slugTakenProbe, id);
    data.slug = nextSlug;
  }

  // Atomic guard: only the row still at `input.version` is updated, so a racing
  // writer turns this into a 409 instead of a silent overwrite (docs/08 §38).
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.page.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (result.count === 0) {
        throw conflict(
          'The content was modified by someone else. Reload and try again.',
          { expected: current.version, provided: input.version },
        );
      }
      await syncCoverReference(tx, id, current.coverMediaId, content.coverMediaId);
      await upsertSeo(tx, SEO_ENTITY_TYPE, id, seoInput);
      // Redirect only for already-public pages: a draft has no public URL yet.
      if (
        nextSlug !== undefined &&
        current.status === 'published' &&
        nextSlug !== current.slug
      ) {
        await upsertSlugRedirect(tx, id, current.slug, nextSlug);
      }
    });
  } catch (error) {
    if (nextSlug !== undefined && isSlugUniqueViolation(error)) {
      throw slugTaken(nextSlug);
    }
    throw error;
  }

  const updated = await findPageOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  await recordAudit({
    actorId,
    action: 'page.updated',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { version: updated.version },
  });
  return toPageDto(updated, seo);
}

export async function publishPage(
  id: string,
  actorId: string | null,
): Promise<PageAdminDto> {
  await publication.publish(id, actorId);
  return getPage(id);
}

export async function archivePage(
  id: string,
  actorId: string | null,
): Promise<PageAdminDto> {
  await publication.archive(id, actorId);
  return getPage(id);
}

export async function previewPage(id: string): Promise<PageAdminDto> {
  return getPage(id);
}

export async function listPageRevisions(id: string): Promise<PageRevisionDto[]> {
  await findPageOrThrow(id);
  const records = await listRevisionsCore(pageRevisionStore, id);
  return records.map(toRevisionDto);
}

export async function getPageRevision(
  id: string,
  revisionId: string,
): Promise<PageRevisionDto> {
  await findPageOrThrow(id);
  const record = await getRevisionCore(pageRevisionStore, id, revisionId);
  return toRevisionDto(record);
}

export async function restorePageRevision(
  id: string,
  revisionId: string,
  actorId: string | null,
): Promise<PageAdminDto> {
  await findPageOrThrow(id);
  await restoreRevisionCore(pageRevisionStore, {
    entityId: id,
    revisionId,
    createdById: actorId,
    async applySnapshot(snapshot) {
      const currentRow = await findPageOrThrow(id);
      // A historical slug may have been taken since; normalize/validate it so a
      // restore cannot produce a raw unique-constraint 500.
      let restoredSlug = currentRow.slug;
      if (isPageSnapshot(snapshot) && snapshot.slug !== currentRow.slug) {
        restoredSlug = await requireAvailableSlug(snapshot.slug, slugTakenProbe, id);
      }
      const data = snapshotToData(snapshot);
      data.slug = restoredSlug;
      const restoredCover =
        isPageSnapshot(snapshot) && snapshot.coverMediaId !== undefined
          ? snapshot.coverMediaId
          : undefined;
      // A snapshot may reference a cover that was deleted after it was captured
      // (the FK is `SetNull`, so the live row no longer points at it). Validate
      // before the write so a stale reference is the same 400 as create/update
      // instead of a raw FK violation surfacing as a 500 (docs/08 §30).
      await validateReferences({ coverMediaId: restoredCover });
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.page.update({
          where: { id },
          data: {
            ...data,
            version: currentRow.version + 1,
            updatedById: actorId,
          },
        });
        // A restored cover must keep the reference-aware delete in sync with
        // the live `coverMediaId` (docs/12 §20).
        await syncCoverReference(tx, id, currentRow.coverMediaId, restoredCover);
        // Restoring a published snapshot to a different slug changes the live
        // URL exactly like an editorial rename, so it must leave the same
        // redirect trail (docs/05 §27, docs/08 §10.1, docs/10 §5.4): the
        // abandoned slug redirects to the restored one. Any redirect of this
        // page that still *pointed at* the now-dead abandoned slug is removed
        // rather than retargeted — it would otherwise resolve to nothing, and
        // deleting it keeps restore semantics simple.
        if (currentRow.status === 'published' && restoredSlug !== currentRow.slug) {
          await upsertSlugRedirect(tx, id, currentRow.slug, restoredSlug);
          await tx.redirect.deleteMany({
            where: {
              entityType: REDIRECT_ENTITY_TYPE,
              entityId: id,
              toPath: currentRow.slug,
            },
          });
        }
        return row;
      });
      return { version: updated.version, title: updated.title };
    },
  });
  const restored = await findPageOrThrow(id);
  const seo = await loadSeo(SEO_ENTITY_TYPE, id);
  await recordAudit({
    actorId,
    action: 'page.restored',
    entityType: ENTITY_TYPE,
    entityId: id,
    metadata: { revisionId, version: restored.version },
  });
  return toPageDto(restored, seo);
}

/** Promote scheduled pages whose `publishAt` has passed (scheduling foundation). */
export function publishDuePages(now: Date): Promise<Page[]> {
  return publication.publishDue(now);
}

/** Exposed for tests: the content type label used by the core. */
export { ENTITY_TYPE as PAGE_ENTITY_TYPE };
