/**
 * Admin contact inbox (Phase 11A, docs/08 §19, docs/11 §9).
 *
 * The public form writes `contact_submissions`; these use cases are the only
 * read/update path for those rows and live exclusively behind
 * `/api/v1/admin/contact-submissions` (`contact.read` / `contact.manage`).
 * A submission is never exposed publicly (docs/08 §19).
 *
 * Marking a submission handled is an editorial-administrative action, so it
 * is appended to `audit_logs` with the previous and next status.
 */
import type { Prisma } from '@prisma/client';
import type {
  ContactSubmissionDto,
  ContactSubmissionStatus,
  UpdateContactSubmissionInput,
} from '@shared/contact';
import type { PaginationMeta } from '@shared/api';
import {
  paginationOffset,
  resolvePagination,
  totalPages,
} from '@shared/query';
import { prisma } from '../../db';
import { recordAudit } from '../../cms/audit';
import { notFound } from '../../cms/errors';
import { escapeLikePattern } from '../../search/service';
import type { ParsedContactSubmissionListQuery } from './validation';

const ENTITY_TYPE = 'CONTACT_SUBMISSION';

const contactSelect = {
  id: true,
  name: true,
  email: true,
  message: true,
  status: true,
  handledAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactSubmissionSelect;

type ContactRow = Prisma.ContactSubmissionGetPayload<{
  select: typeof contactSelect;
}>;

/** Project a stored submission to the admin DTO (ISO timestamps). */
export function toContactSubmissionDto(
  row: ContactRow,
): ContactSubmissionDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status as ContactSubmissionStatus,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Paginated, filtered inbox list; always newest-first (ties by `id`). */
export async function listContactSubmissions(
  query: ParsedContactSubmissionListQuery,
): Promise<{ data: ContactSubmissionDto[]; meta: PaginationMeta }> {
  const { page, limit } = resolvePagination(query.page, query.limit);
  const where: Prisma.ContactSubmissionWhereInput = {};

  if (query.search) {
    // Escape LIKE metacharacters so a search for `%`/`_`/`\` is a literal
    // match instead of turning into a wildcard that returns every row.
    const contains = escapeLikePattern(query.search);
    where.OR = [
      { name: { contains, mode: 'insensitive' } },
      { email: { contains, mode: 'insensitive' } },
      { message: { contains, mode: 'insensitive' } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.contactSubmission.count({ where }),
    prisma.contactSubmission.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: paginationOffset(page, limit),
      take: limit,
      select: contactSelect,
    }),
  ]);

  return {
    data: rows.map(toContactSubmissionDto),
    meta: { page, limit, total, totalPages: totalPages(total, limit) },
  };
}

/** Load one submission or throw the standard 404. */
export async function getContactSubmission(
  id: string,
): Promise<ContactSubmissionDto> {
  const row = await prisma.contactSubmission.findUnique({
    where: { id },
    select: contactSelect,
  });
  if (!row) throw notFound('Contact submission not found.');
  return toContactSubmissionDto(row);
}

/**
 * Transition a submission between `NEW` and `HANDLED`.
 *
 * `handledAt` records the first time it was handled and is cleared when it is
 * returned to `NEW`. A no-op transition (same status) does not write or audit.
 */
export async function updateContactSubmissionStatus(
  id: string,
  input: UpdateContactSubmissionInput,
  actorId: string,
): Promise<ContactSubmissionDto> {
  const current = await prisma.contactSubmission.findUnique({
    where: { id },
    select: contactSelect,
  });
  if (!current) throw notFound('Contact submission not found.');

  const statusChanged = current.status !== input.status;
  const needsHandledAt =
    input.status === 'HANDLED' && current.handledAt === null;
  if (!statusChanged && !needsHandledAt) {
    return toContactSubmissionDto(current);
  }

  const handledAt =
    input.status === 'HANDLED' ? (current.handledAt ?? new Date()) : null;

  const updated = await prisma.contactSubmission.update({
    where: { id },
    data: { status: input.status, handledAt },
    select: contactSelect,
  });

  if (statusChanged) {
    await recordAudit({
      actorId,
      action: 'contact.update',
      entityType: ENTITY_TYPE,
      entityId: updated.id,
      metadata: {
        previousStatus: current.status,
        status: updated.status,
      },
    });
  }

  return toContactSubmissionDto(updated);
}
