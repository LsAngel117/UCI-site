/**
 * Pure administration-UI helpers (Phase 10D2, docs/08 §8–§9, §14, §17–§18,
 * §21; docs/09 §16–§21; docs/11 §9).
 *
 * The panel screens stay declarative: permission projection, filter
 * serialization, form validation, role-matrix grouping, safeguard detection and
 * navigation tree/reorder math all live here as DOM-free functions. They are
 * covered by `tests/admin-ui.unit.test.ts`, and none of them is an
 * authorization boundary — the API still decides every request.
 */
import type { PermissionName } from '@shared/api';
import type {
  AdminUserDto,
  AdminUserListQuery,
  AuditLogListQuery,
  PermissionDto,
} from '@shared/admin';
import type {
  NavigationAdminDto,
  NavigationLocation,
  NavigationReorderItem,
  NavigationTarget,
} from '@shared/cms';
import type {
  ContactSubmissionListQuery,
  ContactSubmissionStatus,
} from '@shared/contact';
import type {
  AdminSettingsDto,
  UpdateSettingsInput,
} from '@shared/settings';
import type { SiteSeoDto, UpdateSiteSeoInput } from '@shared/seo';
import { ApiError } from './api';
import { describeError } from './errors';
import type { HasPermission } from './navigation';

// ---------------------------------------------------------------------------
// Permission projection
// ---------------------------------------------------------------------------

export interface AdminUserPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  disable: boolean;
}

export function adminUserPermissions(has: HasPermission): AdminUserPermissions {
  return {
    read: has('users.read'),
    create: has('users.create'),
    update: has('users.update'),
    disable: has('users.disable'),
  };
}

export interface RolePagePermissions {
  read: boolean;
  update: boolean;
}

export function rolePagePermissions(has: HasPermission): RolePagePermissions {
  return { read: has('roles.read'), update: has('roles.update') };
}

export interface SettingsPagePermissions {
  read: boolean;
  update: boolean;
}

export function settingsPagePermissions(
  has: HasPermission,
): SettingsPagePermissions {
  return { read: has('settings.read'), update: has('settings.update') };
}

export interface NavigationPagePermissions {
  read: boolean;
  update: boolean;
}

export function navigationPagePermissions(
  has: HasPermission,
): NavigationPagePermissions {
  return {
    read: has('navigation.read'),
    update: has('navigation.update'),
  };
}

export interface SeoPagePermissions {
  read: boolean;
  update: boolean;
}

export function seoPagePermissions(has: HasPermission): SeoPagePermissions {
  return { read: has('seo.read'), update: has('seo.update') };
}

export interface AuditPagePermissions {
  read: boolean;
}

export function auditPagePermissions(has: HasPermission): AuditPagePermissions {
  return { read: has('audit.read') };
}

/** The inbox is readable by triage roles; only `contact.manage` changes state. */
export interface ContactPagePermissions {
  read: boolean;
  manage: boolean;
}

export function contactPagePermissions(
  has: HasPermission,
): ContactPagePermissions {
  return { read: has('contact.read'), manage: has('contact.manage') };
}

// ---------------------------------------------------------------------------
// Users: filters and forms
// ---------------------------------------------------------------------------

export interface UserFilters {
  search: string;
  /** Role name, e.g. `EDITOR`. Empty means "all roles". */
  role: string;
  active: '' | 'true' | 'false';
}

export function emptyUserFilters(): UserFilters {
  return { search: '', role: '', active: '' };
}

export function userFiltersActive(filters: UserFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.role.trim().length > 0 ||
    filters.active !== ''
  );
}

export function buildUserListQuery(
  filters: UserFilters,
  page: number,
  limit: number,
): AdminUserListQuery {
  const query: AdminUserListQuery = { page, limit };
  const search = filters.search.trim();
  const role = filters.role.trim();
  if (search.length > 0) query.search = search;
  if (role.length > 0) query.role = role;
  if (filters.active === 'true') query.active = true;
  if (filters.active === 'false') query.active = false;
  return query;
}

export const PASSWORD_MIN_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserCreateForm {
  email: string;
  name: string;
  password: string;
  roles: string[];
}

export interface UserCreateFormErrors {
  email?: string;
  name?: string;
  password?: string;
}

