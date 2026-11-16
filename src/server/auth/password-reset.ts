/**
 * Password reset (improvement A5, docs/11 §5–6).
 *
 * Security properties enforced here:
 *
 *   - the raw token is generated with 32 random bytes and returned exactly
 *     once (to the email delivery helper); PostgreSQL stores only its SHA-256
 *     hash, so a database leak cannot be replayed;
 *   - tokens are single-use, expire after one hour and issuing a new token
 *     invalidates every previous unused token for that user;
 *   - confirming sets an Argon2id hash, revokes **all** sessions (a reset
 *     implies the old credential is considered compromised), and appends
 *     `auth.password_reset` to the audit trail;
 *   - every failure path returns one generic validation error, so a caller
 *     cannot distinguish "unknown token" from "expired" or "already used".
 *
 * Nothing here logs or returns a token or a plaintext password.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { EmailConfig } from '../config';
import { recordAudit } from '../cms/audit';
import { validation } from '../cms/errors';
import { prisma } from '../db';
import { displayName } from './authorization';
import { hashPassword } from './password';
import { sendPasswordResetEmail } from '../email/service';
import type { EmailLogger } from '../email/provider';

/** 256 bits of entropy, base64url-encoded without padding. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;

/** One hour, per the feature decision (improvement A5). */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Same policy as admin user creation (docs/11 §5.3). */
export const PASSWORD_RESET_MIN_LENGTH = 8;
export const PASSWORD_RESET_MAX_LENGTH = 128;

/** SHA-256 of the opaque token — the only persisted representation. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generic 400 for every token/password problem (never reveals which). */
function invalidReset(): ReturnType<typeof validation> {
  return validation('The reset token is invalid or has expired.', {
    field: 'token',
  });
}

export interface IssuedPasswordResetToken {
  /** Raw token — place it in the email only, never in a response or log. */
  token: string;
  expiresAt: Date;
}

export interface IssuePasswordResetOptions {
  now?: Date;
  ttlMs?: number;
}

/**
 * Issue a new single-use reset token. Any previous unused token for the user
 * is invalidated in the same transaction so only the latest link works.
 */
export async function issuePasswordResetToken(
  userId: string,
  options: IssuePasswordResetOptions = {},
): Promise<IssuedPasswordResetToken> {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? PASSWORD_RESET_TTL_MS;
  const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlMs);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(token),
        expiresAt,
        usedAt: null,
      },
    }),
  ]);

  return { token, expiresAt };
}

export interface RequestPasswordResetOptions {
  emailConfig: EmailConfig;
  siteUrl: string;
  logger: EmailLogger;
  now?: Date;
}

/**
 * Request a reset email. The caller always answers with the same generic
 * message; this function reports only whether an active account was found so
 * tests can assert the branch without exposing it over HTTP.
 */
export async function requestPasswordReset(
  email: string,
  options: RequestPasswordResetOptions,
): Promise<{ requested: boolean }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: normalized, active: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user) return { requested: false };

  const issued = await issuePasswordResetToken(user.id, {
    ...(options.now ? { now: options.now } : {}),
  });

  // Best effort: the response is generic regardless of delivery outcome.
  await sendPasswordResetEmail(
    options.emailConfig,
    {
      to: user.email,
      name: displayName(user),
      token: issued.token,
      siteUrl: options.siteUrl,
    },
    options.logger,
  );

  return { requested: true };
}

export interface ConfirmPasswordResetOptions {
  /** Client IP for the audit record (never the token/password). */
  ip?: string | null;
  now?: Date;
  /** Optional logger so a failed audit insert never fails the reset. */
  logger?: { warn(obj: Record<string, unknown>, message?: string): void };
}

/**
 * Consume a reset token and replace the password.
 *
 * The token row is marked used inside the same transaction that updates the
 * password and revokes sessions. A concurrent confirm therefore loses the
 * `usedAt IS NULL` guard and receives the same generic 400.
 */
export async function confirmPasswordReset(
  token: string,
  password: string,
  options: ConfirmPasswordResetOptions = {},
): Promise<{ userId: string }> {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw invalidReset();
  }
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_RESET_MIN_LENGTH ||
    password.length > PASSWORD_RESET_MAX_LENGTH
  ) {
    throw invalidReset();
  }

  const now = options.now ?? new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: {
      user: { select: { id: true, active: true } },
    },
  });

  if (
    !record ||
    record.usedAt !== null ||
    record.expiresAt.getTime() <= now.getTime() ||
    !record.user.active
  ) {
    throw invalidReset();
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count === 0) throw invalidReset();

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    // Invalidate any sibling token and revoke every active session.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  // Audit is best-effort: the password is already rotated, so a failing
  // audit insert must not turn a successful reset into a 500.
  try {
    await recordAudit({
      actorId: record.userId,
      action: 'auth.password_reset',
      entityType: 'AUTH',
      entityId: record.userId,
      metadata: { ip: options.ip ?? null },
    });
  } catch (error) {
    options.logger?.warn(
      { err: error },
      'Failed to record password reset audit event',
    );
  }

  return { userId: record.userId };
}
