/**
 * Dashboard composition helpers (docs/visual/01 §8).
 *
 * Pure, permission-aware derivations used by the panel home. Keeping them out
 * of the React component means the rules can be probed with the repository's
 * plain Node tests while the screen stays a thin renderer. Nothing here invents
 * data: every helper summarizes only values the API returned.
 */
import type { AuditLogDto } from '@shared/admin';
import type { PermissionName } from '@shared/api';
import type { HasPermission, NavIconName } from './navigation';

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

export interface QuickAction {
  key: string;
  label: string;
  /** Panel-relative destination. */
  to: string;
  permission: PermissionName;
  icon: NavIconName;
}

/**
 * Editorial shortcuts defined by the functional specification (docs/09 §13,
 * docs/visual/01 §8.6). Order is intentional: the two most frequent content
 * actions first, then pages, then media.
 */
export const DASHBOARD_QUICK_ACTIONS: readonly QuickAction[] = [
  {
    key: 'sermon',
    label: 'Nuevo sermón',
    to: '/contenido/sermones/nuevo',
    permission: 'sermons.create',
    icon: 'plus',
  },
  {
    key: 'event',
    label: 'Nuevo evento',
    to: '/contenido/eventos',
    permission: 'events.create',
    icon: 'plus',
  },
  {
    key: 'page',
    label: 'Nueva página',
    to: '/contenido/paginas',
    permission: 'pages.create',
    icon: 'plus',
  },
  {
    key: 'media',
    label: 'Subir imagen',
    to: '/media/biblioteca',
    permission: 'media.upload',
    icon: 'upload',
  },
];

/** Only the shortcuts this session can actually start. */
export function visibleQuickActions(has: HasPermission): QuickAction[] {
  return DASHBOARD_QUICK_ACTIONS.filter((action) => has(action.permission));
}

// ---------------------------------------------------------------------------
// Draft totals
// ---------------------------------------------------------------------------

export interface DraftSource {
  /** Module label shown as the card context, e.g. "Sermones". */
  label: string;
  /** Real count from the API, or `null` when that request failed. */
  total: number | null;
}

export interface DraftSummary {
  /** Sum of the counts that were actually available; `null` when none were. */
  total: number | null;
  labels: string[];
  /** False when at least one module count could not be loaded. */
  complete: boolean;
}

/**
 * Aggregate the draft counts of every content module the operator can read.
 * A failed module is left out of the sum and marks the result partial instead
 * of being silently reported as zero.
 */
export function summarizeDrafts(sources: readonly DraftSource[]): DraftSummary {
  const available = sources.filter(
    (source): source is DraftSource & { total: number } =>
      source.total !== null,
  );
  if (available.length === 0) {
    return { total: null, labels: [], complete: false };
  }
  return {
    total: available.reduce((sum, source) => sum + source.total, 0),
    labels: available.map((source) => source.label),
    complete: available.length === sources.length,
  };
}

// ---------------------------------------------------------------------------
// Scheduled content
// ---------------------------------------------------------------------------

export type ScheduledKind = 'sermon' | 'page' | 'story' | 'event';

export interface ScheduledEntry {
  id: string;
  title: string;
  kind: ScheduledKind;
  /** Human label for the content type, e.g. "Sermón". */
  kindLabel: string;
  /** ISO instant when it becomes public, or `null` if the API left it empty. */
  publishAt: string | null;
  createdAt: string;
  /** Safe panel destination when one exists. */
  href: string | null;
}

function timeValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Merge the scheduled lists of several modules into one chronological queue.
 * Items without a publication instant stay last; ties fall back to creation
 * time so the order is stable between renders.
 */
