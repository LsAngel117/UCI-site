/**
 * Permission-aware navigation model (docs/09 §10, §7).
 *
 * This is the single source of truth for the authenticated shell: the sidebar,
 * the dashboard quick links, the breadcrumbs and the placeholder routes all
 * derive from it. Visibility is a UX filter only — the API remains the
 * authority on authorization (docs/09 §7).
 */
import type { PermissionName } from '@shared/api';

/** Sub-phase that will deliver a module still showing the honest placeholder. */
export type ModulePhase = '10B' | '10C' | '10D' | '11B';

export interface NavItem {
  /** Panel-relative path, e.g. `/contenido/sermones`. */
  to: string;
  label: string;
  /**
   * Any-of permission set. Empty means the item is always visible.
   * A user needs at least one of these permissions to see the item.
   */
  permissions: readonly PermissionName[];
  /** Short, honest description used by the placeholder and dashboard. */
  description?: string;
  /** Sub-phase that delivered the module (kept for traceability). */
  phase?: ModulePhase;
  /** True once the module has a real screen behind the link. */
  implemented?: boolean;
  children?: readonly NavItem[];
}

/**
 * Section map. Paths mirror docs/09 §10; every module still pending names the
 * sub-phase that will implement it so the UI never pretends to be complete.
 */
export const NAV: readonly NavItem[] = [
  {
    to: '/',
    label: 'Panel',
    permissions: [],
  },
  {
    to: '/contenido',
    label: 'Contenido',
    permissions: ['sermons.read', 'pages.read', 'events.read', 'ministries.read'],
    description:
      'Sermones, páginas, eventos y ministerios del sitio público.',
    phase: '10B',
    children: [
      {
        to: '/contenido/sermones',
        label: 'Sermones',
        permissions: ['sermons.read'],
        description: 'Archivo de sermones: borradores, publicación y revisiones.',
        phase: '10B',
        implemented: true,
      },
      {
        to: '/contenido/paginas',
        label: 'Páginas',
        permissions: ['pages.read'],
        description: 'Páginas institucionales y su estado editorial.',
        phase: '10B',
      },
      {
        to: '/contenido/historias',
        label: 'Historias',
        permissions: ['pages.read'],
        description:
          'Testimonios de la comunidad: aprobación editorial, publicación y destacados.',
        phase: '10B',
        implemented: true,
      },
      {
        to: '/contenido/eventos',
        label: 'Eventos',
        permissions: ['events.read'],
        description: 'Agenda de eventos y categorías.',
        phase: '10B',
      },
      {
        to: '/contenido/ministerios',
        label: 'Ministerios',
        permissions: ['ministries.read'],
        description: 'Ministerios publicados y su contenido.',
        phase: '10B',
      },
    ],
  },
  {
    to: '/media',
    label: 'Multimedia',
    permissions: ['media.read'],
    description: 'Biblioteca de imágenes y archivos del sitio.',
    phase: '10C',
    implemented: true,
    children: [
      {
        to: '/media/biblioteca',
        label: 'Biblioteca multimedia',
        permissions: ['media.read'],
        description: 'Búsqueda, carga, metadata y referencias de archivos.',
        phase: '10C',
        implemented: true,
      },
    ],
  },
  {
    to: '/sitio',
    label: 'Sitio',
    permissions: ['navigation.read', 'seo.read'],
    description: 'Estructura del sitio, navegación pública y SEO.',
    phase: '10D',
    implemented: true,
    children: [
      {
        to: '/sitio/navegacion',
        label: 'Navegación',
        permissions: ['navigation.read'],
        description: 'Menús del sitio público, orden y jerarquía de enlaces.',
        phase: '10D',
        implemented: true,
      },
      {
        to: '/sitio/seo',
        label: 'SEO',
        permissions: ['seo.read'],
        description: 'Metadatos, títulos y descripciones para buscadores.',
        phase: '10D',
        implemented: true,
      },
    ],
  },
  {
    to: '/administracion',
    label: 'Administración',
    permissions: [
      'users.read',
      'roles.read',
      'settings.read',
      'audit.read',
      'contact.read',
    ],
    description:
      'Usuarios, roles, configuración del sitio, auditoría y mensajes de contacto.',
    phase: '10D',
    implemented: true,
    children: [
      {
        to: '/administracion/usuarios',
        label: 'Usuarios',
        permissions: ['users.read'],
        description: 'Cuentas del panel, roles y acceso.',
        phase: '10D',
        implemented: true,
      },
      {
        to: '/administracion/roles',
        label: 'Roles y permisos',
        permissions: ['roles.read'],
        description: 'Roles del panel y su matriz de permisos.',
        phase: '10D',
        implemented: true,
      },
      {
        to: '/administracion/configuracion',
        label: 'Configuración',
        permissions: ['settings.read'],
        description: 'Perfil de la iglesia, horarios y enlaces sociales.',
        phase: '10D',
        implemented: true,
      },
      {
        to: '/administracion/auditoria',
        label: 'Auditoría',
        permissions: ['audit.read'],
        description: 'Registro de cambios realizados en el panel.',
        phase: '10D',
        implemented: true,
      },
      {
        to: '/administracion/contacto',
        label: 'Contacto',
        permissions: ['contact.read'],
        description:
          'Mensajes enviados desde el formulario público y su estado de gestión.',
        phase: '11B',
        implemented: true,
      },
    ],
  },
];

