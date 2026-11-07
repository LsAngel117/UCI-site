/**
 * Pure probes for the Phase 10B sermon editor helpers (docs/09 §22–§38).
 *
 * These tests exercise the DTO ↔ form translation, validation, permission and
 * query helpers without a DOM or a database. The API remains the authority for
 * authorization and version conflicts; these are the client-side rules that can
 * be verified in isolation.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import type { SermonAdminDto } from '@shared/cms';
import { ApiError, apiRequest, apiRequestList } from '../src/admin/src/lib/api';
import { buildQuery, pageWindow } from '../src/admin/src/lib/query';
import {
  availableLifecycleActions,
  emptySermonForm,
  formToCreateInput,
  formToUpdateInput,
  formsEqual,
  isFutureDateTime,
  isoFromDateTimeLocal,
  normalizeSlugInput,
  sermonPermissions,
  sermonToForm,
  toDateInputValue,
  toDateTimeLocalValue,
  validateSermonForm,
} from '../src/admin/src/lib/sermons-form';

function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

function fixture(overrides: Partial<SermonAdminDto> = {}): SermonAdminDto {
  return {
    id: 'sermon-1',
    slug: 'obediencia-y-fe',
    title: 'Obediencia y fe',
    description: 'Un mensaje sobre la fe.',
    scriptureReference: 'Juan 14:15',
    scriptureText: 'Si me amáis, guardad mis mandamientos.',
    preacherName: 'Ana Gómez',
    sermonDate: '2026-10-04T00:00:00.000Z',
    preacherId: 'person-1',
    preacher: {
      id: 'person-1',
      firstName: 'Ana',
      lastName: 'Gómez',
      displayName: 'Ana Gómez',
      role: null,
      photoMediaId: null,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    seriesId: 'series-1',
    series: {
      id: 'series-1',
      name: 'Fe',
      slug: 'fe',
      startDate: null,
      endDate: null,
      coverMediaId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    topics: [
      {
        id: 'topic-1',
        name: 'Fe',
        slug: 'fe',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    coverMediaId: 'media-cover',
    notesMediaId: 'media-notes',
    videoProvider: 'YOUTUBE',
    videoExternalId: 'abc123DEF45',
    videoUrl: 'https://www.youtube.com/watch?v=abc123DEF45',
    audioUrl: 'https://cdn.example.org/audio.mp3',
    notesContent: 'Notas del mensaje.',
    durationMinutes: 45,
    featured: true,
    seo: {
      title: 'Obediencia y fe',
      description: 'Un mensaje sobre la fe.',
      canonicalUrl: 'https://uci.example.org/sermones/obediencia-y-fe',
      ogImageUrl: 'https://uci.example.org/og.jpg',
    },
    status: 'draft',
    version: 3,
    publishedAt: null,
    publishAt: null,
    unpublishedAt: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('sermon form — DTO translation', () => {
  test('sermonToForm maps every editable field and slices the calendar date', () => {
    const form = sermonToForm(fixture());

    assert.equal(form.title, 'Obediencia y fe');
    assert.equal(form.sermonDate, '2026-10-04');
    assert.equal(form.durationMinutes, '45');
    assert.equal(form.featured, true);
    assert.deepEqual(form.topicIds, ['topic-1']);
    assert.equal(form.seoCanonicalUrl, 'https://uci.example.org/sermones/obediencia-y-fe');
  });

  test('missing optional values become empty strings, not "null"', () => {
    const form = sermonToForm(
      fixture({
        description: null,
        scriptureReference: null,
        scriptureText: null,
        preacherId: null,
        preacherName: null,
        seriesId: null,
        topics: [],
        sermonDate: null,
        durationMinutes: null,
        coverMediaId: null,
        notesMediaId: null,
        videoProvider: null,
        videoExternalId: null,
        videoUrl: null,
        audioUrl: null,
        notesContent: null,
        seo: null,
      }),
    );

    assert.equal(form.description, '');
    assert.equal(form.sermonDate, '');
    assert.equal(form.durationMinutes, '');
    assert.deepEqual(form.topicIds, []);
    assert.equal(form.seoTitle, '');
  });

  test('formsEqual ignores topic order but detects real edits', () => {
    const base = sermonToForm(fixture());
    const reordered = { ...base, topicIds: [...base.topicIds].reverse() };
    const edited = { ...base, title: 'Otro título' };

    assert.equal(formsEqual(base, reordered), true);
    assert.equal(formsEqual(base, edited), false);
  });
});

describe('sermon form — validation', () => {
  test('a title is required', () => {
    const values = emptySermonForm();
    assert.equal(validateSermonForm(values).title, 'El título es obligatorio.');
  });

  test('a complete valid form has no errors', () => {
    const values = sermonToForm(fixture());
    assert.deepEqual(validateSermonForm(values), {});
  });

  test('invalid duration, date and URL fields are reported', () => {
    const values = {
      ...emptySermonForm(),
      title: 'Válido',
      durationMinutes: '-2',
      sermonDate: '2026-02-31',
      videoUrl: 'ftp://example.org/video',
      seoCanonicalUrl: 'not-a-url',
    };
    const errors = validateSermonForm(values);

    assert.ok(errors.durationMinutes);
    assert.ok(errors.sermonDate);
    assert.ok(errors.videoUrl);
    assert.ok(errors.seoCanonicalUrl);
  });

  test('a slug that normalizes to nothing is rejected', () => {
    const values = { ...emptySermonForm(), title: 'Ok', slug: '---' };
    assert.ok(validateSermonForm(values).slug);
  });
});

describe('sermon form — slugs and payloads', () => {
  test('normalizeSlugInput mirrors the server normalization', () => {
    assert.equal(normalizeSlugInput('  Obediencia y Fe  '), 'obediencia-y-fe');
    assert.equal(normalizeSlugInput('Juan 14:15 — ¡Fe!'), 'juan-14-15-fe');
    assert.equal(normalizeSlugInput('---'), '');
  });

  test('create payload trims text, nulls optional values and omits an empty slug', () => {
    const values = {
      ...emptySermonForm(),
      title: '  Nuevo sermón  ',
      description: '   ',
      durationMinutes: '30',
      topicIds: ['topic-1'],
      seoTitle: 'SEO',
    };
    const input = formToCreateInput(values);

    assert.equal(input.title, 'Nuevo sermón');
    assert.equal(input.description, null);
    assert.equal(input.durationMinutes, 30);
    assert.deepEqual(input.topicIds, ['topic-1']);
    assert.equal('slug' in input, false);
    assert.equal(input.seo?.title, 'SEO');
    assert.equal(input.seo?.description, null);
  });

  test('create payload includes an explicit slug when provided', () => {
    const values = {
      ...emptySermonForm(),
      title: 'Nuevo',
      slug: 'nuevo-sermon',
    };
    assert.equal(formToCreateInput(values).slug, 'nuevo-sermon');
  });

  test('update payload always carries the loaded version', () => {
    const values = sermonToForm(fixture());
    const input = formToUpdateInput(values, 3);

    assert.equal(input.version, 3);
    assert.equal(input.title, 'Obediencia y fe');
    assert.equal(input.slug, 'obediencia-y-fe');
    assert.equal(input.preacherId, 'person-1');
    assert.equal(input.coverMediaId, 'media-cover');
    assert.equal(input.seo?.canonicalUrl, 'https://uci.example.org/sermones/obediencia-y-fe');
  });
});

describe('sermon actions — permissions and lifecycle', () => {
  test('sermonPermissions reads the exact permissions', () => {
    const permissions = sermonPermissions(
      granted('sermons.read', 'sermons.publish'),
    );

    assert.equal(permissions.read, true);
    assert.equal(permissions.publish, true);
    assert.equal(permissions.create, false);
    assert.equal(permissions.update, false);
    assert.equal(permissions.archive, false);
  });

  test('a draft offers publish, schedule and archive to an administrator', () => {
    const permissions = sermonPermissions(
      granted(
        'sermons.read',
        'sermons.update',
        'sermons.publish',
        'sermons.archive',
      ),
    );

    assert.deepEqual(availableLifecycleActions('draft', permissions), [
      'publish',
      'schedule',
      'archive',
    ]);
    assert.deepEqual(availableLifecycleActions('published', permissions), [
      'archive',
    ]);
    assert.deepEqual(availableLifecycleActions('archived', permissions), [
      'publish',
    ]);
  });

  test('an editor without publish/archive permissions sees no lifecycle action', () => {
    const permissions = sermonPermissions(granted('sermons.read', 'sermons.update'));
    assert.deepEqual(availableLifecycleActions('draft', permissions), []);
  });
});

describe('date/time helpers', () => {
  test('toDateInputValue keeps the calendar day from an ISO timestamp', () => {
    assert.equal(toDateInputValue('2026-10-04T00:00:00.000Z'), '2026-10-04');
    assert.equal(toDateInputValue(null), '');
    assert.equal(toDateInputValue('not-a-date'), '');
  });

  test('a datetime-local value round-trips through an ISO instant', () => {
    const local = '2030-10-11T08:00';
    const iso = isoFromDateTimeLocal(local);
    assert.ok(iso);
    assert.equal(toDateTimeLocalValue(iso), local);
  });

  test('isFutureDateTime rejects empty, invalid and past values', () => {
    const now = new Date('2026-10-04T12:00:00.000Z');
    assert.equal(isFutureDateTime('', now), false);
    assert.equal(isFutureDateTime('not-a-date', now), false);
    // Far enough from `now` to stay deterministic in any host timezone.
    assert.equal(isFutureDateTime('2000-01-01T00:00', now), false);
    assert.equal(isFutureDateTime('2999-01-01T00:00', now), true);
  });
});

describe('query helpers', () => {
  test('buildQuery drops empty values and encodes the rest', () => {
    assert.equal(
      buildQuery({
        page: 2,
        limit: 20,
        status: 'draft',
        search: '',
        sort: undefined,
      }),
      '?page=2&limit=20&status=draft',
    );
    assert.equal(buildQuery({ search: 'fe y esperanza' }), '?search=fe+y+esperanza');
    assert.equal(buildQuery({}), '');
  });

  test('pageWindow keeps first/last pages and collapses gaps', () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(1, 5), [1, 2, null, 5]);
    assert.deepEqual(pageWindow(5, 10), [1, null, 4, 5, 6, null, 10]);
    assert.deepEqual(pageWindow(3, 3), [1, 2, 3]);
    assert.deepEqual(pageWindow(1, 0), []);
  });
});


describe('admin API client — envelopes and errors', () => {
  test('a 204 response resolves to undefined (logout)', async () => {
    const original = globalThis.fetch;
    const captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.init = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      const result = await apiRequest<void>('/auth/logout', { method: 'POST' });
      assert.equal(result, undefined);
      assert.equal(captured.init?.credentials, 'include');
      assert.equal(captured.init?.method, 'POST');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('a list response keeps meta and a single response unwraps data', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'sermon-1' }],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    try {
      const result = await apiRequestList<{ id: string }>('/admin/sermons');
      assert.equal(result.data[0]?.id, 'sermon-1');
      assert.equal(result.meta.total, 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('a 409 preserves the server code so the editor can branch on CONFLICT', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: { code: 'CONFLICT', message: 'The content was modified.' },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    try {
      await assert.rejects(
        apiRequest('/admin/sermons/sermon-1', {
          method: 'PATCH',
          body: { version: 1 },
        }),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'CONFLICT' &&
          error.isConflict,
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  test('PATCH bodies are JSON-encoded with a content-type header', async () => {
    const original = globalThis.fetch;
    const captured: { init?: RequestInit } = {};
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured.init = init;
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await apiRequest('/admin/sermons/sermon-1', {
        method: 'PATCH',
        body: { version: 2 },
      });
      assert.equal(captured.init?.method, 'PATCH');
      assert.deepEqual(
        JSON.parse(String(captured.init?.body)),
        { version: 2 },
      );
      const headers = captured.init?.headers as Record<string, string>;
      assert.equal(headers['Content-Type'], 'application/json');
    } finally {
      globalThis.fetch = original;
    }
  });
});
