/**
 * Reusable SEO helpers (docs/05 §26, docs/10 §12.1).
 *
 * `SeoMetadata` is polymorphic (`entityType`/`entityId`) and unique per entity.
 * Every content module needs the same three operations — validate the untrusted
 * `seo` body, load rows for a DTO, and upsert inside the entity transaction —
 * so they live here instead of being copied per collection. Validation is
 * deliberately strict: a malformed `seo` value is a 400 and happens before any
 * write, so a rejected payload leaves stored data untouched (docs/08 §30).
 */
import type { SeoMetadata } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { SeoDto, SeoInput } from '@shared/cms';
import { prisma } from '../db';
import { validation } from './errors';

/** The only keys `SeoInput` accepts. */
const SEO_INPUT_KEYS = new Set([
  'title',
  'description',
  'canonicalUrl',
  'ogImageUrl',
]);

/** Validate an optional http(s) URL used by SEO fields. */
function seoUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  // Strict: a bare scheme like "https://" has no host and must be rejected.
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname
  ) {
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

/**
 * Validate the untrusted `seo` field of a create/update body against the
 * `SeoInput` contract. An omitted (or explicit `null`) value is a no-op; a
 * provided non-null value must be a plain object carrying only the supported
 * keys with the right scalar types. A string or array is a 400, never a
 * silently ignored value.
 */
export function parseSeoInput(value: unknown): SeoInput | undefined {
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
  const parsed: SeoInput = {};
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

/** Map a stored SEO row to the public DTO shape. */
export function toSeoDto(seo: SeoMetadata | null): SeoDto | null {
  if (!seo) return null;
  return {
    title: seo.title,
    description: seo.description,
    canonicalUrl: seo.canonicalUrl,
    ogImageUrl: seo.ogImageUrl,
  };
}

/** Load the SEO row owned by one content entity. */
export function loadSeo(
  entityType: string,
  entityId: string,
): Promise<SeoMetadata | null> {
  return prisma.seoMetadata.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });
}

/** Batch-load SEO rows for a page of entities (avoids an N+1 query). */
export async function loadSeoMap(
  entityType: string,
  ids: string[],
): Promise<Map<string, SeoMetadata>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.seoMetadata.findMany({
    where: { entityType, entityId: { in: ids } },
  });
  return new Map(rows.map((row) => [row.entityId, row]));
}

/**
 * Upsert an entity's `SeoMetadata` from already-validated SEO fields.
 * Unspecified keys keep their stored value; a no-op when `seo` was omitted.
 */
export async function upsertSeo(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
  seo: SeoInput | undefined,
): Promise<void> {
  if (seo === undefined) return;
  const input = seo as Record<string, unknown>;
  const update: Prisma.SeoMetadataUncheckedUpdateInput = {};
  const create: Prisma.SeoMetadataUncheckedCreateInput = {
    entityType,
    entityId,
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
    where: { entityType_entityId: { entityType, entityId } },
    update,
    create,
  });
}