/**
 * Authentication endpoints (docs/08 §7).
 *
 *   POST /api/v1/auth/login   — credentials → session cookie + user
 *   GET  /api/v1/auth/me      — current user + resolved permissions
 *   POST /api/v1/auth/logout  — revoke session + clear cookie
 *
 * The session token travels only in the HttpOnly cookie; it is never placed in
 * a response body (docs/08 §7.1, docs/11 §5.1). Invalid credentials always
 * yield the same generic 401 so the endpoint cannot be used to enumerate
 * accounts (docs/11 §5.2).
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
} from '@shared/api';
import type { ServerConfig } from '../config';
import { prisma } from '../db';
import { toAuthUser } from './authorization';
import { invalidCredentialsEnvelope, validationEnvelope } from './errors';
import { requireAuth } from './middleware';
import { verifyPassword } from './password';
import { createSession, revokeSession } from './session';

/** Strict credential-body guard — malformed input is a 400, not a crash. */
function isLoginRequest(value: unknown): value is LoginRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === 'string' &&
    candidate.email.trim().length > 0 &&
    typeof candidate.password === 'string' &&
    candidate.password.length > 0
  );
}

/** Set the session cookie: HttpOnly, Secure (prod) and SameSite=Lax. */
function setSessionCookie(
  reply: FastifyReply,
  config: ServerConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(config.session.cookieName, token, {
    path: config.cookie.path,
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    expires: expiresAt,
    // Aligned with the absolute session lifetime (docs/11 §6.2, §6.3).
    maxAge: Math.floor(config.session.absoluteTtlMs / 1000),
  });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const { cookieName } = config.session;

  // 5 attempts / minute / IP — strict because login is the credential-attack
  // surface (docs/11 §18). Applied per-route; other endpoints stay unthrottled.
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!isLoginRequest(request.body)) {
        return reply.code(400).send(validationEnvelope());
      }

      const email = request.body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          active: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      });

      // Verify unconditionally-shaped result: a missing user, a disabled
      // account and a wrong password all collapse to the same generic 401.
      const passwordOk = user
        ? await verifyPassword(user.passwordHash, request.body.password)
        : false;
      if (!user || !user.active || !passwordOk) {
        return reply.code(401).send(invalidCredentialsEnvelope());
      }

      // Session rotation: revoke any session the caller already presented
      // before issuing a fresh one, preventing fixation (docs/11 §6.5).
      const existingToken = request.cookies?.[cookieName];
      if (existingToken) {
        await revokeSession(existingToken);
      }

      const { token, expiresAt } = await createSession(
        user.id,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
        config.session,
      );
      setSessionCookie(reply, config, token, expiresAt);

      const data: LoginResponse = { user: toAuthUser(user) };
      return reply
        .code(200)
        .send({ data } satisfies ApiResponse<LoginResponse>);
    },
  );

  app.get(
    '/api/v1/auth/me',
    { preHandler: requireAuth(config) },
    async (request, reply) => {
      // requireAuth guarantees `request.user` on this path.
      const user = request.user!;
      const data: CurrentUserResponse = { ...user };
      return reply.send({ data } satisfies ApiResponse<CurrentUserResponse>);
    },
  );

  app.post(
    '/api/v1/auth/logout',
    { preHandler: requireAuth(config) },
    async (request, reply) => {
      const token = request.cookies?.[cookieName];
      if (token) {
        await revokeSession(token);
      }
      reply.clearCookie(cookieName, { path: config.cookie.path });
      return reply.code(204).send();
    },
  );
}