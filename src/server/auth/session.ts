/**
 * Server-side session infrastructure (docs/11 §6).
 *
 * A session is an opaque random token held only in the client's HttpOnly
 * cookie. The database stores a SHA-256 *hash* of the token as the lookup key,
 * so a database leak never yields a usable token (docs/11 §6.1). Sessions are
 * append-only: logout/rotation records `revokedAt` instead of deleting rows.
 *
 * Lifetime is two-dimensional (docs/11 §6.3):
 *   - absolute:  `expiresAt` is fixed at creation and never extended.
 *   - idle:      `lastSeenAt` + idle TTL; it slides forward on each valid
 *                request and is the only field mutated after creation.
 *
 * All functions take the TTL policy explicitly so timing is a config concern,
 * not a hard-coded constant, and so the auth layer can be exercised without a
 * process-wide singleton.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { SessionTtls } from '../config';

/** 32 random bytes → 256 bits of entropy, base64url-encoded (no padding). */
export const SESSION_TOKEN_BYTES = 32;

/** Security metadata captured at login for later auditing (docs/11 §6.1). */
export interface CreateSessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreatedSession {
  /** The opaque token — returned once, for the cookie only. Never persisted. */
  token: string;
  /** Absolute expiry, fixed at creation. */
  expiresAt: Date;
}

/** The user shape every session lookup returns, with role names resolved. */
const sessionUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  active: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export type SessionUser = Prisma.UserGetPayload<{
  select: typeof sessionUserSelect;
}>;

export interface ValidatedSession {
  user: SessionUser;
  session: { id: string; expiresAt: Date; lastSeenAt: Date };
}

/**
 * SHA-256 of the opaque token, hex-encoded. Deterministic: it is the DB lookup
 * key. SHA-256 (not a slow KDF) is correct here because the input is already
 * 256 bits of uniform randomness, so brute force is infeasible.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a fresh session for a user. A brand-new random token is always
 * generated — login therefore rotates the session and prevents fixation
 * (docs/11 §6.5). Returns the raw token; the caller must place it in a cookie
 * and never expose it in a response body (docs/08 §7.1).
 */
export async function createSession(
  userId: string,
  context: CreateSessionContext,
  ttls: SessionTtls,
): Promise<CreatedSession> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttls.absoluteTtlMs);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      lastSeenAt: now,
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  });

  return { token, expiresAt };
}

/**
 * Resolve and validate a session token.
 *
 * Returns `null` when the token is missing, unknown, revoked, absolutely
 * expired, idle-expired, or belongs to a disabled account. On success it
 * slides `lastSeenAt` forward (idle timer) and returns the user plus session
 * metadata. Every failure path is an indistinguishable `null` so callers can
 * answer with a single generic 401 (docs/11 §5.2).
 */
export async function validateSession(
  token: string | undefined | null,
  ttls: SessionTtls,
): Promise<ValidatedSession | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: sessionUserSelect } },
  });

  if (!session) return null;

  const now = Date.now();
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= now) return null;
  if (session.lastSeenAt.getTime() + ttls.idleTtlMs <= now) return null;
  // A disabled account immediately loses access (docs/11 §37), even if a valid
  // session row still exists.
  if (!session.user.active) return null;

  const lastSeenAt = new Date(now);
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt },
  });

  return {
    user: session.user,
    session: { id: session.id, expiresAt: session.expiresAt, lastSeenAt },
  };
}

/**
 * Revoke a single session by its token. Idempotent: an unknown or already
 * revoked token is a no-op, so logout never fails on a stale cookie.
 */
export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke every active session for a user — used on password reset, suspected
 * compromise or account deactivation (docs/11 §6.4).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}