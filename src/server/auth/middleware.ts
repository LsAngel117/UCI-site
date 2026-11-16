/**
 * Protected-route middleware (docs/11 §3.3, §12).
 *
 * `requireAuth` resolves the session cookie into a typed `request.user` and
 * answers 401 when there is none. `requirePermission` runs after it and
 * answers 403 when the user lacks the required permission. Both are plain
 * Fastify `preHandler` hooks so any route can opt in with:
 *
 *   { preHandler: [requireAuth(config), requirePermission('sermons.publish')] }
 *
 * Authorization is evaluated here, on the server, before the handler runs —
 * never via UI visibility (docs/07 §59).
 */
import type { preHandlerHookHandler, FastifyRequest } from 'fastify';
import type { PermissionName } from '@shared/api';
import type { ServerConfig } from '../config';
import { can, getUserPermissions, toAuthUser } from './authorization';
import { forbiddenEnvelope, unauthorizedEnvelope } from './errors';
import { validateSession } from './session';

/** The authenticated principal attached to a request by `requireAuth`. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  /** Primary role name — presentation only, not an authorization input. */
  role: string;
  permissions: PermissionName[];
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by `requireAuth` on authenticated requests. Optional because public
     * routes never populate it.
     */
    user?: AuthenticatedUser;
  }
}

/** Read the raw session token from the request cookie, if present. */
export function readSessionToken(
  request: FastifyRequest,
  config: ServerConfig,
): string | undefined {
  return request.cookies?.[config.session.cookieName];
}

/**
 * Resolve the session cookie and attach `request.user`. Replies 401 (generic)
 * when the cookie is missing, the session is invalid/expired/revoked, or the
 * account is disabled.
 */
export function requireAuth(config: ServerConfig): preHandlerHookHandler {
  return async (request, reply) => {
    const validated = await validateSession(
      readSessionToken(request, config),
      config.session,
    );
    if (!validated) {
      reply.code(401).send(unauthorizedEnvelope());
      return;
    }
    const permissions = await getUserPermissions(validated.user.id);
    request.user = { ...toAuthUser(validated.user), permissions };
  };
}

/**
 * Require an explicit permission. Must be used after `requireAuth` in the same
 * `preHandler` chain; a missing user is treated as unauthenticated (401) so the
 * hook is safe even if misordered.
 */
export function requirePermission(
  permission: PermissionName,
): preHandlerHookHandler {
  return async (request, reply) => {
    const user = request.user;
    if (!user) {
      reply.code(401).send(unauthorizedEnvelope());
      return;
    }
    if (!can(user.permissions, permission)) {
      reply.code(403).send(forbiddenEnvelope());
    }
  };
}