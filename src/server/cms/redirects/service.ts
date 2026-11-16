/**
 * Redirect lookup foundation (Phase 7A/7B, docs/08 §14, docs/10 §5.4, §6).
 *
 * When a PUBLISHED page changes slug, `pages/service.ts` records the old slug
 * in `Redirect`. Phase 9 will turn that row into a permanent HTTP redirect;
 * Phase 7B only needs a reusable lookup so the public API can tell a client
 * where an old page moved to (the public 404 carries `details.redirectTo`).
 *
 * The lookup is deliberately path-tolerant: callers may pass a bare slug
 * (`about`), a rooted path (`/about`) or a trailing-slash variant, and the
 * stored `fromPath` is always the normalized bare form.
 */
import type { Redirect } from '@prisma/client';
import type { RedirectDto } from '@shared/cms';
import { prisma } from '../../db';

/** Map a stored redirect row to the transport-agnostic DTO. */
function toRedirectDto(row: Redirect): RedirectDto {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toPath: row.toPath,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Normalize a redirect lookup path/slug to the stored `fromPath` form. */
export function normalizeRedirectPath(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Resolve a path redirect. Accepts either a bare slug or a rooted path and
 * returns the destination row, or null when no redirect exists.
 */
export async function findRedirect(path: string): Promise<RedirectDto | null> {
  const normalized = normalizeRedirectPath(path);
  if (normalized.length === 0) return null;
  const row = await prisma.redirect.findUnique({ where: { fromPath: normalized } });
  return row ? toRedirectDto(row) : null;
}
