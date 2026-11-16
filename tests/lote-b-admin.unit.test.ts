/**
 * Improvement Lote B — admin-side pure helpers.
 *
 * Covers the B2 story form model (reusing `pages.*` permissions) and the B3
 * sermon block serializer, without a DOM or database.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import type { SermonContent, StoryAdminDto } from '@shared/cms';
import {
  availableStoryLifecycleActions,
  emptyStoryForm,
  formToCreateStoryInput,
  formToUpdateStoryInput,
  normalizeStorySlug,
  storyFormsEqual,
  storyPermissions,
  storyToForm,
  validateStoryForm,
} from '../src/admin/src/lib/stories-form';
import {
  blocksToContent,
  contentToBlocks,
  emptySermonBlock,
  moveSermonBlock,
  validateSermonBlocks,
} from '../src/admin/src/lib/sermon-blocks';

function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

function storyFixture(overrides: Partial<StoryAdminDto> = {}): StoryAdminDto {
  return {
    id: 'story-1',
    slug: 'una-vida-restaurada',
    title: 'Una vida restaurada',
    displayName: 'María López',
    quote: 'Dios me encontró cuando ya no sabía dónde buscar.',
    fullStory: 'Primer párrafo.\n\nSegundo párrafo.',
    coverMediaId: 'media-cover',
    date: '2026-03-08T00:00:00.000Z',
    editorialApproved: true,
    featured: true,
    seo: {
      title: 'Una vida restaurada | Iglesia UCI',
      description: 'Una historia de restauración.',
      canonicalUrl: 'https://uci.example.org/historias/una-vida-restaurada',
      ogImageUrl: null,
    },
    status: 'published',
    publishedAt: '2026-03-10T10:00:00.000Z',
    publishAt: null,
    version: 3,
    unpublishedAt: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('B2 — story form translation', () => {
  test('maps the DTO to form values and slices the calendar date', () => {
    const form = storyToForm(storyFixture());
    assert.equal(form.title, 'Una vida restaurada');
    assert.equal(form.displayName, 'María López');
    assert.equal(form.date, '2026-03-08');
    assert.equal(form.editorialApproved, true);
    assert.equal(form.featured, true);
    assert.equal(form.coverMediaId, 'media-cover');
    assert.equal(
      form.seoCanonicalUrl,
      'https://uci.example.org/historias/una-vida-restaurada',
    );
  });

  test('formsEqual detects real edits and ignores identity fields', () => {
    const base = storyToForm(storyFixture());
    assert.equal(storyFormsEqual(base, { ...base }), true);
    assert.equal(storyFormsEqual(base, { ...base, featured: false }), false);
  });

  test('an empty displayName is omitted so the server can fall back to title', () => {
    const input = formToCreateStoryInput({
      ...emptyStoryForm(),
      title: 'Nueva historia',
      displayName: '',
    });
    assert.equal('displayName' in input, false);
    assert.equal(input.title, 'Nueva historia');
  });

  test('a provided displayName is trimmed and an update always carries version', () => {
    const input = formToUpdateStoryInput(
      {
        ...emptyStoryForm(),
        title: 'Historia',
        displayName: '  Ana  ',
      },
      7,
    );
    assert.equal(input.version, 7);
    assert.equal(input.displayName, 'Ana');
  });

  test('validation requires a title and valid urls', () => {
    const errors = validateStoryForm({
      ...emptyStoryForm(),
      slug: '---',
      seoCanonicalUrl: 'ftp://example.org',
    });
    assert.ok(errors.title);
    assert.ok(errors.slug);
    assert.ok(errors.seoCanonicalUrl);
  });

  test('normalizes slugs like the rest of the CMS', () => {
    assert.equal(normalizeStorySlug('  Una Vida Restaurada '), 'una-vida-restaurada');
    assert.equal(normalizeStorySlug('José y María: ¡Historia!'), 'jose-y-maria-historia');
  });
});

describe('B2 — story permissions and lifecycle', () => {
  test('stories reuse the pages.* vocabulary', () => {
    const permissions = storyPermissions(
      granted('pages.read', 'pages.create', 'pages.publish'),
    );
    assert.equal(permissions.read, true);
    assert.equal(permissions.create, true);
    assert.equal(permissions.update, false);
    assert.equal(permissions.publish, true);
    assert.equal(permissions.archive, false);
  });

  test('available actions mirror the server lifecycle table', () => {
    const all = storyPermissions(
      granted(
        'pages.read',
        'pages.create',
        'pages.update',
        'pages.publish',
        'pages.archive',
      ),
    );
    assert.deepEqual(availableStoryLifecycleActions('draft', all), [
      'publish',
      'schedule',
      'archive',
    ]);
    assert.deepEqual(availableStoryLifecycleActions('published', all), [
      'archive',
    ]);
  });
});

describe('B3 — sermon block serialization', () => {
  test('round-trips the supported block set', () => {
    const content: SermonContent = [
      { type: 'heading', level: 2, text: 'Sección' },
      { type: 'paragraph', text: 'Texto' },
      { type: 'list', ordered: false, items: ['Uno', 'Dos'] },
      { type: 'quote', text: 'Cita', cite: 'Referencia' },
      { type: 'cta', label: 'Ir', href: '/soy-nuevo' },
      { type: 'image', src: '/media/foto.jpg', alt: 'Foto', caption: 'Pie' },
    ];
    assert.deepEqual(contentToBlocks(content), content);
    assert.deepEqual(blocksToContent(contentToBlocks(content)), content);
  });

  test('an untouched editor saves null instead of an empty body', () => {
    assert.equal(blocksToContent([]), null);
    assert.equal(blocksToContent([emptySermonBlock('paragraph')]), null);
    assert.equal(blocksToContent([{ type: 'list', ordered: false, items: ['', '  '] }]), null);
  });

  test('validation rejects unsafe CTA/image URLs', () => {
    const errors = validateSermonBlocks([
      { type: 'cta', label: 'Malicioso', href: 'javascript:alert(1)' },
      { type: 'image', src: 'data:image/png;base64,xx', alt: '', caption: '' },
    ]);
    assert.ok(errors['0']);
    assert.ok(errors['1']);
  });

  test('moveSermonBlock keeps the array immutable and bounds the move', () => {
    const blocks = contentToBlocks([
      { type: 'paragraph', text: 'Uno' },
      { type: 'paragraph', text: 'Dos' },
    ]);
    const moved = moveSermonBlock(blocks, 1, -1);
    assert.deepEqual(
      moved.map((block) => (block.type === 'paragraph' ? block.text : '')),
      ['Dos', 'Uno'],
    );
    assert.equal(blocks[0]?.type === 'paragraph' ? blocks[0].text : '', 'Uno');
    assert.deepEqual(moveSermonBlock(blocks, 0, -1), blocks);
  });
});
