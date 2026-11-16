/**
 * Reusable slug service (docs/05 §27).
 *
 * Slugs are the stable public identifier of every publishable entity, so the
 * rules — normalization, format validation, and per-collection uniqueness — are
 * centralized here instead of being re-implemented inside each content module.
 *
 * The service is storage-agnostic: uniqueness is delegated to an `isTaken`
 * probe supplied by the caller, so the same logic serves Sermons today and any
 * other collection later (docs/05 §27, §28 "PublishableContent").
 */
import { slugTaken, validation } from './errors';

/**
 * Canonical slug format: lowercase alphanumerics separated by single hyphens,
 * with no leading/trailing hyphen. Mirrors the output of `normalizeSlug`.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Maximum slug length (URL-friendly; generous but bounded). */
export const SLUG_MAX_LENGTH = 120;

/**
 * Normalize arbitrary text into a slug: strip diacritics, lowercase, collapse
 * every non-alphanumeric run into a single hyphen, and trim edge hyphens
 * (docs/05 §27: "formato legible; sin caracteres innecesarios").
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    // Remove combining diacritical marks left by NFD (é → e + ́).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** True when `slug` already matches the canonical format. */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/** A uniqueness probe: true when `slug` is already used by a *different* row. */
export type SlugTakenProbe = (slug: string, exceptId?: string) => Promise<boolean>;

/**
 * Validate an explicit slug (normalizing first) and assert it is free.
 *
 * The caller's slug is normalized so `"Obediencia y Fe"` and `"obediencia-y-fe"`
 * are the same slug; the normalized value is returned for persistence.
 * Throws `VALIDATION_ERROR` on empty/invalid format and `SLUG_TAKEN` on a
 * collision (docs/05 §27).
 */
export async function requireAvailableSlug(
  rawSlug: string,
  isTaken: SlugTakenProbe,
  exceptId?: string,
): Promise<string> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) {
    throw validation(
      'The slug is empty or has an invalid format. Use lowercase letters, numbers and hyphens.',
      { field: 'slug' },
    );
  }
  if (await isTaken(slug, exceptId)) {
    throw slugTaken(slug);
  }
  return slug;
}

/**
 * Derive a unique slug from a title (docs/05 §27: "generación automática
 * inicial"). Appends a numeric suffix when the base is already taken so a
 * duplicate title never fails creation, unlike an *explicit* duplicate slug —
 * which is a deliberate `SLUG_TAKEN` (see `requireAvailableSlug`).
 */
export async function generateUniqueSlug(
  title: string,
  isTaken: SlugTakenProbe,
): Promise<string> {
  const base = normalizeSlug(title);
  if (!isValidSlug(base)) {
    throw validation(
      'A slug could not be generated from the title. Provide an explicit slug.',
      { field: 'slug' },
    );
  }
  let candidate = base;
  let suffix = 2;
  // Bounded loop: each iteration appends a new suffix, so a free slug is found
  // unless the collection is pathologically full (then we stop and 409).
  while (suffix <= 1000) {
    if (!(await isTaken(candidate))) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  throw slugTaken(base);
}
