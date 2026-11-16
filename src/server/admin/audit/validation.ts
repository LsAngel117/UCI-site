/**
 * Validation for `GET /api/v1/admin/audit` (Phase 10D1, docs/08 §21).
 *
 * Filters are normalized and date bounds parsed (and ordered) here, before any
 * query runs. A malformed date or an inverted range is a 400, never a silently
 * ignored filter that would return a misleading result set.
 */
import type { AuditLogListQuery } from '@shared/admin';
import { resolvePagination } from '@shared/query';
import { validation } from '../../cms/errors';

const MAX_FILTER = 200;

/** Normalized audit query the service consumes. */
export interface ParsedAuditListQuery {
  page: number;
  limit: number;
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0) return undefined;
  return text.length > MAX_FILTER ? text.slice(0, MAX_FILTER) : text;
}

/** An ISO 8601 timestamp (date-only input is accepted at midnight UTC). */
function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw validation(`"${field}" must be an ISO 8601 date.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw validation(`"${field}" must be an ISO 8601 date.`, { field });
  }
  return date;
}

/**
 * Normalize the query. Canonical `actor`/`entityType`/`entityId` win over the
 * docs/08 §21 aliases `user`/`resource`/`resourceId`.
 */
export function parseAuditLogListQuery(
  value: unknown,
): ParsedAuditListQuery {
  const record = isPlainObject(value) ? value : {};
  const { page, limit } = resolvePagination(record.page, record.limit);

  const from = optionalDate(record.from, 'from');
  const to = optionalDate(record.to, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw validation('"from" must not be later than "to".', { field: 'from' });
  }

  const actor = optionalText(record.actor) ?? optionalText(record.user);
  const entityType =
    optionalText(record.entityType) ?? optionalText(record.resource);
  const entityId =
    optionalText(record.entityId) ?? optionalText(record.resourceId);

  const parsed: ParsedAuditListQuery = { page, limit };
  if (actor !== undefined) parsed.actor = actor;
  const action = optionalText(record.action);
  if (action !== undefined) parsed.action = action;
  if (entityType !== undefined) parsed.entityType = entityType;
  if (entityId !== undefined) parsed.entityId = entityId;
  if (from !== undefined) parsed.from = from;
  if (to !== undefined) parsed.to = to;
  return parsed;
}

/** Re-exported for route typing without importing the shared query shape. */
export type { AuditLogListQuery };
