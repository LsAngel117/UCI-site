/**
 * Pure probes for the admin navigation model (docs/09 §10, §11).
 *
 * These tests exercise the permission-aware helpers directly, without a DOM:
 * who sees which section, how a path resolves to breadcrumbs and how the flat
 * module list feeds the placeholder routes. Authorization itself stays on the
 * server (docs/09 §7); this is a UX filter only.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import {
  breadcrumbsFor,
  moduleLinks,
  visibleNav,
  type NavItem,
} from '../src/admin/src/lib/navigation';

/** Build a permission predicate from a fixed grant list. */
function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

function toPaths(items: NavItem[]): string[] {
  return items.map((item) => item.to);
}

function findSection(items: NavItem[], to: string): NavItem | undefined {
  return items.find((item) => item.to === to);
}

describe('visibleNav — permission-aware sections', () => {
  test('a user with only navigation.read sees Sitio > Navegación', () => {
    const nav = visibleNav(granted('navigation.read'));
    const paths = toPaths(nav);

    assert.deepEqual(paths, ['/', '/sitio']);
    const sitio = findSection(nav, '/sitio');
    assert.ok(sitio);
    assert.deepEqual(toPaths([...(sitio.children ?? [])]), ['/sitio/navegacion']);
    assert.equal(sitio.children?.[0]?.label, 'Navegación');
  });

  test('a user with only seo.read sees Sitio > SEO', () => {
    const nav = visibleNav(granted('seo.read'));
    const sitio = findSection(nav, '/sitio');

    assert.deepEqual(toPaths(nav), ['/', '/sitio']);
    assert.ok(sitio);
    assert.deepEqual(toPaths([...(sitio.children ?? [])]), ['/sitio/seo']);
    assert.equal(sitio.children?.[0]?.label, 'SEO');
  });

  test('a user with navigation.read and seo.read sees both Sitio children', () => {
    const nav = visibleNav(granted('navigation.read', 'seo.read'));
    const sitio = findSection(nav, '/sitio');

    assert.deepEqual(toPaths([...(sitio?.children ?? [])]), [
      '/sitio/navegacion',
      '/sitio/seo',
    ]);
  });

  test('a user with only roles.read sees Administración > Roles y permisos', () => {
    const nav = visibleNav(granted('roles.read'));
    const admin = findSection(nav, '/administracion');

    assert.deepEqual(toPaths(nav), ['/', '/administracion']);
    assert.ok(admin);
    assert.deepEqual(toPaths([...(admin.children ?? [])]), [
      '/administracion/roles',
    ]);
    assert.equal(admin.children?.[0]?.label, 'Roles y permisos');
  });

  test('group sections are hidden when every child is hidden', () => {
    // No content permissions, no media, no admin, no siti — only dashboard.
    const nav = visibleNav(granted('sermons.read'));

    assert.deepEqual(toPaths(nav), ['/', '/contenido']);
    const contenido = findSection(nav, '/contenido');
    assert.deepEqual(toPaths([...(contenido?.children ?? [])]), [
      '/contenido/sermones',
    ]);
    assert.equal(findSection(nav, '/sitio'), undefined);
    assert.equal(findSection(nav, '/administracion'), undefined);
  });

  test('an empty grant list resolves to the dashboard only', () => {
    const nav = visibleNav(granted());
    assert.deepEqual(toPaths(nav), ['/']);
  });

  test('administración keeps its existing items next to Roles y permisos', () => {
    const nav = visibleNav(granted('users.read', 'roles.read'));
    const admin = findSection(nav, '/administracion');

    assert.deepEqual(toPaths([...(admin?.children ?? [])]), [
      '/administracion/usuarios',
      '/administracion/roles',
    ]);
  });
});

describe('breadcrumbsFor — trail for the new sections', () => {
  test('Sitio > Navegación links the ancestor and marks the current page', () => {
    assert.deepEqual(breadcrumbsFor('/sitio/navegacion'), [
      { label: 'Panel', to: '/' },
      { label: 'Sitio', to: '/sitio' },
      { label: 'Navegación' },
    ]);
  });

  test('Sitio > SEO resolves the same shape', () => {
    assert.deepEqual(breadcrumbsFor('/sitio/seo'), [
      { label: 'Panel', to: '/' },
      { label: 'Sitio', to: '/sitio' },
      { label: 'SEO' },
    ]);
  });

  test('Administración > Roles y permisos resolves the same shape', () => {
    assert.deepEqual(breadcrumbsFor('/administracion/roles'), [
      { label: 'Panel', to: '/' },
      { label: 'Administración', to: '/administracion' },
      { label: 'Roles y permisos' },
    ]);
  });

  test('the section root is the current crumb', () => {
    assert.deepEqual(breadcrumbsFor('/sitio'), [
      { label: 'Panel', to: '/' },
      { label: 'Sitio' },
    ]);
  });

  test('nested paths below a module stop at the module crumb', () => {
    assert.deepEqual(breadcrumbsFor('/sitio/navegacion/editar'), [
      { label: 'Panel', to: '/' },
      { label: 'Sitio', to: '/sitio' },
      { label: 'Navegación', to: '/sitio/navegacion' },
    ]);
  });

  test('the dashboard is a single crumb and unknown paths fall back', () => {
    assert.deepEqual(breadcrumbsFor('/'), [{ label: 'Panel', to: '/' }]);
    assert.deepEqual(breadcrumbsFor('/desconocido'), [
      { label: 'Panel', to: '/' },
    ]);
  });
});

describe('moduleLinks — placeholder routes and dashboard grid', () => {
  test('includes the new modules with their parent labels', () => {
    const links = moduleLinks();
    const byPath = new Map(links.map((link) => [link.item.to, link]));

    assert.equal(byPath.get('/sitio/navegacion')?.item.label, 'Navegación');
    assert.equal(
      byPath.get('/sitio/navegacion')?.parentLabel,
      'Sitio',
    );
    assert.equal(byPath.get('/sitio/seo')?.item.label, 'SEO');
    assert.equal(byPath.get('/sitio/seo')?.parentLabel, 'Sitio');
    assert.equal(
      byPath.get('/administracion/roles')?.item.label,
      'Roles y permisos',
    );
    assert.equal(
      byPath.get('/administracion/roles')?.parentLabel,
      'Administración',
    );
  });

  test('the Sitio section itself is a module link too', () => {
    const link = moduleLinks().find((entry) => entry.item.to === '/sitio');

    assert.ok(link);
    assert.equal(link.parentLabel, null);
    assert.equal(link.item.children, undefined);
  });

  test('excludes the dashboard and never repeats a path', () => {
    const links = moduleLinks();
    const paths = links.map((link) => link.item.to);

    assert.equal(paths.includes('/'), false);
    assert.equal(new Set(paths).size, paths.length);
  });

  test('every link carries a phase so placeholders stay honest', () => {
    for (const { item } of moduleLinks()) {
      assert.ok(item.phase, `${item.to} is missing a phase`);
      assert.ok(item.description, `${item.to} is missing a description`);
    }
  });
});
