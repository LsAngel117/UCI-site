/**
 * Contact-form notification (Phase 11A foundation, docs/15 §17.3, docs/08 §19).
 *
 * Persisting the submission is the contract; notifying the admin is best
 * effort. This module therefore never lets a delivery problem escape: the
 * public route must still answer `201` when the mail provider is down or
 * misconfigured (docs/07 §37 honest degradation).
 *
 * The message body is sent to the configured admin only. Logs stay redacted —
 * see `provider.ts`.
 */
import type { EmailConfig } from '../config';
import {
  createEmailProvider,
  type EmailLogger,
  type EmailMessage,
  type EmailProvider,
  type EmailProviderKind,
} from './provider';

/** The minimum submission shape a notification needs (no storage internals). */
export interface NotifiableContactSubmission {
  name: string;
  email: string;
  message: string;
  createdAt: Date;
}

/** Build the notification addressed to the configured admin inbox. */
export function buildContactNotification(
  to: string,
  submission: NotifiableContactSubmission,
): EmailMessage {
  return {
    to,
    subject: `Nuevo mensaje de contacto de ${submission.name}`,
    text: [
      'Se recibió un nuevo mensaje desde el formulario de contacto.',
      '',
      `Nombre: ${submission.name}`,
      `Email: ${submission.email}`,
      `Fecha: ${submission.createdAt.toISOString()}`,
      '',
      submission.message,
    ].join('\n'),
  };
}

/**
 * Deliver a contact notification, feeding back whether a provider accepted it.
 *
 * - returns `false` when no admin recipient is configured or delivery is off;
 * - never throws: a provider rejection is logged as a warning and reported as
 *   `false`, so the caller's `201` is unaffected.
 */
export async function notifyNewContactSubmission(
  config: EmailConfig,
  submission: NotifiableContactSubmission,
  logger: EmailLogger,
  createProvider: (
    kind: EmailProviderKind,
    logger: EmailLogger,
  ) => EmailProvider = createEmailProvider,
): Promise<boolean> {
  const to = config.contactNotifyTo;
  if (!to) return false;

  const provider = createProvider(config.provider, logger);
  if (provider.kind === 'none') return false;

  try {
    await provider.send(buildContactNotification(to, submission));
    return true;
  } catch (error) {
    logger.warn(
      {
        emailProvider: provider.kind,
        to,
        err: error,
      },
      'Contact notification failed; the submission was stored (best-effort)',
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Password reset delivery (improvement A5)
// ---------------------------------------------------------------------------

export interface PasswordResetEmailInput {
  /** Recipient address (never logged with the token). */
  to: string;
  /** Display name used in the greeting; falls back to the address. */
  name?: string | null;
  /** Single-use raw token. NEVER log this value. */
  token: string;
  /** Canonical site origin used to build the reset link. */
  siteUrl: string;
}

/** Build the reset message. The token lives only in the email body. */
export function buildPasswordResetEmail(
  input: PasswordResetEmailInput,
): EmailMessage {
  const greeting = input.name?.trim() || input.to;
  const resetUrl = `${input.siteUrl.replace(/\/+$/, '')}/panel/reset-password?token=${encodeURIComponent(input.token)}`;
  return {
    to: input.to,
    subject: 'Restablece tu contraseña — Iglesia UCI',
    text: [
      `Hola ${greeting},`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña.',
      'Abre este enlace para elegir una nueva (válido por 1 hora):',
      '',
      resetUrl,
      '',
      'Si no solicitaste este cambio, puedes ignorar este mensaje.',
    ].join('\n'),
  };
}

/**
 * Deliver a password-reset email, best effort. Never throws and never logs the
 * token: the log provider records only envelope metadata (see `provider.ts`).
 * Returns whether a provider accepted the message.
 */
export async function sendPasswordResetEmail(
  config: EmailConfig,
  input: PasswordResetEmailInput,
  logger: EmailLogger,
  createProvider: (
    kind: EmailProviderKind,
    logger: EmailLogger,
  ) => EmailProvider = createEmailProvider,
): Promise<boolean> {
  const provider = createProvider(config.provider, logger);
  if (provider.kind === 'none') return false;

  try {
    await provider.send(buildPasswordResetEmail(input));
    return true;
  } catch (error) {
    logger.warn(
      { emailProvider: provider.kind, err: error },
      'Password reset email failed (best-effort)',
    );
    return false;
  }
}
