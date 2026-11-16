/**
 * Validation for the admin contact inbox (Phase 11A, docs/08 §19).
 *
 * Every parser is pure (no imports from `db` or Fastify), returning either a
 * normalized query/body or a 400 `VALIDATION_ERROR` before a query runs. An
 * unsupported status, an inverted date range or an unknown field is rejected,
 * never silently ignored.
 */
import {
  CONTACT_SUBMISSION_STATUSES,
  isContactSubmissionStatus,
  type ContactSubmissionStatus,
  type UpdateContactSubmissionInput,
} from '@shared/contact';
import { resolvePagination } from '@shared/query';
import { validation } from '../../cms/errors';

const MAX_FILTER = 200;

/** Normalized list query the service consumes. */
export interface ParsedContactSubmissionListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ContactSubmissionStatus;
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

/** Inclusive ISO 8601 boundary; date-only input is accepted at midnight UTC. */
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

/** Normalize a status filter; an unknown value is a 400. */
function optionalStatus(value: unknown): ContactSubmissionStatus | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw validation(
      `"status" must be one of: ${CONTACT_SUBMISSION_STATUSES.join(', ')}.`,
      { field: 'status' },
    );
  }
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) return undefined;
  if (!isContactSubmissionStatus(normalized)) {
    throw validation(
      `"status" must be one of: ${CONTACT_SUBMISSION_STATUSES.join(', ')}.`,
      { field: 'status' },
    );
  }
  return normalized;
}

/** Normalize `GET /api/v1/admin/contact-submissions` filters. */
export function parseContactSubmissionListQuery(
  value: unknown,
): ParsedContactSubmissionListQuery {
  const record = isPlainObject(value) ? value : {};
  const { page, limit } = resolvePagination(record.page, record.limit);

  const from = optionalDate(record.from, 'from');
  const to = optionalDate(record.to, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw validation('"from" must not be later than "to".', { field: 'from' });
  }

  const parsed: ParsedContactSubmissionListQuery = { page, limit };
  const search = optionalText(record.search);
  if (search !== undefined) parsed.search = search;
  const status = optionalStatus(record.status);
  if (status !== undefined) parsed.status = status;
  if (from !== undefined) parsed.from = from;
  if (to !== undefined) parsed.to = to;
  return parsed;
}

/**
 * Validate `PATCH /api/v1/admin/contact-submissions/:id`.
 *
 * The body is a strict `{ status }` object. `handledAt` is derived by the
 * service from the transition, never accepted from the client.
 */
export function parseUpdateContactSubmissionInput(
  value: unknown,
): UpdateContactSubmissionInput {
  if (!isPlainObject(value)) {
    throw validation('The request body must be a JSON object.');
  }
  for (const key of Object.keys(value)) {
    if (key !== 'status') {
      throw validation(`"${key}" is not a supported field.`, { field: key });
    }
  }
  if (value.status === undefined) {
    throw validation('"status" is required.', { field: 'status' });
  }
  const status = optionalStatus(value.status);
  if (!status) {
    throw validation(
      `"status" must be one of: ${CONTACT_SUBMISSION_STATUSES.join(', ')}.`,
      { field: 'status' },
    );
  }
  return { status };
}
