/**
 * Admin Pages API (Phase 7A, docs/08 §10.3–10.7, §24).
 *
 * Thin HTTP layer over `service.ts`: routing, authentication and the
 * `{ data, meta }` / `{ error: { code, message } }` envelopes. Every editorial
 * rule is enforced by the reusable core.
 *
 * Authorization is per-route via `requirePermission` (docs/11 §9):
 * read/create/update for the content actions; publish and archive require the
 * matching privileged permission. An EDITOR holds neither and gets a 403.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApiResponse,
  ListResponse,
  PageAdminDto,
  PageListQuery,
  PageRevisionDto,
} from '@shared/cms';
import type { CreatePageInput, UpdatePageInput } from '@shared/cms';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { cmsErrorEnvelope, isCmsError } from '../errors';
import {
  archivePage,
  createPage,
  getPage,
  getPageRevision,
  listPages,
  listPageRevisions,
  previewPage,
  publishPage,
  restorePageRevision,
  updatePage,
} from './service';

/** Run a service call and translate the result/error into the standard envelope. */
async function send<T>(
  reply: FastifyReply,
  produce: () => Promise<T>,
): Promise<void> {
  try {
    const data = await produce();
    reply.send({ data } satisfies ApiResponse<T>);
  } catch (error) {
    if (isCmsError(error)) {
      reply.code(error.statusCode).send(cmsErrorEnvelope(error));
      return;
    }
    throw error;
  }
}

interface IdParams {
  id: string;
}

interface RevisionParams {
  id: string;
  revisionId: string;
}

export function registerPageRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('pages.read');
  const canCreate = requirePermission('pages.create');
  const canUpdate = requirePermission('pages.update');
  const canPublish = requirePermission('pages.publish');
  const canArchive = requirePermission('pages.archive');

  app.get<{ Querystring: PageListQuery }>(
    '/api/v1/admin/pages',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      try {
        const { data, meta } = await listPages(request.query);
        reply.send({ data, meta } satisfies ListResponse<PageAdminDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/pages',
    { preHandler: [auth, canCreate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as CreatePageInput;
      reply.code(201);
      await send<PageAdminDto>(reply, () => createPage(body, request.user!.id));
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<PageAdminDto>(reply, () => getPage(request.params.id));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as UpdatePageInput;
      await send<PageAdminDto>(reply, () =>
        updatePage(request.params.id, body, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id/publish',
    { preHandler: [auth, canPublish] },
    async (request, reply) => {
      await send<PageAdminDto>(reply, () =>
        publishPage(request.params.id, request.user!.id),
      );
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id/archive',
    { preHandler: [auth, canArchive] },
    async (request, reply) => {
      await send<PageAdminDto>(reply, () =>
        archivePage(request.params.id, request.user!.id),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id/revisions',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<PageRevisionDto[]>(reply, () =>
        listPageRevisions(request.params.id),
      );
    },
  );

  app.get<{ Params: RevisionParams }>(
    '/api/v1/admin/pages/:id/revisions/:revisionId',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await send<PageRevisionDto>(reply, () =>
        getPageRevision(request.params.id, request.params.revisionId),
      );
    },
  );

  app.post<{ Params: RevisionParams }>(
    '/api/v1/admin/pages/:id/revisions/:revisionId/restore',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      await send<PageAdminDto>(reply, () =>
        restorePageRevision(
          request.params.id,
          request.params.revisionId,
          request.user!.id,
        ),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/pages/:id/preview',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      // Preview is never public and must not be indexed (docs/11 §15, docs/08 §24).
      reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
      reply.header('Cache-Control', 'no-store');
      await send<PageAdminDto>(reply, () => previewPage(request.params.id));
    },
  );
}
