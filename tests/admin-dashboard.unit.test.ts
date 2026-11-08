/**
 * Pure probes for the dashboard composition rules (docs/visual/01 §8).
 *
 * The screen itself is exercised in the browser smoke check; these tests pin
 * the permission-aware shortcuts, the honest draft aggregation, the scheduled
 * queue order and the audit copy/links without needing a DOM.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import type { HasPermission } from '../src/admin/src/lib/navigation';
import {
  auditActionText,
  auditEntryHref,
  describeAuditAction,
  initials,
  mergeScheduled,
  summarizeDrafts,
  visibleQuickActions,
  type ScheduledEntry,
} from '../src/admin/src/lib/dashboard';

function granted(...permissions: PermissionName[]): HasPermission {
  const set = new Set<PermissionName>(permissions);
  return (permission) => set.has(permission);
}

function scheduled(
  id: string,
  publishAt: string | null,
  createdAt = '2026-01-01T00:00:00.000Z',
): ScheduledEntry {
  return {
    id,
    title: `Contenido ${id}`,
    kind: 'sermon',
    kindLabel: 'Sermón',
    publishAt,
    createdAt,
    href: null,
  };
}

describe('dashboard quick actions', () => {
  test('keeps the documented order and hides actions without permission', () => {
    const actions = visibleQuickActions(granted('sermons.create', 'media.upload'));

    assert.deepEqual(
      actions.map((action) => action.key),
      ['sermon', 'media'],
    );
    assert.equal(actions[0]?.to, '/contenido/sermones/nuevo');
    assert.equal(actions[1]?.to, '/media/biblioteca');
  });

  test('an editor with no create permissions sees no shortcuts', () => {
    assert.deepEqual(visibleQuickActions(granted('sermons.read')), []);
  });
});

describe('dashboard draft summary', () => {
  test('sums the available modules and reports the full set', () => {
    const summary = summarizeDrafts([
      { label: 'Sermones', total: 3 },
      { label: 'Páginas', total: 2 },
      { label: 'Historias', total: 0 },
    ]);

    assert.equal(summary.total, 5);
    assert.deepEqual(summary.labels, ['Sermones', 'Páginas', 'Historias']);
    assert.equal(summary.complete, true);
  });

  test('a failed module is excluded and marks the total as partial', () => {
    const summary = summarizeDrafts([
      { label: 'Sermones', total: 3 },
      { label: 'Páginas', total: null },
    ]);

    assert.equal(summary.total, 3);
    assert.deepEqual(summary.labels, ['Sermones']);
    assert.equal(summary.complete, false);
  });

  test('when every module fails the dashboard has no number to show', () => {
    const summary = summarizeDrafts([
      { label: 'Sermones', total: null },
      { label: 'Páginas', total: null },
    ]);

    assert.equal(summary.total, null);
    assert.equal(summary.complete, false);
  });
});

describe('dashboard scheduled queue', () => {
  test('orders by publication instant and keeps undated items last', () => {
    const merged = mergeScheduled([
      [scheduled('late', '2026-05-01T12:00:00.000Z')],
      [scheduled('undated', null)],
      [scheduled('soon', '2026-02-01T12:00:00.000Z')],
    ]);

    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['soon', 'late', 'undated'],
    );
  });

  test('breaks ties with creation time and honours the limit', () => {
    const merged = mergeScheduled(
      [
        [
          scheduled('b', '2026-02-01T12:00:00.000Z', '2026-01-02T00:00:00.000Z'),
          scheduled('a', '2026-02-01T12:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ],
        [scheduled('c', '2026-03-01T12:00:00.000Z')],
      ],
      2,
    );

    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['a', 'b'],
    );
  });
});

describe('audit activity copy and links', () => {
  test('translates known editorial actions into readable copy', () => {
    assert.equal(auditActionText('sermon.publish'), 'publicó un sermón');
    assert.equal(auditActionText('page.updated'), 'actualizó una página');
    assert.equal(auditActionText('media.upload'), 'subió un archivo multimedia');
    assert.equal(auditActionText('auth.login'), 'inició sesión');
  });

  test('unknown actions never pretend to be a known verb', () => {
    assert.deepEqual(describeAuditAction('widget.exploded'), {
      verb: 'realizó exploded',
      entity: null,
    });
  });

  test('sermon links require read and prefer the editor when update exists', () => {
    const entry = {
      action: 'sermon.updated',
      entityType: 'SERMON',
      entityId: 'abc',
    };

    assert.equal(auditEntryHref(entry, granted('sermons.read', 'sermons.update')), '/contenido/sermones/abc');
    assert.equal(auditEntryHref(entry, granted('sermons.read')), '/contenido/sermones/abc/preview');
    assert.equal(auditEntryHref(entry, granted()), null);
  });

  test('modules without a screen are not rendered as misleading links', () => {
    assert.equal(
      auditEntryHref(
        { action: 'page.updated', entityType: 'PAGE', entityId: 'p1' },
        granted('pages.read', 'pages.update'),
      ),
      null,
    );
  });

  test('media, users and navigation point at their real screens', () => {
    assert.equal(
      auditEntryHref(
        { action: 'media.upload', entityType: 'MEDIA', entityId: 'm1' },
        granted('media.read'),
      ),
      '/media/biblioteca',
    );
    assert.equal(
      auditEntryHref(
        { action: 'user.update', entityType: 'USER', entityId: 'u1' },
        granted('users.read'),
      ),
      '/administracion/usuarios',
    );
    assert.equal(
      auditEntryHref(
        { action: 'navigation.updated', entityType: 'NAVIGATION', entityId: null },
        granted('navigation.read'),
      ),
      '/sitio/navegacion',
    );
  });
});

describe('dashboard avatar initials', () => {
  test('uses the first and last name, or a fallback letter', () => {
    assert.equal(initials('Ana María López'), 'AL');
    assert.equal(initials('Juan'), 'JU');
    assert.equal(initials(''), 'U');
    assert.equal(initials(null), 'U');
  });
});
