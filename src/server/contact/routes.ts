/**
 * Public contact form HTTP route (Phase 9B2, docs/08 §19, §40).
 *
 * POST /api/v1/contact — unauthenticated, rate limited per IP, persists a
 * `ContactSubmission` row. The response never echoes the stored record: only
 * `{ data: { received: true } }` (docs/08 §19 "must not expose internal
 * contact records publicly").
 *
 * Rate limiting is opt-in per route (the plugin is registered with
 * `global: false` in `app.ts`), mirroring the login endpoint. Five submissions
 * per minute per IP is enough for a human form and blocks trivial abuse.
 */
import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from '@shared/api';
import type { ContactSubmissionReceipt } from '@shared/contact';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';
import type { ServerConfig } from '../config';
import { createContactSubmission } from './service';

export function registerPublicContactRoutes(
  app: FastifyInstance,
  _config: ServerConfig,
): void {
  app.post(
    '/api/v1/contact',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        await createContactSubmission(request.body);
        reply
          .code(201)
          .send({ data: { received: true } } satisfies ApiResponse<ContactSubmissionReceipt>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );
}