export function mergeScheduled(
  groups: ReadonlyArray<readonly ScheduledEntry[]>,
  limit = 5,
): ScheduledEntry[] {
  return [...groups.flat()]
    .sort(
      (left, right) =>
        timeValue(left.publishAt) - timeValue(right.publishAt) ||
        timeValue(left.createdAt) - timeValue(right.createdAt),
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Audit activity
// ---------------------------------------------------------------------------

export interface AuditDescription {
  /** Spanish verb phrase, e.g. "publicó". */
  verb: string;
  /** Noun phrase with its article, e.g. "un sermón"; `null` for session events. */
  entity: string | null;
}

const AUDIT_VERBS: Record<string, string> = {
  created: 'creó',
  create: 'creó',
  updated: 'actualizó',
  update: 'actualizó',
  publish: 'publicó',
  schedule: 'programó',
  archive: 'archivó',
  unpublish: 'despublicó',
  restored: 'restauró',
  upload: 'subió',
  delete: 'eliminó',
  reordered: 'reordenó',
  disable: 'desactivó',
};

const AUDIT_ENTITY_PHRASES: Record<string, string> = {
  sermon: 'un sermón',
  page: 'una página',
  event: 'un evento',
  story: 'una historia',
  media: 'un archivo multimedia',
  user: 'un usuario',
  role: 'un rol',
  settings: 'la configuración',
  navigation: 'la navegación',
  seo: 'el SEO',
  contact: 'un mensaje de contacto',
  'event-category': 'una categoría de evento',
  ministry: 'un ministerio',
};

/**
 * Translate an audit action (`sermon.publish`, `media.upload`, …) into copy a
 * non-technical editor understands. Unknown actions fall back to the raw verb
 * so the screen never hides what the log actually recorded.
 */
export function describeAuditAction(action: string): AuditDescription {
  if (action === 'auth.login') return { verb: 'inició sesión', entity: null };
  if (action === 'auth.logout') return { verb: 'cerró sesión', entity: null };
  if (action === 'auth.login_failed') {
    return { verb: 'intentó iniciar sesión', entity: null };
  }
  if (action === 'auth.password_reset') {
    return { verb: 'restableció la contraseña', entity: null };
  }

  const separator = action.indexOf('.');
  const entityKey = separator === -1 ? action : action.slice(0, separator);
  const verbKey = separator === -1 ? '' : action.slice(separator + 1);
  return {
    verb: AUDIT_VERBS[verbKey] ?? (verbKey ? `realizó ${verbKey}` : 'modificó'),
    entity: AUDIT_ENTITY_PHRASES[entityKey] ?? null,
  };
}

/** Compact one-line description for an audit row. */
export function auditActionText(action: string): string {
  const { verb, entity } = describeAuditAction(action);
  return entity ? `${verb} ${entity}` : verb;
}

type AuditEntryLike = Pick<AuditLogDto, 'action' | 'entityType' | 'entityId'>;

function entityIdPath(entityId: string | null): string | null {
  return entityId ? encodeURIComponent(entityId) : null;
}

/**
 * Destination for an audit row, but only when the target screen exists and the
 * operator can read it. Pages and events have no editor route yet, so their
 * activity is shown as text rather than a misleading link.
 */
export function auditEntryHref(
  entry: AuditEntryLike,
  has: HasPermission,
): string | null {
  const type = entry.entityType.toUpperCase();
  const id = entityIdPath(entry.entityId);

  switch (type) {
    case 'SERMON':
      if (!id || !has('sermons.read')) return null;
      return has('sermons.update')
        ? `/contenido/sermones/${id}`
        : `/contenido/sermones/${id}/preview`;
    case 'STORY':
      return id && has('pages.read') ? `/contenido/historias/${id}` : null;
    case 'MEDIA':
      return has('media.read') ? '/media/biblioteca' : null;
    case 'USER':
      return has('users.read') ? '/administracion/usuarios' : null;
    case 'ROLE':
      return has('roles.read') ? '/administracion/roles' : null;
    case 'NAVIGATION':
      return has('navigation.read') ? '/sitio/navegacion' : null;
    case 'SEO':
      return has('seo.read') ? '/sitio/seo' : null;
    case 'SETTINGS':
      return has('settings.read') ? '/administracion/configuracion' : null;
    case 'CONTACT_SUBMISSION':
      return has('contact.read') ? '/administracion/contacto' : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Identity avatar
// ---------------------------------------------------------------------------

/** Up to two initials for the header and activity avatars. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
