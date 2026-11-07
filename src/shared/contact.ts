/**
 * Public contact-form contract (Phase 9B2, docs/08 §19).
 *
 * The public website posts a small, fixed payload; the API validates it and
 * persists a `ContactSubmission` row. There is deliberately no `subject`
 * field: the Phase 1 model only stores name/email/message (docs/05 §?), and
 * notification/forwarding is a Phase 11 concern. Adding a field the storage
 * layer silently drops would be dishonest.
 *
 * Limits are exported so the frontend and the server enforce the same values.
 */

/** Maximum accepted length for the sender's name. */
export const CONTACT_NAME_MAX_LENGTH = 120;
/** Maximum accepted length for the sender's email address. */
export const CONTACT_EMAIL_MAX_LENGTH = 254;
/** Maximum accepted length for the message body. */
export const CONTACT_MESSAGE_MAX_LENGTH = 5_000;

/** Body of `POST /api/v1/contact`. */
export interface ContactSubmissionInput {
  name: string;
  email: string;
  message: string;
}

/**
 * Successful receipt. It never includes the stored row or an internal id:
 * the endpoint must not expose contact records publicly (docs/08 §19).
 */
export interface ContactSubmissionReceipt {
  received: true;
}

// ---------------------------------------------------------------------------
// Admin inbox contracts (Phase 11A, docs/08 §19, docs/11 §9).
//
// These DTOs are the only shape in which a stored submission ever leaves the
// API. They are served exclusively under `/api/v1/admin/contact-submissions`
// behind `contact.read` / `contact.manage`; no public route may return them
// (docs/08 §19).
// ---------------------------------------------------------------------------

/** Lifecycle of a contact submission as exposed to administrators. */
export const CONTACT_SUBMISSION_STATUSES = ['NEW', 'HANDLED'] as const;

export type ContactSubmissionStatus =
  (typeof CONTACT_SUBMISSION_STATUSES)[number];

/** True for a value in the canonical contact-submission status set. */
export function isContactSubmissionStatus(
  value: unknown,
): value is ContactSubmissionStatus {
  return (
    typeof value === 'string' &&
    (CONTACT_SUBMISSION_STATUSES as readonly string[]).includes(value)
  );
}

/** Administrative projection of a stored contact submission. */
export interface ContactSubmissionDto {
  id: string;
  name: string;
  email: string;
  message: string;
  status: ContactSubmissionStatus;
  /** Set the first time the submission is marked handled; null while new. */
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Filters accepted by `GET /api/v1/admin/contact-submissions`.
 *
 * `search` matches name, email or message (case-insensitive). `from`/`to` are
 * inclusive ISO 8601 bounds on `createdAt`. Results are always newest-first.
 */
export interface ContactSubmissionListQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: ContactSubmissionStatus | string;
  from?: string;
  to?: string;
}

/** Body of `PATCH /api/v1/admin/contact-submissions/:id`. */
export interface UpdateContactSubmissionInput {
  status: ContactSubmissionStatus;
}
