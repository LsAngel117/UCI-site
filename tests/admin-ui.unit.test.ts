/**
 * Pure probes for the Phase 10D2 administration UI helpers (docs/08 §8–§9,
 * §14, §17–§18, §21; docs/09 §16–§21; docs/11 §9).
 *
 * These exercise the permission projection, list-filter serialization, form
 * validation, role-matrix grouping, safeguard detection and navigation tree /
 * reorder math without a DOM or a database. The API remains the authority for
 * authorization and for every write; these helpers only keep the panel honest
 * and predictable before a request is sent.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AdminUserDto, PermissionDto } from '@shared/admin';
import type { NavigationAdminDto } from '@shared/cms';
import type { AdminSettingsDto } from '@shared/settings';
import type { SiteSeoDto } from '@shared/seo';
import type { PermissionName } from '@shared/api';
import { ApiError } from '../src/admin/src/lib/api';
import {
  adminCriticalMessage,
  adminRoleMissingCritical,
  adminSafeguardReason,
  adminSettingsToForm,
  adminUserPermissions,
  auditDateRangeError,
  auditPagePermissions,
  buildAuditListQuery,
  buildSettingsPatch,
  buildSiteSeoPatch,
  buildUserListQuery,
  dayOfWeekLabel,
  describeAdminMutationError,
  emptyAuditFilters,
  emptyNavigationForm,
  emptySettingsForm,
  emptyUserCreateForm,
  emptyUserFilters,
  groupNavigation,
  groupPermissions,
  navigationPagePermissions,
  navigationTargetLabel,
  navigationToForm,
  nextNavigationOrder,
  parentCandidates,
  reorderPayload,
  rolePagePermissions,
  seoPagePermissions,
  settingsPagePermissions,
  siteSeoToForm,
  togglePermission,
  userFiltersActive,
  userToEditForm,
  validateNavigationForm,
  validateSettingsForm,
  validateSiteSeoForm,
  validateUserCreateForm,
  validateUserEditForm,
  SAFEGUARD_MESSAGES,
} from '../src/admin/src/lib/admin-ui';

function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

function userFixture(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    id: 'user-1',
    email: 'ana@uci.local',
    name: 'Ana Pérez',
    firstName: 'Ana',
    lastName: 'Pérez',
    active: true,
    roles: [{ id: 'role-1', name: 'EDITOR', description: null }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function navigationFixture(
  overrides: Partial<NavigationAdminDto> = {},
): NavigationAdminDto {
  return {
    id: 'nav-1',
    label: 'Inicio',
    href: '/',
    external: false,
    location: 'HEADER',
    target: null,
    order: 0,
    visible: true,
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function permissionFixture(name: PermissionName): PermissionDto {
  return { name, description: null };
}

describe('permission projection', () => {
  test('users page actions follow the canonical users.* permissions', () => {
    assert.deepEqual(adminUserPermissions(granted('users.read')), {
      read: true,
      create: false,
      update: false,
      disable: false,
    });
    assert.deepEqual(
      adminUserPermissions(
        granted('users.read', 'users.create', 'users.update', 'users.disable'),
      ),
      { read: true, create: true, update: true, disable: true },
    );
  });

  test('each administrative page projects only its own permissions', () => {
    assert.deepEqual(rolePagePermissions(granted('roles.read')), {
      read: true,
      update: false,
    });
    assert.deepEqual(settingsPagePermissions(granted('settings.update')), {
      read: false,
      update: true,
    });
    assert.deepEqual(navigationPagePermissions(granted('navigation.read')), {
      read: true,
      update: false,
    });
    assert.deepEqual(seoPagePermissions(granted('seo.read')), {
      read: true,
      update: false,
    });
    assert.deepEqual(auditPagePermissions(granted()), { read: false });
  });
});

describe('user list filters', () => {
  test('empty filters are inactive and serialize only pagination', () => {
    const filters = emptyUserFilters();
    assert.equal(userFiltersActive(filters), false);
    assert.deepEqual(buildUserListQuery(filters, 1, 20), {
      page: 1,
      limit: 20,
    });
  });

  test('filters are trimmed and active is a real boolean', () => {
    const filters = {
      search: '  ana ',
      role: ' EDITOR ',
      active: 'true' as const,
    };
    assert.equal(userFiltersActive(filters), true);
    assert.deepEqual(buildUserListQuery(filters, 2, 10), {
      page: 2,
      limit: 10,
      search: 'ana',
      role: 'EDITOR',
      active: true,
    });
    assert.equal(
      buildUserListQuery({ ...filters, active: 'false' }, 1, 20).active,
      false,
    );
  });
});

describe('audit filters', () => {
  test('empty filters are inactive and omit every optional key', () => {
    const filters = emptyAuditFilters();
    assert.equal(auditDateRangeError(filters.from, filters.to), null);
    assert.deepEqual(buildAuditListQuery(filters, 1, 20), {
      page: 1,
      limit: 20,
    });
  });

  test('date inputs expand to inclusive UTC bounds and texts are trimmed', () => {
    const query = buildAuditListQuery(
      {
        actor: ' actor-1 ',
        action: 'user.update',
        entityType: '',
        entityId: 'user-9',
        from: '2026-01-01',
        to: '2026-01-31',
      },
      2,
      50,
    );
    assert.equal(query.page, 2);
    assert.equal(query.limit, 50);
    assert.equal(query.actor, 'actor-1');
    assert.equal(query.action, 'user.update');
    assert.equal(query.entityType, undefined);
    assert.equal(query.entityId, 'user-9');
    assert.equal(query.from, '2026-01-01T00:00:00.000Z');
    assert.equal(query.to, '2026-01-31T23:59:59.999Z');
  });

  test('an inverted range is rejected before a request is sent', () => {
    assert.ok(auditDateRangeError('2026-02-01', '2026-01-01'));
    assert.equal(auditDateRangeError('2026-01-01', '2026-01-31'), null);
    assert.equal(auditDateRangeError('', '2026-01-31'), null);
  });
});

describe('user forms', () => {
  test('create form rejects missing/invalid fields and keeps roles', () => {
    const form = {
      ...emptyUserCreateForm(),
      email: 'not-an-email',
      name: '   ',
      password: 'short',
      roles: ['EDITOR'],
    };
    const errors = validateUserCreateForm(form);
    assert.ok(errors.email);
    assert.ok(errors.name);
    assert.ok(errors.password);

    assert.deepEqual(
      validateUserCreateForm({
        email: 'ana@uci.local',
        name: 'Ana',
        password: 'long-enough-password',
        roles: ['EDITOR'],
      }),
      {},
    );
  });

  test('edit form projects the mutable fields only', () => {
    const form = userToEditForm(userFixture({ active: false }));
    assert.deepEqual(form, {
      name: 'Ana Pérez',
      active: false,
      roles: ['EDITOR'],
    });
    assert.ok(validateUserEditForm({ ...form, name: '  ' }).name);
    assert.deepEqual(validateUserEditForm(form), {});
  });
});

describe('role matrix', () => {
  test('permissions are grouped by domain in first-seen order', () => {
    const groups = groupPermissions([
      permissionFixture('users.read'),
      permissionFixture('pages.read'),
      permissionFixture('users.create'),
      permissionFixture('audit.read'),
    ]);
    assert.deepEqual(
      groups.map((group) => group.key),
      ['users', 'pages', 'audit'],
    );
    assert.equal(groups[0]?.label, 'Usuarios');
    assert.deepEqual(
      groups[0]?.permissions.map((permission) => permission.name),
      ['users.read', 'users.create'],
    );
  });

  test('toggling adds or removes one permission without duplicates', () => {
    const selected = togglePermission([], 'roles.read');
    assert.deepEqual(selected, ['roles.read']);
    assert.deepEqual(togglePermission(selected, 'users.read'), [
      'roles.read',
      'users.read',
    ]);
    assert.deepEqual(togglePermission(selected, 'roles.read'), []);
  });

  test('the ADMIN role warns when roles.update would be removed', () => {
    assert.equal(
      adminRoleMissingCritical('ADMIN', ['roles.read']),
      true,
    );
    assert.equal(
      adminRoleMissingCritical('ADMIN', ['roles.read', 'roles.update']),
      false,
    );
    assert.equal(adminRoleMissingCritical('EDITOR', ['roles.read']), false);
    assert.match(adminCriticalMessage(), /roles\.update/);
  });
});

describe('safeguard errors', () => {
  test('detects the documented 409 reasons from error details', () => {
    assert.equal(
      adminSafeguardReason(
        new ApiError(409, 'CONFLICT', 'blocked', {
          reason: 'LAST_ACTIVE_ADMIN',
        }),
      ),
      'LAST_ACTIVE_ADMIN',
    );
    assert.equal(
      adminSafeguardReason(
        new ApiError(409, 'CONFLICT', 'blocked', {
          reason: 'ADMIN_CRITICAL_PERMISSION',
        }),
      ),
      'ADMIN_CRITICAL_PERMISSION',
    );
    assert.equal(
      adminSafeguardReason(new ApiError(400, 'VALIDATION_ERROR', 'bad')),
      null,
    );
  });

  test('falls back to the server message when details are absent', () => {
    assert.equal(
      adminSafeguardReason(
        new ApiError(
          409,
          'CONFLICT',
          'Cannot disable or demote the last active administrator.',
        ),
      ),
      'LAST_ACTIVE_ADMIN',
    );
    assert.equal(
      adminSafeguardReason(
        new ApiError(
          409,
          'CONFLICT',
          'The ADMIN role must keep the "roles.update" permission.',
        ),
      ),
      'ADMIN_CRITICAL_PERMISSION',
    );
  });

  test('renders the honest safeguard copy instead of the raw server text', () => {
    const message = describeAdminMutationError(
      new ApiError(409, 'CONFLICT', 'blocked', {
        reason: 'LAST_ACTIVE_ADMIN',
      }),
    );
    assert.equal(message, SAFEGUARD_MESSAGES.LAST_ACTIVE_ADMIN);
    assert.match(message, /último administrador activo/);
  });
});

describe('navigation model', () => {
  const rows = [
    navigationFixture({ id: 'root-a', label: 'Inicio', order: 0 }),
    navigationFixture({ id: 'root-b', label: 'Nosotros', order: 1 }),
    navigationFixture({
      id: 'child-a1',
      label: 'Historia',
      order: 0,
      parentId: 'root-a',
    }),
    navigationFixture({
      id: 'footer-a',
      label: 'Contacto',
      location: 'FOOTER',
      order: 0,
    }),
  ];

  test('groups by location and nests children under their parent', () => {
    const groups = groupNavigation(rows);
    assert.deepEqual(
      groups.map((group) => group.location),
      ['HEADER', 'FOOTER'],
    );
    assert.deepEqual(
      groups[0]?.nodes.map((node) => node.item.id),
      ['root-a', 'root-b'],
    );
    assert.deepEqual(
      groups[0]?.nodes[0]?.children.map((node) => node.item.id),
      ['child-a1'],
    );
    assert.equal(groups[0]?.nodes[0]?.children[0]?.depth, 1);
  });

  test('an orphan child becomes a root instead of disappearing', () => {
    const groups = groupNavigation([
      navigationFixture({ id: 'orphan', parentId: 'missing' }),
    ]);
    assert.deepEqual(
      groups[0]?.nodes.map((node) => node.item.id),
      ['orphan'],
    );
  });

  test('parent candidates exclude the item and its descendants', () => {
    const candidates = parentCandidates(rows, 'HEADER', 'root-a');
    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ['root-b'],
    );
  });

  test('reorder swaps positions inside the sibling group only', () => {
    const payload = reorderPayload(rows, 'root-b', 'up');
    assert.deepEqual(payload, [
      { id: 'root-b', position: 0 },
      { id: 'root-a', position: 1 },
    ]);
    assert.equal(reorderPayload(rows, 'root-a', 'up'), null);
    assert.equal(reorderPayload(rows, 'root-b', 'down'), null);
  });

  test('next order follows the sibling group maximum', () => {
    assert.equal(nextNavigationOrder(rows, 'HEADER', null), 2);
    assert.equal(nextNavigationOrder(rows, 'HEADER', 'root-a'), 1);
    assert.equal(nextNavigationOrder(rows, 'FOOTER', null), 1);
  });

  test('form conversion round-trips the persisted shape', () => {
    const form = navigationToForm(
      navigationFixture({
        external: true,
        href: 'https://example.org',
        target: '_blank',
      }),
    );
    assert.deepEqual(form, {
      label: 'Inicio',
      href: 'https://example.org',
      external: true,
      location: 'HEADER',
      target: '_blank',
      visible: true,
      parentId: '',
      order: 0,
    });
    assert.equal(navigationTargetLabel(null), 'Predeterminado');
    assert.equal(navigationTargetLabel('_blank'), 'Nueva pestaña');
  });

  test('navigation validation mirrors the server rules', () => {
    const base = emptyNavigationForm('HEADER');
    assert.ok(validateNavigationForm({ ...base, label: ' ' }).label);
    assert.ok(validateNavigationForm({ ...base, href: ' ' }).href);
    assert.ok(
      validateNavigationForm({ ...base, href: 'https://x.org', external: false })
        .href,
    );
    assert.ok(
      validateNavigationForm({ ...base, href: '/inicio', external: true }).href,
    );
    assert.ok(validateNavigationForm({ ...base, label: 'X', href: '/', order: -1 }).order);
    assert.deepEqual(
      validateNavigationForm({ ...base, label: 'X', href: '/', order: 0 }),
      {},
    );
  });
});

describe('settings forms', () => {
  const dto: AdminSettingsDto = {
    church: {
      name: 'Iglesia UCI',
      shortDescription: 'Una iglesia',
      address: null,
      city: null,
      state: null,
      phone: null,
      email: null,
      whatsapp: null,
    },
    schedule: [
      {
        name: 'Culto',
        dayOfWeek: 0,
        startTime: '10:00',
        endTime: '12:00',
        active: true,
      },
    ],
    socials: [{ platform: 'instagram', label: 'Instagram', url: null }],
    giving: {
      title: 'Ofrendas',
      message: 'Gracias',
      ctaLabel: 'Dar',
      url: null,
    },
  };

  test('converts the admin DTO into editable strings and back', () => {
    const form = adminSettingsToForm(dto);
    assert.equal(form.church.address, '');
    assert.equal(form.schedule[0]?.endTime, '12:00');
    assert.equal(form.socials[0]?.url, '');

    const patch = buildSettingsPatch(form);
    assert.equal(patch.church?.address, null);
    assert.equal(patch.schedule?.[0]?.endTime, '12:00');
    assert.equal(patch.socials?.[0]?.url, null);
    assert.equal(patch.giving?.url, null);
  });

  test('empty forms fail honest validation', () => {
    const errors = validateSettingsForm(emptySettingsForm());
    assert.ok(errors['church.name']);
    assert.ok(errors['church.shortDescription']);
    assert.ok(errors['giving.title']);
  });

  test('schedule/social URL and time rules match the server', () => {
    const form = adminSettingsToForm(dto);
    form.church.name = 'Iglesia UCI';
    form.church.shortDescription = 'Una iglesia';
    form.schedule[0]!.startTime = '25:00';
    form.schedule[0]!.endTime = '9:00';
    form.socials[0]!.url = 'not-a-url';
    form.schedule[0]!.name = ' ';
    const errors = validateSettingsForm(form);
    assert.ok(errors['schedule[0].name']);
    assert.ok(errors['schedule[0].startTime']);
    assert.ok(errors['schedule[0].endTime']);
    assert.ok(errors['socials[0].url']);
  });

  test('weekday labels cover the documented range', () => {
    assert.equal(dayOfWeekLabel(0), 'Domingo');
    assert.equal(dayOfWeekLabel(6), 'Sábado');
    assert.equal(dayOfWeekLabel(9), 'Día 9');
  });
});

describe('site SEO form', () => {
  const dto: SiteSeoDto = {
    title: 'Iglesia UCI',
    description: 'Sitio oficial',
    defaultOgImage: null,
    robotsDefault: true,
  };

  test('round-trips the DTO and clears an empty image', () => {
    const form = siteSeoToForm(dto);
    assert.equal(form.defaultOgImage, '');
    assert.deepEqual(buildSiteSeoPatch(form), {
      title: 'Iglesia UCI',
      description: 'Sitio oficial',
      defaultOgImage: null,
      robotsDefault: true,
    });
  });

  test('rejects blank copy, long copy and bad image URLs', () => {
    const errors = validateSiteSeoForm({
      title: ' ',
      description: 'x'.repeat(501),
      defaultOgImage: 'ftp://example.org/og.png',
      robotsDefault: true,
    });
    assert.ok(errors.title);
    assert.ok(errors.description);
    assert.ok(errors.defaultOgImage);
  });
});
