/**
 * Prisma error translation for the Sermons consumer (Phase 3, docs/05 §27).
 *
 * `requireAvailableSlug`/`generateUniqueSlug` check uniqueness with a read, but
 * a concurrent writer can insert the same slug between that check and our write.
 * The database then raises a unique-constraint violation (Prisma `P2002`) on the
 * `slug` column, which would otherwise bubble up to the global handler as a 500.
 * Detecting it here lets the service return the exact same `SLUG_TAKEN` (409)
 * the pre-check would have produced, so a lost race is not observable to the
 * client (docs/08 §30).
 */

/**
 * True when `error` is Prisma's unique-constraint violation (`P2002`) for the
 * `slug` column.
 *
 * Detected by shape rather than `instanceof` so it stays reliable across
 * bundled or duplicated copies of the Prisma runtime, and deliberately narrow:
 * a `P2002` on any other unique column (e.g. a future `slug`-unrelated index)
 * is NOT treated as a slug conflict.
 */
export function isSlugUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;
  const fields = Array.isArray(target)
    ? target
    : target === undefined
      ? []
      : [target];
  // Prisma reports the offending field(s) as an array, but for a named
  // constraint it may surface the constraint name (e.g. `sermons_slug_key`).
  return fields.some(
    (field) => typeof field === 'string' && field.includes('slug'),
  );
}
