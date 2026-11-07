/**
 * Media service — the application layer for uploads, metadata, listing and
 * reference-aware deletion (docs/12 §20, docs/08 §15).
 *
 * Rules enforced here, independent of the HTTP layer:
 *   - MIME allowlist + magic-byte signature + size limit;
 *   - app-generated storage keys (never the user filename);
 *   - binary persistence through `MediaStorage`, metadata in PostgreSQL;
 *   - reference-aware deletion (`MEDIA_REFERENCED` unless forced);
 *   - compensation when metadata persistence fails after a binary was stored.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PaginationMeta } from '@shared/api';
import type {
  MediaDeleteResponse,
  MediaDto,
  MediaListQuery,
  MediaReferencesResponse,
  UpdateMediaInput,
} from '@shared/media';
import {
  isAllowedMediaMimeType,
  isMediaType,
  MEDIA_SORT_FIELDS,
} from '@shared/media';
import {
  isSortOrder,
  paginationOffset,
  resolvePagination,
  resolveSort,
  totalPages,
} from '@shared/query';
import { recordAudit } from '../cms/audit';
import { toMediaDto, toMediaReferenceDto } from './dto';
import {
  fileTooLarge,
  mediaReferenced,
  notFound,
  validation,
} from './errors';
import {
  assertContentMatches,
  buildStorageKey,
  normalizeFolder,
  normalizeMimeType,
  resolveUploadType,
} from './files';
import { processImage } from './images';
import * as repository from './repository';
import { sanitizeOriginalFilename, type MediaStorage } from './storage';

export interface UploadFile {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface UploadMetadata {
  folder?: string;
  alt?: string;
  title?: string;
  description?: string;
  caption?: string;
}

export interface MediaServiceOptions {
  storage: MediaStorage;
  maxUploadBytes: number;
  now?: () => Date;
  generateId?: () => string;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string or null.`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validation(`"${field}" must be at most ${maxLength} characters.`, {
      field,
    });
  }
  return trimmed;
}

function parseDateBoundary(
  value: unknown,
  field: 'createdFrom' | 'createdTo',
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an ISO date string.`, { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be a valid date.`, { field });
  }
  // A bare `YYYY-MM-DD` upper bound means "through the end of that day".
  if (field === 'createdTo' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function updateDataFrom(input: unknown): Prisma.MediaAssetUncheckedUpdateInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw validation('The request body must be a JSON object.');
  }
  const record = input as Record<string, unknown>;
  const data: Prisma.MediaAssetUncheckedUpdateInput = {};
  if ('alt' in record) data.altText = optionalText(record.alt, 'alt', 500);
  if ('title' in record) data.title = optionalText(record.title, 'title', 200);
  if ('description' in record) {
    data.description = optionalText(record.description, 'description', 5000);
  }
  if ('caption' in record) {
    data.caption = optionalText(record.caption, 'caption', 500);
  }
  return data;
}

/**
 * Translate a validated list query into a Prisma filter. Shared by the normal
 * library listing and the orphan review endpoint so both apply exactly the same
 * search/type/MIME/folder/date semantics.
 */
function buildAssetWhere(query: MediaListQuery): Prisma.MediaAssetWhereInput {
  const where: Prisma.MediaAssetWhereInput = {};

  if (query.search !== undefined && query.search !== '') {
    if (typeof query.search !== 'string') {
      throw validation('"search" must be a string.', { field: 'search' });
    }
    const search = query.search.trim();
    if (search.length > 200) {
      throw validation('"search" must be at most 200 characters.', {
        field: 'search',
      });
    }
    if (search.length > 0) {
      where.OR = [
        { filename: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { altText: { contains: search, mode: 'insensitive' } },
        { caption: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
  }

  if (query.type !== undefined) {
    if (!isMediaType(query.type)) {
      throw validation('Invalid "type" filter.', { field: 'type' });
    }
    where.type = query.type;
  }

  if (query.mimeType !== undefined && query.mimeType !== '') {
    const mimeType = normalizeMimeType(String(query.mimeType));
    if (!isAllowedMediaMimeType(mimeType)) {
      throw validation('Invalid "mimeType" filter.', { field: 'mimeType' });
    }
    where.mimeType = mimeType;
  }

  if (query.folder !== undefined && query.folder !== '') {
    if (typeof query.folder !== 'string') {
      throw validation('"folder" must be a string.', { field: 'folder' });
    }
    where.folder = query.folder.trim();
  }

  const createdFrom = parseDateBoundary(query.createdFrom, 'createdFrom');
  const createdTo = parseDateBoundary(query.createdTo, 'createdTo');
  if (
    createdFrom &&
    createdTo &&
    createdFrom.getTime() > createdTo.getTime()
  ) {
    throw validation('"createdFrom" must be before "createdTo".', {
      field: 'createdFrom',
    });
  }
  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: createdFrom } : {}),
      ...(createdTo ? { lte: createdTo } : {}),
    };
  }

  return where;
}

