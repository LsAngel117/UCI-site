/**
 * Public contact submissions (Phase 9B2, docs/08 §19, docs/11 §18).
 *
 * One minimal, unauthenticated write endpoint:
 *
 *   POST /api/v1/contact
 *
 * Decision (documented for the Phase 9B handoff): the endpoint validates the
 * fixed `{ name, email, message }` payload and persists a `ContactSubmission`
 * row through the existing Prisma singleton. Email delivery / notification is
 * intentionally out of scope here — Fase 11 owns the delivery adapter. The
 * form therefore reports "recibido", never "enviado": the honest state the
 * architecture requires when no email provider is configured (docs/07 §37).
 *
 * The accepted shape is strict: a request carrying any other field (for
 * example `subject`) is rejected with `400 VALIDATION_ERROR` instead of being
 * silently discarded. The Phase 1 model only stores name/email/message, so
 * accepting `subject` without persisting it would be a silent data loss.
 *
 * Security:
 * - the body is treated as untrusted and re-validated server-side;
 * - trimmed text is stored as plain text (never rendered publicly);
 * - the route applies a per-IP rate limit (docs/08 §40);
 * - no recipient address, secret or internal row is ever returned.
 */
import type { ContactSubmissionInput } from '@shared/contact';
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
} from '@shared/contact';
import { prisma } from '../db';
import { validation } from '../cms/errors';

/** Simple, intentionally conservative email shape check. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The only accepted body fields; anything else is rejected, never dropped. */
const ALLOWED_FIELDS = new Set(['name', 'email', 'message']);

function rejectUnknownFields(raw: Record<string, unknown>): void {
  const unknown = Object.keys(raw).filter((field) => !ALLOWED_FIELDS.has(field));
  if (unknown.length === 0) return;

  const quoted = unknown.map((field) => `"${field}"`).join(', ');
  throw validation(
    unknown.length === 1
      ? `Unsupported field ${quoted}. Allowed fields are: name, email, message.`
      : `Unsupported fields ${quoted}. Allowed fields are: name, email, message.`,
    { fields: unknown },
  );
}

function requireText(
  value: unknown,
  field: keyof ContactSubmissionInput,
  max: number,
): string {
  if (typeof value !== 'string') {
    throw validation(`"${field}" is required.`, { field });
  }
  const text = value.trim();
  if (text.length === 0) {
    throw validation(`"${field}" is required.`, { field });
  }
  if (text.length > max) {
    throw validation(`"${field}" must be at most ${max} characters.`, {
      field,
    });
  }
  return text;
}

/**
 * Validate an untrusted contact body. Returns the normalized values that are
 * persisted; a malformed body throws a 400 `VALIDATION_ERROR`.
 */
export function parseContactSubmissionInput(
  body: unknown,
): ContactSubmissionInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validation('The request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  rejectUnknownFields(raw);

  const name = requireText(raw.name, 'name', CONTACT_NAME_MAX_LENGTH);
  const email = requireText(raw.email, 'email', CONTACT_EMAIL_MAX_LENGTH);
  const message = requireText(
    raw.message,
    'message',
    CONTACT_MESSAGE_MAX_LENGTH,
  );

  if (!EMAIL_PATTERN.test(email)) {
    throw validation('"email" must be a valid email address.', {
      field: 'email',
    });
  }

  return { name, email, message };
}

/**
 * Result of persisting a submission.
 *
 * `name`/`email`/`message` are returned so the notification layer can use them
 * without re-reading the row. They are internal values only: the public
 * response never exposes them (docs/08 §19).
 */
export interface CreatedContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: Date;
}

/** Validate and persist one contact submission. */
export async function createContactSubmission(
  body: unknown,
): Promise<CreatedContactSubmission> {
  const input = parseContactSubmissionInput(body);
  const row = await prisma.contactSubmission.create({
    data: {
      name: input.name,
      email: input.email,
      message: input.message,
    },
    select: {
      id: true,
      name: true,
      email: true,
      message: true,
      createdAt: true,
    },
  });
  return row;
}
