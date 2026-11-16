/**
 * Shared response helpers for the administration API (Phase 10D1).
 *
 * Keeps the `{ data }` / `{ data, meta }` / `{ error }` envelopes identical
 * across the users, roles and audit routes, mirroring the CMS route pattern.
 */
import type { FastifyReply } from 'fastify';
import type { ApiResponse, ListResponse, PaginationMeta } from '@shared/api';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';

/** Send a single-resource envelope, translating a `CmsError` to its status. */
export async function sendData<T>(
  reply: FastifyReply,
  produce: () => Promise<T>,
  statusCode = 200,
): Promise<void> {
  try {
    const data = await produce();
    reply.code(statusCode).send({ data } satisfies ApiResponse<T>);
  } catch (error) {
    if (isCmsError(error)) {
      reply.code(error.statusCode).send(cmsErrorEnvelope(error));
      return;
    }
    throw error;
  }
}

/** Send a collection envelope with pagination metadata. */
export async function sendList<T>(
  reply: FastifyReply,
  produce: () => Promise<{ data: T[]; meta: PaginationMeta }>,
): Promise<void> {
  try {
    const { data, meta } = await produce();
    reply.send({ data, meta } satisfies ListResponse<T>);
  } catch (error) {
    if (isCmsError(error)) {
      reply.code(error.statusCode).send(cmsErrorEnvelope(error));
      return;
    }
    throw error;
  }
}
