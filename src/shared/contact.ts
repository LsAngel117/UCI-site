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
