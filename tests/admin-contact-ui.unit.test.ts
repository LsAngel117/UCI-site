/**
 * Pure probes for the Phase 11B contact-inbox UI (docs/08 §19, docs/09 §110,
 * docs/11 §9).
 *
 * These exercise permission projection, filter serialization, status
 * transitions, message previews and the permission-aware navigation without a
 * DOM or a database. The API remains the authority for authorization and for
 * every state change; the helpers only keep the panel predictable.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import {
  buildContactSubmissionListQuery,
  contactDateRangeError,
  contactFiltersActive,
  contactMessagePreview,
  contactPagePermissions,
  contactStatusAction,
  contactStatusLabel,
  CONTACT_PREVIEW_MAX_LENGTH,
  emptyContactFilters,
} from '../src/admin/src/lib/admin-ui';
import {
  breadcrumbsFor,
  moduleLinks,
  visibleNav,
} from '../src/admin/src/lib/navigation';

function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

describe('contact inbox permissions', () => {
  test('read and manage are projected independently', () => {
    assert.deepEqual(contactPagePermissions(granted()), {
      read: false,
      manage: false,
    });
    assert.deepEqual(contactPagePermissions(granted('contact.read')), {
      read: true,
      manage: false,
    });
    assert.deepEqual(
      contactPagePermissions(granted('contact.read', 'contact.manage')),
      { read: true, manage: true },
    );
    assert.deepEqual(contactPagePermissions(granted('contact.manage')), {
      read: false,
      manage: true,
    });
  });
});

describe('contact inbox filters', () => {
  test('empty filters are inactive and serialize only pagination', () => {
    const filters = emptyContactFilters();
    assert.equal(contactFiltersActive(filters), false);
    assert.deepEqual(buildContactSubmissionListQuery(filters, 1, 20), {
      page: 1,
      limit: 20,
    });
  });

  test('each filter activates the filter bar', () => {
    assert.equal(
      contactFiltersActive({ ...emptyContactFilters(), search: 'ana' }),
      true,
    );
    assert.equal(
      contactFiltersActive({ ...emptyContactFilters(), status: 'NEW' }),
      true,
    );
    assert.equal(
      contactFiltersActive({ ...emptyContactFilters(), from: '2026-01-01' }),
      true,
    );
    assert.equal(
      contactFiltersActive({ ...emptyContactFilters(), to: '2026-01-31' }),
      true,
    );
  });

  test('text and status are trimmed and date-only inputs use inclusive bounds', () => {
    const query = buildContactSubmissionListQuery(
      {
        search: '  juan@example.com ',
        status: 'HANDLED',
        from: '2026-01-01',
        to: '2026-01-31',
      },
      2,
      50,
    );
    assert.equal(query.page, 2);
    assert.equal(query.limit, 50);
    assert.equal(query.search, 'juan@example.com');
    assert.equal(query.status, 'HANDLED');
    assert.equal(query.from, '2026-01-01T00:00:00.000Z');
    assert.equal(query.to, '2026-01-31T23:59:59.999Z');
  });

  test('invalid or inverted ranges are rejected before a request is sent', () => {
    assert.ok(contactDateRangeError('2026-13-01', ''));
    assert.ok(contactDateRangeError('', 'not-a-date'));
    assert.ok(contactDateRangeError('2026-02-01', '2026-01-01'));
    assert.equal(contactDateRangeError('2026-01-01', '2026-01-31'), null);
    assert.equal(contactDateRangeError('', '2026-01-31'), null);
  });
});

describe('contact inbox status transitions', () => {
  test('labels are always present and never rely on color', () => {
    assert.equal(contactStatusLabel('NEW'), 'Nueva');
    assert.equal(contactStatusLabel('HANDLED'), 'Gestionada');
  });

  test('a new message can be handled directly and a handled one reopens with confirmation', () => {
    assert.deepEqual(contactStatusAction('NEW'), {
      next: 'HANDLED',
      label: 'Marcar gestionada',
      confirm: false,
    });
    assert.deepEqual(contactStatusAction('HANDLED'), {
      next: 'NEW',
      label: 'Reabrir',
      confirm: true,
    });
  });
});

describe('contact message preview', () => {
  test('collapses whitespace so multi-line messages keep one row', () => {
    assert.equal(
      contactMessagePreview('  Hola,\n\n quisiera   conocer los horarios.  '),
      'Hola, quisiera conocer los horarios.',
    );
  });

  test('truncates long messages with an ellipsis and keeps short ones intact', () => {
    const long = 'a'.repeat(CONTACT_PREVIEW_MAX_LENGTH + 40);
    const preview = contactMessagePreview(long);
    assert.equal(preview.length, CONTACT_PREVIEW_MAX_LENGTH + 1);
    assert.ok(preview.endsWith('…'));
    assert.equal(contactMessagePreview('Mensaje breve'), 'Mensaje breve');
  });
});

describe('contact navigation', () => {
  test('the inbox lives under Administración and needs contact.read', () => {
    const contact = moduleLinks().find(
      ({ item }) => item.to === '/administracion/contacto',
    );
    assert.ok(contact, 'expected the contact module link');
    assert.equal(contact.parentLabel, 'Administración');
    assert.deepEqual(contact.item.permissions, ['contact.read']);
    assert.equal(contact.item.implemented, true);
  });

  test('a role with only contact.read sees the section and the inbox', () => {
    const nav = visibleNav(granted('contact.read'));
    const admin = nav.find((item) => item.to === '/administracion');
    assert.ok(admin, 'expected the Administración section');
    assert.deepEqual(
      admin.children?.map((child) => child.to),
      ['/administracion/contacto'],
    );
  });

  test('breadcrumbs trail the section and end on the inbox', () => {
    assert.deepEqual(breadcrumbsFor('/administracion/contacto'), [
      { label: 'Panel', to: '/' },
      { label: 'Administración', to: '/administracion' },
      { label: 'Contacto' },
    ]);
  });
});
