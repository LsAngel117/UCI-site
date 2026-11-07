/**
 * Site-wide SEO settings (Phase 8, docs/08 §18, docs/10 §10.3–§11.5).
 *
 * The defaults administrators edit (title, description, default sharing image
 * and robots default) are persisted as one JSON `Setting` row under the stable
 * key `seo.site`. `Setting` is used instead of `SeoMetadata` because
 * `robotsDefault` has no column in the per-entity SEO table, and keeping all
 * four values in one record avoids a split-brain configuration.
 *
 * Validation is strict: unknown keys, wrong types, blank titles and non-http
 * image URLs are rejected with a 400 before any write, so an invalid PATCH
 * never mutates stored settings (docs/08 §30).
 */
import { Prisma } from '@prisma/client';
import type { SiteSeoConfig, SiteSeoDto, UpdateSiteSeoInput } from '@shared/seo';
import { validation } from '../cms/errors';
import { prisma } from '../db';

/** Stable key of the site SEO defaults row. */
export const SEO_SETTINGS_KEY = 'seo.site';

/** Public site name used in titles and Organization JSON-LD. */
export const DEFAULT_SITE_NAME = 'Iglesia UCI';

/** Default title when an editor has not configured one. */
export const DEFAULT_SITE_TITLE = 'Iglesia UCI';

/** Truthful, non-promotional default description. */
export const DEFAULT_SITE_DESCRIPTION =
  'Sitio oficial de Iglesia UCI: mensajes, eventos, ministerios y recursos.';

const DEFAULT_OG_IMAGE: string | null = null;
const DEFAULT_ROBOTS = true;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;

const UPDATE_KEYS = new Set([
  'title',
  'description',
  'defaultOgImage',
  'robotsDefault',
]);

interface StoredSiteSeo {
  title: string;
  description: string;
  defaultOgImage: string | null;
  robotsDefault: boolean;
}

function storedString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text.length > 0 ? text : fallback;
}

function storedNullableUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return isHttpUrl(text) ? text : null;
}

/**
 * True only for an absolute http(s) URL with a real host. `new URL()` alone
 * accepts `https://` shapes that should never be persisted, so the protocol and
 * hostname are checked explicitly (docs/08 §30).
 */
function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return parsed.hostname.length > 0;
}

function readStored(value: Prisma.JsonValue | null): StoredSiteSeo {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      title: DEFAULT_SITE_TITLE,
      description: DEFAULT_SITE_DESCRIPTION,
      defaultOgImage: DEFAULT_OG_IMAGE,
      robotsDefault: DEFAULT_ROBOTS,
    };
  }
  const record = value as Record<string, unknown>;
  return {
    title: storedString(record.title, DEFAULT_SITE_TITLE),
    description: storedString(record.description, DEFAULT_SITE_DESCRIPTION),
    defaultOgImage: storedNullableUrl(record.defaultOgImage),
    robotsDefault:
      typeof record.robotsDefault === 'boolean'
        ? record.robotsDefault
        : DEFAULT_ROBOTS,
  };
}

/** Load the persisted site SEO defaults, applying built-in fallbacks. */
export async function getSiteSeoSettings(): Promise<SiteSeoDto> {
  const row = await prisma.setting.findUnique({
    where: { key: SEO_SETTINGS_KEY },
  });
  return readStored(row?.value ?? null);
}

/** Build the `buildSeo` configuration layer from persisted defaults. */
export async function loadSiteSeoConfig(
  siteUrl: string,
): Promise<SiteSeoConfig> {
  const settings = await getSiteSeoSettings();
  return {
    siteUrl,
    siteName: DEFAULT_SITE_NAME,
    defaultTitle: settings.title,
    defaultDescription: settings.description,
    defaultOgImage: settings.defaultOgImage,
    robotsDefault: settings.robotsDefault,
    logoUrl: null,
  };
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be a string.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) {
    throw validation(`"${field}" must not be empty.`, { field });
  }
  if (text.length > max) {
    throw validation(`"${field}" must be at most ${max} characters.`, {
      field,
    });
  }
  return text;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  const text = value.trim();
  if (!isHttpUrl(text)) {
    throw validation(`"${field}" must be an http(s) URL or null.`, { field });
  }
  return text;
}

/**
 * Validate the untrusted PATCH body. Only the documented keys are accepted;
 * an unknown key or a wrong scalar type is a 400. An empty object is a valid
 * no-op.
 */
export function parseUpdateSiteSeoInput(value: unknown): UpdateSiteSeoInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validation('The request body must be an object.');
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validation(`"${key}" is not a supported SEO setting.`, {
        field: key,
      });
    }
  }

  const parsed: UpdateSiteSeoInput = {};
  if ('title' in input) {
    parsed.title = requiredText(input.title, 'title', MAX_TITLE_LENGTH);
  }
  if ('description' in input) {
    parsed.description = requiredText(
      input.description,
      'description',
      MAX_DESCRIPTION_LENGTH,
    );
  }
  if ('defaultOgImage' in input) {
    parsed.defaultOgImage = optionalUrl(input.defaultOgImage, 'defaultOgImage');
  }
  if ('robotsDefault' in input) {
    if (typeof input.robotsDefault !== 'boolean') {
      throw validation('"robotsDefault" must be a boolean.', {
        field: 'robotsDefault',
      });
    }
    parsed.robotsDefault = input.robotsDefault;
  }
  return parsed;
}

/**
 * Merge a validated partial update into the stored defaults and persist the
 * result. The caller has already run `parseUpdateSiteSeoInput`, so no
 * unvalidated value can reach this write.
 */
export async function updateSiteSeoSettings(
  input: UpdateSiteSeoInput,
): Promise<SiteSeoDto> {
  const current = await getSiteSeoSettings();
  if (Object.keys(input).length === 0) return current;
  const next: StoredSiteSeo = {
    title: input.title ?? current.title,
    description: input.description ?? current.description,
    defaultOgImage:
      input.defaultOgImage === undefined
        ? current.defaultOgImage
        : input.defaultOgImage,
    robotsDefault: input.robotsDefault ?? current.robotsDefault,
  };
  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: SEO_SETTINGS_KEY },
    update: { value },
    create: { key: SEO_SETTINGS_KEY, value },
  });
  return next;
}
