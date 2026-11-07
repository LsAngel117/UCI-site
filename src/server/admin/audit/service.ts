/**
 * Audit read service (Phase 10D1, docs/08 §21).
 *
 * The audit trail is append-only: this module only ever reads it. Filters are
 * exact matches (actor, action, entity type/id) plus an inclusive date range,
 * and results are always newest-first.
 */
import type { Prisma } from '@prisma/client';
import type { AuditLogDto } from '@shared/admin';
import type { PaginationMeta } from '@shared/api';
import { paginationOffset, resolvePagination, totalPages } from '@shared/query';
import { prisma } from '../../db';
import { displayName } from '../../auth/authorization';
import type { ParsedAuditListQuery } from './validation';

const auditInclude = {
  actor: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} satisfies Prisma.AuditLogInclude;

type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

/** Project an audit row; the actor is optional for system actions. */
export function toAuditLogDto(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    actor: row.actor
      ? {
          id: row.actor.id,
          name: displayName(row.actor),
          email: row.actor.email,
        }
      : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Paginated, filtered audit list. */
export async function listAuditLogs(
  query: ParsedAuditListQuery,
): Promise<{ data: AuditLogDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.AuditLogWhereInput = {};

  if (query.actor) where.actorId = query.actor;
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      // `id` breaks ties so pagination is stable for rows written in the same
      // millisecond (several actions in one request burst).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: paginationOffset(page, limit),
      take: limit,
      include: auditInclude,
    }),
  ]);

  return {
    data: rows.map(toAuditLogDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}