/**
 * Resolve the requested ordering. A client that *provides* `sort` or `order`
 * must provide valid values: an unsupported field or direction is a 400, never
 * a silent fallback (docs/08 §26). Omitting both keeps the default ordering.
 */
function resolveAssetOrder(
  query: MediaListQuery,
): Prisma.MediaAssetOrderByWithRelationInput {
  const rawSort: unknown = query.sort;
  const rawOrder: unknown = query.order;
  const sortProvided = rawSort !== undefined && rawSort !== '';
  const orderProvided = rawOrder !== undefined && rawOrder !== '';

  if (orderProvided && !isSortOrder(rawOrder)) {
    throw validation('Invalid "order". Expected "asc" or "desc".', {
      field: 'order',
    });
  }

  const requested = resolveSort(rawSort, rawOrder, MEDIA_SORT_FIELDS);
  if (sortProvided && requested === null) {
    throw validation('Invalid "sort" field.', { field: 'sort' });
  }

  return (
    requested
      ? { [requested.field]: requested.order }
      : { createdAt: 'desc' }
  ) as Prisma.MediaAssetOrderByWithRelationInput;
}

export class MediaService {
  private readonly storage: MediaStorage;
  private readonly maxUploadBytes: number;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(options: MediaServiceOptions) {
    this.storage = options.storage;
    this.maxUploadBytes = options.maxUploadBytes;
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  /**
   * Persist an upload. The binary is written first, then metadata; on a DB
   * failure every stored key (original + variants) is removed so no orphan
   * file survives (docs/12 §58).
   */
  async upload(
    file: UploadFile,
    metadata: UploadMetadata,
    actorId: string | null,
  ): Promise<MediaDto> {
    if (!Buffer.isBuffer(file.data) || file.data.length === 0) {
      throw validation('The uploaded file is empty.', { field: 'file' });
    }
    if (file.data.length > this.maxUploadBytes) {
      throw fileTooLarge(this.maxUploadBytes);
    }

    const mimeType = normalizeMimeType(file.mimeType);
    const allowed = resolveUploadType(mimeType);
    assertContentMatches(allowed.mimeType, file.data);

    const folder = normalizeFolder(
      metadata.folder,
      allowed.type === 'DOCUMENT' ? 'documents' : 'uploads',
    );
    const assetId = this.generateId();
    const at = this.now();
    const storageKey = buildStorageKey(folder, allowed.extension, at, assetId);

    const storedKeys: string[] = [];
    let asset: Awaited<ReturnType<typeof repository.createAsset>>;

    try {
      await this.storage.put(storageKey, file.data, allowed.mimeType);
      storedKeys.push(storageKey);

      let width: number | null = null;
      let height: number | null = null;
      const variants: repository.VariantRecord[] = [];

      if (allowed.type === 'IMAGE') {
        const processed = await processImage(file.data, storageKey);
        width = processed.width;
        height = processed.height;
        for (const variant of processed.variants) {
          await this.storage.put(variant.storageKey, variant.data, 'image/webp');
          storedKeys.push(variant.storageKey);
          variants.push({
            label: variant.label,
            format: variant.format,
            storageKey: variant.storageKey,
            url: this.storage.getPublicUrl(variant.storageKey),
            width: variant.width,
            height: variant.height,
            size: variant.size,
          });
        }
      }

      asset = await repository.createAsset(
        {
          id: assetId,
          type: allowed.type,
          filename: sanitizeOriginalFilename(file.filename),
          mimeType: allowed.mimeType,
          size: file.data.length,
          storageKey,
          provider: this.storage.provider,
          // Cached for record completeness; DTOs re-derive it from storageKey.
          url: this.storage.getPublicUrl(storageKey),
          altText: optionalText(metadata.alt, 'alt', 500),
          title: optionalText(metadata.title, 'title', 200),
          description: optionalText(metadata.description, 'description', 5000),
          caption: optionalText(metadata.caption, 'caption', 500),
          folder,
          width,
          height,
          createdById: actorId,
        },
        variants,
      );
    } catch (error) {
      // The DB row was never committed: remove every binary we wrote so a
      // failed upload leaves no orphan file (docs/12 §58).
      await Promise.allSettled(
        storedKeys.map((key) => this.storage.delete(key)),
      );
      throw error;
    }

    // Audit runs after the asset is committed; a failure here must not delete
    // a valid binary. (recordAudit is a separate statement by design.)
    await recordAudit({
      actorId,
      action: 'media.upload',
      entityType: 'MEDIA',
      entityId: asset.id,
      metadata: { storageKey, mimeType: allowed.mimeType, size: file.data.length },
    });

    return toMediaDto(asset, this.storage);
  }

  async getById(id: string): Promise<MediaDto> {
    const asset = await repository.findAssetById(id);
    if (!asset) throw notFound();
    return toMediaDto(asset, this.storage);
  }

  async list(
    query: MediaListQuery,
  ): Promise<{ data: MediaDto[]; meta: PaginationMeta }> {
    const { page, limit } = resolvePagination(query.page, query.limit);
    const where = buildAssetWhere(query);
    const orderBy = resolveAssetOrder(query);

    const [total, rows] = await Promise.all([
      repository.countAssets(where),
      repository.listAssets(where, orderBy, paginationOffset(page, limit), limit),
    ]);

    return {
      data: rows.map((asset) => toMediaDto(asset, this.storage)),
      meta: buildMeta(page, limit, total),
    };
  }

  /**
   * Read-only review of assets with no content reference (Phase 12B,
   * docs/12 §18, §60). Nothing is deleted: an administrator decides whether an
   * orphan is still needed. Optional library filters (search/type/folder/date)
   * narrow the review list.
   */
  async listOrphans(
    query: MediaListQuery,
  ): Promise<{ data: MediaDto[]; meta: PaginationMeta }> {
    const { page, limit } = resolvePagination(query.page, query.limit);
    const where = buildAssetWhere(query);
    const orderBy = resolveAssetOrder(query);

    const [total, rows] = await Promise.all([
      repository.countOrphanedAssets(where),
      repository.listOrphanedAssets(
        where,
        orderBy,
        paginationOffset(page, limit),
        limit,
      ),
    ]);

    return {
      data: rows.map((asset) => toMediaDto(asset, this.storage)),
      meta: buildMeta(page, limit, total),
    };
  }

  async updateMetadata(
    id: string,
    input: UpdateMediaInput | unknown,
    actorId: string | null,
  ): Promise<MediaDto> {
    const asset = await repository.findAssetById(id);
    if (!asset) throw notFound();

    const data = updateDataFrom(input);
    if (Object.keys(data).length === 0) {
      return toMediaDto(asset, this.storage);
    }

    const updated = await repository.updateAsset(id, data);
    await recordAudit({
      actorId,
      action: 'media.update',
      entityType: 'MEDIA',
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return toMediaDto(updated, this.storage);
  }

  /**
   * Reference-aware delete (docs/08 §15.5). Without `force`, any active
   * reference blocks the operation with 409 `MEDIA_REFERENCED`. With force,
   * references are removed in the same transaction and files are cleaned up
   * after the DB commit.
   */
  async delete(
    id: string,
    force: boolean,
    actorId: string | null,
  ): Promise<MediaDeleteResponse> {
    const asset = await repository.findAssetWithReferenceCount(id);
    if (!asset) throw notFound();

    const referenceCount = asset._count.references;
    if (referenceCount > 0 && !force) {
      throw mediaReferenced(referenceCount);
    }

    const keys = [
      asset.storageKey,
      ...asset.variants.map((variant) => variant.storageKey),
    ];

    try {
      if (force) {
        await repository.deleteAssetWithReferences(id);
      } else {
        await repository.deleteAsset(id);
      }
    } catch (error) {
      // A reference can be created between the count and the DELETE.
      if (!force && repository.isForeignKeyViolation(error)) {
        throw mediaReferenced(1);
      }
      throw error;
    }

    await Promise.allSettled(keys.map((key) => this.storage.delete(key)));

    await recordAudit({
      actorId,
      action: 'media.delete',
      entityType: 'MEDIA',
      entityId: id,
      metadata: { force, referenceCount },
    });

    return { id, deleted: true };
  }

  async listReferences(id: string): Promise<MediaReferencesResponse> {
    const asset = await repository.findAssetById(id);
    if (!asset) throw notFound();
    const references = await repository.listReferences(id);
    return {
      mediaId: id,
      references: references.map(toMediaReferenceDto),
    };
  }
}

function buildMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: totalPages(total, limit) };
}

export function createMediaService(options: MediaServiceOptions): MediaService {
  return new MediaService(options);
}