export type HasPermission = (permission: PermissionName) => boolean;

/** True when the user holds at least one of the item's required permissions. */
export function canSee(item: NavItem, hasPermission: HasPermission): boolean {
  if (item.permissions.length === 0) return true;
  return item.permissions.some((permission) => hasPermission(permission));
}

/**
 * Filter the navigation for the current user. A group whose children are all
 * hidden is hidden too, so the sidebar never renders an empty section.
 */
export function visibleNav(hasPermission: HasPermission): NavItem[] {
  const result: NavItem[] = [];
  for (const item of NAV) {
    if (!canSee(item, hasPermission)) continue;

    if (item.children && item.children.length > 0) {
      const children = item.children.filter((child) =>
        canSee(child, hasPermission),
      );
      if (children.length === 0) continue;
      result.push({ ...item, children });
    } else {
      result.push(item);
    }
  }
  return result;
}

export interface ModuleLink {
  item: NavItem;
  /** Parent section label when the item is a child; `null` for top level. */
  parentLabel: string | null;
}

/**
 * Flat list of every navigable module except the dashboard. Used to build the
 * placeholder routes and the dashboard access grid from one definition.
 */
export function moduleLinks(): ModuleLink[] {
  const links: ModuleLink[] = [];
  for (const item of NAV) {
    if (item.to !== '/') {
      links.push({ item: { ...item, children: undefined }, parentLabel: null });
    }
    for (const child of item.children ?? []) {
      links.push({ item: { ...child, children: undefined }, parentLabel: item.label });
    }
  }
  return links;
}

export interface Breadcrumb {
  label: string;
  /** Present for ancestors; the current location omits it. */
  to?: string;
}

function matchesPath(target: string, pathname: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

/**
 * Breadcrumb trail for a panel path. Ancestors are links; the final crumb is
 * plain text (docs/09 §11).
 */
export function breadcrumbsFor(pathname: string): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'Panel', to: '/' }];
  if (pathname === '/') return crumbs;

  for (const section of NAV) {
    if (section.to === '/') continue;
    if (!matchesPath(section.to, pathname)) continue;

    const child = section.children?.find((entry) =>
      matchesPath(entry.to, pathname),
    );

    if (child && child.to === pathname) {
      crumbs.push({ label: section.label, to: section.to });
      crumbs.push({ label: child.label });
    } else if (child) {
      crumbs.push({ label: section.label, to: section.to });
      crumbs.push({ label: child.label, to: child.to });
    } else {
      crumbs.push({ label: section.label });
    }
    return crumbs;
  }

  return crumbs;
}
