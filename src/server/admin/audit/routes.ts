/**
 * Admin audit API (Phase 10D1, docs/08 §21).
 *
 *   GET /api/v1/admin/audit   audit.read
 *
 * Read-only by design: audit rows are immutable through the normal API
 * (docs/08 §21). Newest-first, paginated, with actor/action/entity/date
 * filters. `user`/`resource`/`resourceId` are accepted as aliases of the
 * canonical `actor`/`entityType`/`entityId` filter names used by docs/08 §21.
 */
import type { FastifyInstance } from 'fastify';
import type { AuditLogDto } from '@shared/admin';
import type { ServerConfig } from '../../config';
import { requireAuth, requirePermission } from '../../auth/middleware';
import { sendList } from '../http';
import { listAuditLogs } from './service';
import { parseAuditLogListQuery } from './validation';

export function registerAdminAuditRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const auth = requireAuth(config);
  const canRead = requirePermission('audit.read');

  app.get('/api/v1/admin/audit', { preHandler: [auth, canRead] }, async (request, reply) => {
    await sendList<AuditLogDto>(reply, () =>
      listAuditLogs(parseAuditLogListQuery(request.query)),
    );
  });
}
