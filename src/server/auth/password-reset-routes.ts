/**
 * Password-reset endpoints (improvement A5, docs/08 §7, docs/11 §5–6).
 *
 *   POST /api/v1/auth/password-reset/request  { email }           → 202 generic
 *   POST /api/v1/auth/password-reset/confirm  { token, password } → 200 generic
 *
 * The request endpoint never reveals whether an account exists: the body and
 * status are identical for a known and an unknown address. Both endpoints are
 * rate limited because they are unauthenticated write surfaces. Tokens and
 * passwords never appear in a response or a log line.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiResponse, PasswordResetResponse } from '@shared/api';
import type { ServerConfig } from '../config';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';
import { validationEnvelope } from './errors';
import {
  confirmPasswordReset,
  requestPasswordReset,
} from './password-reset';

const REQUEST_URL = '/api/v1/auth/password-reset/request';
const CONFIRM_URL = '/api/v1/auth/password-reset/confirm';

/** Identical for existing/non-existing accounts (anti-enumeration). */
const GENERIC_REQUEST_MESSAGE =
  'If the account exists, a password reset link has been sent.';

interface EmailBody {
  email: string;
}

interface ConfirmBody {
  token: string;
  password: string;
}

function isEmailBody(value: unknown): value is EmailBody {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === 'string' &&
    candidate.email.trim().length > 0 &&
    candidate.email.length <= 254
  );
}

function isConfirmBody(value: unknown): value is ConfirmBody {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.trim().length > 0 &&
    typeof candidate.password === 'string' &&
    candidate.password.length > 0
  );
}

function sendError(reply: FastifyReply, error: unknown): void {
  if (isCmsError(error)) {
    reply.code(error.statusCode).send(cmsErrorEnvelope(error));
    return;
  }
  throw error;
}

export function registerPasswordResetRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  app.post(
    REQUEST_URL,
    // 5 requests/minute/IP: prevents using the endpoint as an email bomb or an
    // account-probing oracle (docs/11 §18).
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!isEmailBody(request.body)) {
        return reply.code(400).send(validationEnvelope());
      }

      try {
        // The returned flag is intentionally ignored: the HTTP response is
        // generic whether or not the address belongs to an active account.
        await requestPasswordReset(request.body.email, {
          emailConfig: config.email,
          siteUrl: config.siteUrl,
          logger: request.log,
        });
        const data: PasswordResetResponse = {
          message: GENERIC_REQUEST_MESSAGE,
        };
        return reply
          .code(202)
          .send({ data } satisfies ApiResponse<PasswordResetResponse>);
      } catch (error) {
        sendError(reply, error);
      }
    },
  );

  app.post(
    CONFIRM_URL,
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!isConfirmBody(request.body)) {
        // Same generic envelope as an invalid token: never hint at which part
        // of the payload was wrong.
        return reply.code(400).send(validationEnvelope());
      }

      try {
        await confirmPasswordReset(request.body.token, request.body.password, {
          ip: request.ip,
          logger: request.log,
        });
        const data: PasswordResetResponse = {
          message: 'Your password has been updated.',
        };
        return reply
          .code(200)
          .send({ data } satisfies ApiResponse<PasswordResetResponse>);
      } catch (error) {
        sendError(reply, error);
      }
    },
  );
}
