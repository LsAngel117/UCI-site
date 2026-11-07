/**
 * Admin contact inbox API (Phase 11A, docs/08 §19).
 *
 *   GET   /api/v1/admin/contact-submissions        contact.read
 *   GET   /api/v1/admin/contact-submissions/:id    contact.read
 *   PATCH /api/v1/admin/contact-submissions/:id    contact.manage
 *
 * Every route is protected by `requireAuth` + the exact permission; the
 * pre-handler chain runs before any service call (docs/11 §3.3). No route here
 * is public, and the public contact endpoint never returns stored rows.
 */
import type { FastifyInstance } from 'fastify';
import type { ContactSubmissionDto } from '@shared/contact';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { sendData, sendList } from '../http';
import {
  getContactSubmission,
  listContactSubmissions,
  updateContactSubmissionStatus,
} from './service';
import {
  parseContactSubmissionListQuery,
  parseUpdateContactSubmissionInput,
} from './validation';

interface IdParams {
  id: string;
}

export function registerAdminContactRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('contact.read');
  const canManage = requirePermission('contact.manage');

  app.get(
    '/api/v1/admin/contact-submissions',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await sendList<ContactSubmissionDto>(reply, () =>
        listContactSubmissions(parseContactSubmissionListQuery(request.query)),
      );
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/v1/admin/contact-submissions/:id',
    { preHandler: [auth, canRead] },
    async (request, reply) => {
      await sendData<ContactSubmissionDto>(reply, () =>
        getContactSubmission(request.params.id),
      );
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/v1/admin/contact-submissions/:id',
    { preHandler: [auth, canManage] },
    async (request, reply) => {
      await sendData<ContactSubmissionDto>(reply, () =>
        updateContactSubmissionStatus(
          request.params.id,
          parseUpdateContactSubmissionInput(request.body ?? {}),
          request.user!.id,
        ),
      );
    },
  );
}