export function emptyUserCreateForm(): UserCreateForm {
  return { email: '', name: '', password: '', roles: [] };
}

export function validateUserCreateForm(
  form: UserCreateForm,
): UserCreateFormErrors {
  const errors: UserCreateFormErrors = {};
  const email = form.email.trim();
  if (email.length === 0) {
    errors.email = 'Ingresá el correo de la cuenta.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Ingresá un correo válido.';
  }
  if (form.name.trim().length === 0) {
    errors.name = 'Ingresá el nombre visible de la cuenta.';
  }
  if (form.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return errors;
}

export interface UserEditForm {
  name: string;
  active: boolean;
  roles: string[];
}

export function userToEditForm(
  user: Pick<AdminUserDto, 'name' | 'active' | 'roles'>,
): UserEditForm {
  return {
    name: user.name,
    active: user.active,
    roles: user.roles.map((role) => role.name),
  };
}

export function validateUserEditForm(
  form: UserEditForm,
): { name?: string } {
  return form.name.trim().length === 0
    ? { name: 'Ingresá el nombre visible de la cuenta.' }
    : {};
}

// ---------------------------------------------------------------------------
// Audit: filters
// ---------------------------------------------------------------------------

export interface AuditFilters {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Date-only input value (`YYYY-MM-DD`), inclusive lower bound. */
  from: string;
  /** Date-only input value (`YYYY-MM-DD`), inclusive upper bound. */
  to: string;
}

export function emptyAuditFilters(): AuditFilters {
  return {
    actor: '',
    action: '',
    entityType: '',
    entityId: '',
    from: '',
    to: '',
  };
}

export function auditFiltersActive(filters: AuditFilters): boolean {
  return (
    filters.actor.trim().length > 0 ||
    filters.action.trim().length > 0 ||
    filters.entityType.trim().length > 0 ||
    filters.entityId.trim().length > 0 ||
    filters.from.length > 0 ||
    filters.to.length > 0
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateOnlyTime(value: string): number | null {
  if (!DATE_ONLY.test(value)) return null;
  const time = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Date-input guard. The audit and contact APIs accept an inverted range with a
 * 400; the panel catches it first so a malformed range never replaces the list
 * with a misleading error state.
 */
function dateRangeError(from: string, to: string): string | null {
  if (from.length > 0 && dateOnlyTime(from) === null) {
    return 'La fecha "desde" no es válida.';
  }
  if (to.length > 0 && dateOnlyTime(to) === null) {
    return 'La fecha "hasta" no es válida.';
  }
  if (from.length > 0 && to.length > 0) {
    const start = dateOnlyTime(from);
    const end = dateOnlyTime(to);
    if (start !== null && end !== null && start > end) {
      return 'La fecha "desde" no puede ser posterior a la fecha "hasta".';
    }
  }
  return null;
}

export function auditDateRangeError(from: string, to: string): string | null {
  return dateRangeError(from, to);
}

export function contactDateRangeError(
  from: string,
  to: string,
): string | null {
  return dateRangeError(from, to);
}

export function buildAuditListQuery(
  filters: AuditFilters,
  page: number,
  limit: number,
): AuditLogListQuery {
  const query: AuditLogListQuery = { page, limit };
  const actor = filters.actor.trim();
  const action = filters.action.trim();
  const entityType = filters.entityType.trim();
  const entityId = filters.entityId.trim();
  if (actor.length > 0) query.actor = actor;
  if (action.length > 0) query.action = action;
  if (entityType.length > 0) query.entityType = entityType;
  if (entityId.length > 0) query.entityId = entityId;
  if (filters.from.length > 0 && DATE_ONLY.test(filters.from)) {
    query.from = `${filters.from}T00:00:00.000Z`;
  }
  if (filters.to.length > 0 && DATE_ONLY.test(filters.to)) {
    query.to = `${filters.to}T23:59:59.999Z`;
  }
  return query;
}

// ---------------------------------------------------------------------------
// Contact inbox: filters, status projection and previews
// ---------------------------------------------------------------------------

export type ContactStatusFilter = '' | ContactSubmissionStatus;

export interface ContactFilters {
  /** Matches name, email or message (case-insensitive). */
  search: string;
  /** Canonical status filter; empty means "all". */
  status: ContactStatusFilter;
  /** Date-only input value (`YYYY-MM-DD`), inclusive lower bound. */
  from: string;
  /** Date-only input value (`YYYY-MM-DD`), inclusive upper bound. */
  to: string;
}

export function emptyContactFilters(): ContactFilters {
  return { search: '', status: '', from: '', to: '' };
}

export function contactFiltersActive(filters: ContactFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== '' ||
    filters.from.length > 0 ||
    filters.to.length > 0
  );
}

/**
 * Serialize the inbox filters. The API treats `from`/`to` as inclusive ISO
 * instants, so date-only inputs expand to the first and last millisecond of the
 * chosen calendar day in UTC instead of being sent as ambiguous local dates.
 */
export function buildContactSubmissionListQuery(
  filters: ContactFilters,
  page: number,
  limit: number,
): ContactSubmissionListQuery {
  const query: ContactSubmissionListQuery = { page, limit };
  const search = filters.search.trim();
  if (search.length > 0) query.search = search;
  if (filters.status !== '') query.status = filters.status;
  if (filters.from.length > 0 && DATE_ONLY.test(filters.from)) {
    query.from = `${filters.from}T00:00:00.000Z`;
  }
  if (filters.to.length > 0 && DATE_ONLY.test(filters.to)) {
    query.to = `${filters.to}T23:59:59.999Z`;
  }
  return query;
}

/** Human label for the two canonical inbox states. */
export function contactStatusLabel(status: ContactSubmissionStatus): string {
  return status === 'HANDLED' ? 'Gestionada' : 'Nueva';
}

export interface ContactStatusAction {
  /** Status the action moves the submission to. */
  next: ContactSubmissionStatus;
  label: string;
  /** Reopening is consequential, so the UI asks for confirmation first. */
  confirm: boolean;
}

/** The single state transition offered for a submission in this state. */
export function contactStatusAction(
  status: ContactSubmissionStatus,
): ContactStatusAction {
  return status === 'HANDLED'
    ? { next: 'NEW', label: 'Reabrir', confirm: true }
    : { next: 'HANDLED', label: 'Marcar gestionada', confirm: false };
}

export const CONTACT_PREVIEW_MAX_LENGTH = 140;

/**
 * Compact one-line preview for the inbox table. Whitespace is collapsed so a
 * multi-line message cannot break the row, and the full text stays available in
 * the detail dialog.
 */
export function contactMessagePreview(
  message: string,
  maxLength = CONTACT_PREVIEW_MAX_LENGTH,
): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Roles: permission matrix
// ---------------------------------------------------------------------------

const PERMISSION_DOMAIN_LABELS: Record<string, string> = {
  users: 'Usuarios',
  roles: 'Roles y permisos',
  pages: 'Páginas',
  sermons: 'Sermones',
  events: 'Eventos',
  ministries: 'Ministerios',
  media: 'Multimedia',
  navigation: 'Navegación',
  seo: 'SEO',
  settings: 'Configuración',
  audit: 'Auditoría',
  contact: 'Contacto',
};

export interface PermissionGroup {
  /** Domain prefix, e.g. `users`. */
  key: string;
  label: string;
  permissions: PermissionDto[];
}

/**
 * Group the canonical vocabulary by its domain prefix, preserving the
 * first-seen order so the matrix mirrors the server's canonical permission
 * order instead of inventing a second one.
 */
export function groupPermissions(
  permissions: readonly PermissionDto[],
): PermissionGroup[] {
  const order: string[] = [];
  const groups = new Map<string, PermissionGroup>();
  for (const permission of permissions) {
    const key = permission.name.split('.')[0] ?? 'otros';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: PERMISSION_DOMAIN_LABELS[key] ?? 'Otros',
        permissions: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.permissions.push(permission);
  }
  return order.map((key) => groups.get(key)!);
}

export function togglePermission(
  selected: readonly PermissionName[],
  name: PermissionName,
): PermissionName[] {
  return selected.includes(name)
    ? selected.filter((entry) => entry !== name)
    : [...selected, name];
}

/**
 * The ADMIN role must keep `roles.update`; without it no principal could grant
 * the permission back through the API (docs/08 §9). The server enforces this
 * with a 409; the UI warns before submitting but never hides the server answer.
 */
export function adminRoleMissingCritical(
  roleName: string,
  selected: readonly PermissionName[],
): boolean {
  return (
    roleName.trim().toUpperCase() === 'ADMIN' &&
    !selected.includes('roles.update')
  );
}

export function adminCriticalMessage(): string {
  return 'El rol ADMIN debe conservar el permiso roles.update; sin él nadie podría volver a administrar los roles desde el panel.';
}

// ---------------------------------------------------------------------------
// Safeguard errors (409)
// ---------------------------------------------------------------------------

export const SAFEGUARD_MESSAGES = {
  LAST_ACTIVE_ADMIN:
    'Es el último administrador activo: no se puede deshabilitar, desactivar ni quitarle el rol ADMIN. Asigná el rol ADMIN a otra cuenta activa antes de continuar.',
  ADMIN_CRITICAL_PERMISSION:
    'El rol ADMIN debe conservar el permiso roles.update; sin él nadie podría volver a administrar los roles desde el panel.',
} as const;

export type AdminSafeguardReason = keyof typeof SAFEGUARD_MESSAGES;

/**
 * Detect the documented 409 safeguards. The stable reason travels in the error
 * envelope `details`; message matching is only a fallback for older servers so
 * the operator still gets the honest explanation.
 */
export function adminSafeguardReason(
  error: unknown,
): AdminSafeguardReason | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  if (typeof error.details === 'object' && error.details !== null) {
    const reason = (error.details as { reason?: unknown }).reason;
    if (reason === 'LAST_ACTIVE_ADMIN' || reason === 'ADMIN_CRITICAL_PERMISSION') {
      return reason;
    }
  }

  if (/last active administrator/i.test(error.message)) {
    return 'LAST_ACTIVE_ADMIN';
  }
  if (/must keep the "roles\.update"/i.test(error.message)) {
    return 'ADMIN_CRITICAL_PERMISSION';
  }
  return null;
}

/** Safeguard copy when recognized, otherwise the standard error description. */
export function describeAdminMutationError(error: unknown): string {
  const reason = adminSafeguardReason(error);
  if (reason) return SAFEGUARD_MESSAGES[reason];
  return describeError(error);
}

// ---------------------------------------------------------------------------
// Navigation: tree, reorder and form
// ---------------------------------------------------------------------------

const NAVIGATION_LOCATION_ORDER: readonly NavigationLocation[] = [
  'HEADER',
  'FOOTER',
];

export interface NavigationTreeNode {
  item: NavigationAdminDto;
  depth: number;
  children: NavigationTreeNode[];
}

export interface NavigationLocationGroup {
  location: NavigationLocation;
  nodes: NavigationTreeNode[];
}

function sortSiblings(
  rows: readonly NavigationAdminDto[],
): NavigationAdminDto[] {
  return [...rows].sort(
    (a, b) =>
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

/** A stable key for "same menu, same parent" — the reorder sibling group. */
export function navigationSiblingKey(
  item: Pick<NavigationAdminDto, 'location' | 'parentId'>,
): string {
  return `${item.location}::${item.parentId ?? ''}`;
}

/**
 * Group rows by menu location and nest children under `parentId`. A child whose
 * parent is not present is promoted to a root instead of vanishing.
 */
export function groupNavigation(
  rows: readonly NavigationAdminDto[],
): NavigationLocationGroup[] {
  const locations: NavigationLocation[] = NAVIGATION_LOCATION_ORDER.filter(
    (location) => rows.some((row) => row.location === location),
  );
  for (const row of rows) {
    if (!locations.includes(row.location)) locations.push(row.location);
  }

  return locations.map((location) => {
    const locationRows = rows.filter((row) => row.location === location);
    const ids = new Set(locationRows.map((row) => row.id));

    function build(
      row: NavigationAdminDto,
      depth: number,
      seen: Set<string>,
    ): NavigationTreeNode {
      const nextSeen = new Set(seen);
      nextSeen.add(row.id);
      const children = sortSiblings(
        locationRows.filter(
          (child) =>
            child.parentId === row.id &&
            !nextSeen.has(child.id),
        ),
      ).map((child) => build(child, depth + 1, nextSeen));
      return { item: row, depth, children };
    }

    const roots = sortSiblings(
      locationRows.filter(
        (row) => row.parentId === null || !ids.has(row.parentId),
      ),
    );

    return {
      location,
      nodes: roots.map((root) => build(root, 0, new Set())),
    };
  });
}

export interface NavigationParentOption {
  id: string;
  label: string;
  depth: number;
}

function descendantsOf(
  rows: readonly NavigationAdminDto[],
  id: string,
): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const row of rows) {
      if (row.parentId === current && !result.has(row.id)) {
        result.add(row.id);
        queue.push(row.id);
      }
    }
  }
  return result;
}

function depthOf(rows: readonly NavigationAdminDto[], id: string): number {
  let depth = 0;
  let cursor = rows.find((row) => row.id === id)?.parentId ?? null;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = rows.find((row) => row.id === cursor)?.parentId ?? null;
  }
  return depth;
}

