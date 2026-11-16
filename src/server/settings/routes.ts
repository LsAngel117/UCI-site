/**
 * Public + admin settings HTTP routes (Phase 9A1, docs/08 §17).
 *
 * Public, unauthenticated:
 *   GET /api/v1/settings/public   normalized public configuration
 *
 * Admin, permission-protected (docs/11 §9):
 *   GET   /api/v1/admin/settings  settings.read
 *   PATCH /api/v1/admin/settings  settings.update
 *
 * The public route attaches no `preHandler` on purpose. The admin route
 * evaluates authorization server-side before the handler runs, never through
 * client-side visibility.
 */
import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from '@shared/api';
import type { AdminSettingsDto, PublicSettingsDto } from '@shared/settings';
import { requireAuth, requirePermission } from '../auth/middleware';
import type { ServerConfig } from '../config';
import { recordAudit } from '../cms/audit';
import { cmsErrorEnvelope, isCmsError } from '../cms/errors';
import {
  getAdminSettings,
  getPublicSettings,
  updateSettings,
} from './service';
import { parseUpdateSettingsInput } from './validation';

export function registerPublicSettingsRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  app.get('/api/v1/settings/public', async (_request, reply) => {
    try {
      const data = await getPublicSettings(config.timezone);
      reply.send({ data } satisfies ApiResponse<PublicSettingsDto>);
    } catch (error) {
      if (isCmsError(error)) {
        reply.code(error.statusCode).send(cmsErrorEnvelope(error));
        return;
      }
      throw error;
    }
  });
}

export function registerAdminSettingsRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('settings.read');
  const canUpdate = requirePermission('settings.update');

  app.get(
    '/api/v1/admin/settings',
    { preHandler: [auth, canRead] },
    async (_request, reply) => {
      try {
        const data = await getAdminSettings();
        reply.send({ data } satisfies ApiResponse<AdminSettingsDto>);
      } catch (error) {
        if (isCmsError(error)) {
          reply.code(error.statusCode).send(cmsErrorEnvelope(error));
          return;
        }
        throw error;
      }
    },
  );

  app.patch(
    '/api/v1/admin/settings',
    { preHandler: [auth, canUpdate] },
    async (request, reply) => {
      try {
        const input = parseUpdateSettingsInput(request.body ?? {});
        const data = await updateSettings(input);
        await recordAudit({
          actorId: request.user!.id,
          action: 'settings.update',
          entityType: 'site',
          // Never persist the payload itself: only which sections changed.
          metadata: { sections: Object.keys(input) },
        });
        reply.send({ data } satisfies ApiResponse<AdminSettingsDto>);
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
