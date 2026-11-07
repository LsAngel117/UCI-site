/**
 * Editorial audit trail (docs/05 §33, docs/08 §21, docs/11 §31–32).
 *
 * Every editorial action is recorded append-only in `audit_logs`. Centralizing
 * the write here means the trail's shape is enforced in exactly one place and
 * every content module produces identical records: who acted, what they did,
 * and on which entity.
 *
 * The audit write is intentionally decoupled from the domain write: it is a
 * separate statement so a future outbox/transaction strategy can wrap both
 * without changing call sites.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

export interface AuditEvent {
  /** Null for system actions (e.g. scheduled publishing of due content). */
  actorId: string | null;
  /** Namespaced action, e.g. `sermon.publish`. */
  action: string;
  /** Entity type, e.g. `SERMON`. */
  entityType: string;
  entityId?: string | null;
  /** Optional structured context (previous status, schedule instant, ...). */
  metadata?: unknown;
}

/** Append an audit record. Never throws for a null/absent optional context. */
export async function recordAudit(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      metadata:
        event.metadata === undefined
          ? undefined
          : (event.metadata as Prisma.InputJsonValue),
    },
  });
}

/** Namespaced audit action for a lifecycle operation (`sermon.publish`, ...). */
export function lifecycleAuditAction(
  entityType: string,
  action: string,
): string {
  return `${entityType.toLowerCase()}.${action}`;
}