/**
 * Parents that can be selected without creating a cycle: every item in the
 * same menu except the edited item and its descendants.
 */
export function parentCandidates(
  rows: readonly NavigationAdminDto[],
  location: NavigationLocation,
  excludeId?: string,
): NavigationParentOption[] {
  const excluded = new Set<string>();
  if (excludeId) {
    excluded.add(excludeId);
    for (const id of descendantsOf(rows, excludeId)) excluded.add(id);
  }
  return rows
    .filter((row) => row.location === location && !excluded.has(row.id))
    .map((row) => ({
      id: row.id,
      label: row.label,
      depth: depthOf(rows, row.id),
    }))
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Reorder payload for one step up/down. Positions are normalized inside the
 * sibling group, which is the only scope the menu cares about. Returns `null`
 * when the item is already at the edge (or is not present).
 */
export function reorderPayload(
  rows: readonly NavigationAdminDto[],
  itemId: string,
  direction: 'up' | 'down',
): NavigationReorderItem[] | null {
  const current = rows.find((row) => row.id === itemId);
  if (!current) return null;

  const siblings = sortSiblings(
    rows.filter(
      (row) =>
        row.location === current.location &&
        row.parentId === current.parentId,
    ),
  );
  const index = siblings.findIndex((row) => row.id === itemId);
  if (index < 0) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return null;

  const next = [...siblings];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next.map((row, position) => ({ id: row.id, position }));
}

/** Next free position inside a sibling group. */
export function nextNavigationOrder(
  rows: readonly NavigationAdminDto[],
  location: NavigationLocation,
  parentId: string | null,
): number {
  const siblings = rows.filter(
    (row) => row.location === location && row.parentId === parentId,
  );
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((row) => row.order)) + 1;
}

export interface NavigationForm {
  label: string;
  href: string;
  external: boolean;
  location: NavigationLocation;
  /** Empty means the browser default (no `target` attribute). */
  target: '' | NavigationTarget;
  visible: boolean;
  /** Empty means no parent. */
  parentId: string;
  order: number;
}

export function emptyNavigationForm(
  location: NavigationLocation = 'HEADER',
): NavigationForm {
  return {
    label: '',
    href: '',
    external: false,
    location,
    target: '',
    visible: true,
    parentId: '',
    order: 0,
  };
}

export function navigationToForm(row: NavigationAdminDto): NavigationForm {
  return {
    label: row.label,
    href: row.href,
    external: row.external,
    location: row.location,
    target: row.target ?? '',
    visible: row.visible,
    parentId: row.parentId ?? '',
    order: row.order,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface NavigationFormErrors {
  label?: string;
  href?: string;
  order?: string;
}

/** Mirror the navigation service's boundary rules before sending a request. */
export function validateNavigationForm(
  form: NavigationForm,
): NavigationFormErrors {
  const errors: NavigationFormErrors = {};
  if (form.label.trim().length === 0) {
    errors.label = 'Ingresá una etiqueta para el enlace.';
  }
  const href = form.href.trim();
  if (href.length === 0) {
    errors.href = 'Ingresá un destino (href).';
  } else if (form.external) {
    if (!isHttpUrl(href)) {
      errors.href = 'Un enlace externo debe ser una URL http(s).';
    }
  } else if (!href.startsWith('/')) {
    errors.href = 'Un enlace interno debe empezar con "/".';
  }
  if (!Number.isInteger(form.order) || form.order < 0) {
    errors.order = 'El orden debe ser un número entero mayor o igual a 0.';
  }
  return errors;
}

export function navigationTargetLabel(
  target: NavigationTarget | null,
): string {
  if (target === '_blank') return 'Nueva pestaña';
  if (target === '_self') return 'Misma pestaña';
  return 'Predeterminado';
}

export function navigationLocationLabel(
  location: NavigationLocation,
): string {
  return location === 'FOOTER' ? 'Pie de página' : 'Encabezado';
}

// ---------------------------------------------------------------------------
// Settings: form model
// ---------------------------------------------------------------------------

export const DAY_OF_WEEK_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
}> = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export function dayOfWeekLabel(day: number): string {
  return (
    DAY_OF_WEEK_OPTIONS.find((option) => option.value === day)?.label ??
    `Día ${day}`
  );
}

export interface ChurchForm {
  name: string;
  shortDescription: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  whatsapp: string;
}

export interface ScheduleFormRow {
  name: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

export interface SocialFormRow {
  platform: string;
  label: string;
  url: string;
}

export interface GivingForm {
  title: string;
  message: string;
  ctaLabel: string;
  url: string;
}

export interface SettingsForm {
  church: ChurchForm;
  schedule: ScheduleFormRow[];
  socials: SocialFormRow[];
  giving: GivingForm;
}

export function emptyChurchForm(): ChurchForm {
  return {
    name: '',
    shortDescription: '',
    address: '',
    city: '',
    state: '',
    phone: '',
    email: '',
    whatsapp: '',
  };
}

export function emptySettingsForm(): SettingsForm {
  return {
    church: emptyChurchForm(),
    schedule: [],
    socials: [],
    giving: { title: '', message: '', ctaLabel: '', url: '' },
  };
}

export function adminSettingsToForm(dto: AdminSettingsDto): SettingsForm {
  return {
    church: {
      name: dto.church.name,
      shortDescription: dto.church.shortDescription,
      address: dto.church.address ?? '',
      city: dto.church.city ?? '',
      state: dto.church.state ?? '',
      phone: dto.church.phone ?? '',
      email: dto.church.email ?? '',
      whatsapp: dto.church.whatsapp ?? '',
    },
    schedule: dto.schedule.map((entry) => ({
      name: entry.name,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime ?? '',
      active: entry.active,
    })),
    socials: dto.socials.map((entry) => ({
      platform: entry.platform,
      label: entry.label,
      url: entry.url ?? '',
    })),
    giving: {
      title: dto.giving.title,
      message: dto.giving.message,
      ctaLabel: dto.giving.ctaLabel,
      url: dto.giving.url ?? '',
    },
  };
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

function nullableText(value: string): string | null {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function requireText(
  errors: Record<string, string>,
  key: string,
  value: string,
  message: string,
): void {
  if (value.trim().length === 0) errors[key] = message;
}

function requireUrl(
  errors: Record<string, string>,
  key: string,
  value: string,
): void {
  const text = value.trim();
  if (text.length > 0 && !isHttpUrl(text)) {
    errors[key] = 'Ingresá una URL http(s) válida o dejá el campo vacío.';
  }
}

/**
 * Client-side guard that mirrors the server's settings rules. The API still
 * validates every payload; this only keeps an obviously invalid form from
 * replacing the settings with a generic error.
 */
export function validateSettingsForm(
  form: SettingsForm,
): Record<string, string> {
  const errors: Record<string, string> = {};

  requireText(errors, 'church.name', form.church.name, 'Ingresá el nombre de la iglesia.');
  requireText(
    errors,
    'church.shortDescription',
    form.church.shortDescription,
    'Ingresá una descripción breve.',
  );

  form.schedule.forEach((row, index) => {
    const prefix = `schedule[${index}]`;
    requireText(errors, `${prefix}.name`, row.name, 'Ingresá el nombre del horario.');
    if (!TIME_OF_DAY.test(row.startTime.trim())) {
      errors[`${prefix}.startTime`] = 'Usá un horario de 24 h (HH:mm).';
    }
    if (row.endTime.trim().length > 0 && !TIME_OF_DAY.test(row.endTime.trim())) {
      errors[`${prefix}.endTime`] = 'Usá un horario de 24 h (HH:mm) o dejalo vacío.';
    }
  });

  form.socials.forEach((row, index) => {
    const prefix = `socials[${index}]`;
    requireText(errors, `${prefix}.platform`, row.platform, 'Ingresá la plataforma.');
    requireText(errors, `${prefix}.label`, row.label, 'Ingresá la etiqueta del enlace.');
    requireUrl(errors, `${prefix}.url`, row.url);
  });

  requireText(errors, 'giving.title', form.giving.title, 'Ingresá el título de la sección.');
  requireText(errors, 'giving.message', form.giving.message, 'Ingresá el mensaje de ofrendas.');
  requireText(errors, 'giving.ctaLabel', form.giving.ctaLabel, 'Ingresá el texto del botón.');
  requireUrl(errors, 'giving.url', form.giving.url);

  return errors;
}

/**
 * Build the PATCH body from the editable form. `church`/`giving` accept
 * `null` to clear a value; `schedule`/`socials` are whole-collection
 * replacements, so every row is included.
 */
export function buildSettingsPatch(form: SettingsForm): UpdateSettingsInput {
  return {
    church: {
      name: form.church.name.trim(),
      shortDescription: form.church.shortDescription.trim(),
      address: nullableText(form.church.address),
      city: nullableText(form.church.city),
      state: nullableText(form.church.state),
      phone: nullableText(form.church.phone),
      email: nullableText(form.church.email),
      whatsapp: nullableText(form.church.whatsapp),
    },
    schedule: form.schedule.map((row) => ({
      name: row.name.trim(),
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime.trim(),
      endTime: nullableText(row.endTime),
      active: row.active,
    })),
    socials: form.socials.map((row) => ({
      platform: row.platform.trim(),
      label: row.label.trim(),
      url: nullableText(row.url),
    })),
    giving: {
      title: form.giving.title.trim(),
      message: form.giving.message.trim(),
      ctaLabel: form.giving.ctaLabel.trim(),
      url: nullableText(form.giving.url),
    },
  };
}

// ---------------------------------------------------------------------------
// Site SEO: form model
// ---------------------------------------------------------------------------

export const SITE_SEO_MAX_TITLE = 200;
export const SITE_SEO_MAX_DESCRIPTION = 500;

export interface SiteSeoForm {
  title: string;
  description: string;
  defaultOgImage: string;
  robotsDefault: boolean;
}

export function siteSeoToForm(dto: SiteSeoDto): SiteSeoForm {
  return {
    title: dto.title,
    description: dto.description,
    defaultOgImage: dto.defaultOgImage ?? '',
    robotsDefault: dto.robotsDefault,
  };
}

export interface SiteSeoFormErrors {
  title?: string;
  description?: string;
  defaultOgImage?: string;
}

export function validateSiteSeoForm(
  form: SiteSeoForm,
): SiteSeoFormErrors {
  const errors: SiteSeoFormErrors = {};
  const title = form.title.trim();
  if (title.length === 0) {
    errors.title = 'Ingresá el título predeterminado del sitio.';
  } else if (title.length > SITE_SEO_MAX_TITLE) {
    errors.title = `El título debe tener como máximo ${SITE_SEO_MAX_TITLE} caracteres.`;
  }
  const description = form.description.trim();
  if (description.length === 0) {
    errors.description = 'Ingresá la descripción predeterminada.';
  } else if (description.length > SITE_SEO_MAX_DESCRIPTION) {
    errors.description = `La descripción debe tener como máximo ${SITE_SEO_MAX_DESCRIPTION} caracteres.`;
  }
  const image = form.defaultOgImage.trim();
  if (image.length > 0 && !isHttpUrl(image)) {
    errors.defaultOgImage = 'Ingresá una URL http(s) válida o dejá el campo vacío.';
  }
  return errors;
}

export function buildSiteSeoPatch(form: SiteSeoForm): UpdateSiteSeoInput {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    defaultOgImage: nullableText(form.defaultOgImage),
    robotsDefault: form.robotsDefault,
  };
}
