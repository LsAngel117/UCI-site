/**
 * Pure probes for the Phase 10C media library helpers (docs/09 §45–§52).
 *
 * These exercise formatting, client-side upload validation, filter
 * serialization, metadata clearing and permission projection without a DOM or
 * a database. The API remains the authority for authorization and for the
 * real MIME/size checks.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PermissionName } from '@shared/api';
import type { MediaDto } from '@shared/media';
import { ApiError } from '../src/admin/src/lib/api';
import {
  buildMediaListQuery,
  canCancelUpload,
  dateRangeError,
  describeMediaError,
  emptyMediaFilters,
  emptyUploadMetadata,
  folderLabel,
  formatBytes,
  formatDimensions,
  isMediaReferenced,
  MEDIA_SORT_ALLOWLIST,
  MEDIA_UPLOAD_MAX_BYTES,
  mediaDisplayName,
  mediaFiltersActive,
  mediaMimeOptions,
  mediaPermissions,
  mediaPreviewUrl,
  mediaToMetadataForm,
  mediaTypeLabel,
  mediaTypeMismatchMessage,
  mimeTypeLabel,
  normalizeUploadMetadata,
  referenceEntityLabel,
  shouldFetchMediaLibrary,
  thumbnailVariant,
  UPLOAD_INTERRUPTED_MESSAGE,
  UPLOAD_PROCESSING_CANCEL_HINT,
  validateMediaMetadata,
  validateUploadFile,
} from '../src/admin/src/lib/media';

function granted(...permissions: PermissionName[]) {
  const set = new Set<PermissionName>(permissions);
  return (permission: PermissionName) => set.has(permission);
}

function fixture(overrides: Partial<MediaDto> = {}): MediaDto {
  return {
    id: 'media-1',
    type: 'IMAGE',
    filename: 'portada.png',
    mimeType: 'image/png',
    size: 2048,
    width: 800,
    height: 600,
    storageKey: 'uploads/2026/11/media-1.png',
    url: '/media/uploads/2026/11/media-1.png',
    provider: 'filesystem',
    folder: 'uploads',
    title: 'Portada',
    description: 'Imagen de portada',
    caption: 'Portada del sitio',
    alt: 'Fachada de la iglesia',
    createdById: 'user-1',
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-02T12:00:00.000Z',
    variants: [
      {
        id: 'variant-thumb',
        label: 'thumbnail',
        format: 'webp',
        width: 320,
        height: 240,
        size: 1200,
        storageKey: 'uploads/2026/11/media-1-thumbnail.webp',
        url: '/media/uploads/2026/11/media-1-thumbnail.webp',
      },
      {
        id: 'variant-small',
        label: 'small',
        format: 'webp',
        width: 640,
        height: 480,
        size: 1800,
        storageKey: 'uploads/2026/11/media-1-small.webp',
        url: '/media/uploads/2026/11/media-1-small.webp',
      },
    ],
    ...overrides,
  };
}

describe('media display helpers', () => {
  test('formatBytes uses binary units with a compact label', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(10 * 1024), '10 KB');
    assert.equal(formatBytes(10 * 1024 * 1024), '10 MB');
    assert.equal(formatBytes(null), '—');
  });

  test('formatDimensions shows both axes or an em dash', () => {
    assert.equal(formatDimensions(1920, 1080), '1920 × 1080 px');
    assert.equal(formatDimensions(null, 1080), '—');
  });

  test('labels cover type, MIME, folder and reference entities', () => {
    assert.equal(mediaTypeLabel('IMAGE'), 'Imagen');
    assert.equal(mediaTypeLabel('DOCUMENT'), 'Documento');
    assert.equal(mimeTypeLabel('image/webp'), 'WebP');
    assert.equal(mimeTypeLabel('application/x-unknown'), 'application/x-unknown');
    assert.equal(folderLabel('sermons'), 'Sermones');
    assert.equal(folderLabel(null), 'Sin carpeta');
    assert.equal(referenceEntityLabel('SERMON'), 'Sermón');
    assert.equal(referenceEntityLabel('CUSTOM'), 'CUSTOM');
  });

  test('display name prefers the title and falls back to the filename', () => {
    assert.equal(mediaDisplayName(fixture()), 'Portada');
    assert.equal(mediaDisplayName(fixture({ title: null })), 'portada.png');
    assert.equal(mediaDisplayName(fixture({ title: '   ' })), 'portada.png');
  });

  test('thumbnail derivative is preferred, then the original image', () => {
    const media = fixture();
    assert.equal(thumbnailVariant(media)?.label, 'thumbnail');
    assert.equal(
      mediaPreviewUrl(media),
      '/media/uploads/2026/11/media-1-thumbnail.webp',
    );

    const withoutVariants = fixture({ variants: [] });
    assert.equal(mediaPreviewUrl(withoutVariants), withoutVariants.url);

    const document = fixture({
      type: 'DOCUMENT',
      mimeType: 'application/pdf',
      variants: [],
    });
    assert.equal(mediaPreviewUrl(document), null);
  });
});

describe('media filters and query serialization', () => {
  test('empty filters only carry page, limit and the default order', () => {
    const query = buildMediaListQuery(emptyMediaFilters(), 1, 24, 'createdAt', 'desc');
    assert.equal(query.page, 1);
    assert.equal(query.limit, 24);
    assert.equal(query.sort, 'createdAt');
    assert.equal(query.order, 'desc');
    assert.equal(query.search, undefined);
    assert.equal(query.type, undefined);
    assert.equal(query.mimeType, undefined);
    assert.equal(query.folder, undefined);
    assert.equal(query.createdFrom, undefined);
    assert.equal(query.createdTo, undefined);
  });

  test('active filters are trimmed and empty values are dropped', () => {
    const query = buildMediaListQuery(
      {
        search: '  portada  ',
        type: 'IMAGE',
        mimeType: 'image/png',
        folder: 'sermons',
        createdFrom: '2026-01-01',
        createdTo: '2026-12-31',
      },
      2,
      24,
      'size',
      'asc',
    );

    assert.equal(query.search, 'portada');
    assert.equal(query.type, 'IMAGE');
    assert.equal(query.mimeType, 'image/png');
    assert.equal(query.folder, 'sermons');
    assert.equal(query.createdFrom, '2026-01-01');
    assert.equal(query.createdTo, '2026-12-31');
    assert.equal(query.page, 2);
    assert.equal(query.sort, 'size');
    assert.equal(query.order, 'asc');
  });

  test('mediaFiltersActive ignores whitespace search', () => {
    assert.equal(mediaFiltersActive(emptyMediaFilters()), false);
    assert.equal(
      mediaFiltersActive({ ...emptyMediaFilters(), search: '   ' }),
      false,
    );
    assert.equal(
      mediaFiltersActive({ ...emptyMediaFilters(), folder: 'events' }),
      true,
    );
  });

  test('MIME options follow the selected media type', () => {
    assert.deepEqual(
      mediaMimeOptions('IMAGE').map((option) => option.value),
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    );
    assert.deepEqual(
      mediaMimeOptions('DOCUMENT').map((option) => option.value),
      ['application/pdf'],
    );
    assert.equal(mediaMimeOptions('').length, 5);
  });

  test('invalid date ranges are rejected before reaching the API', () => {
    assert.equal(dateRangeError('', ''), null);
    assert.equal(dateRangeError('2026-01-01', '2026-02-01'), null);
    assert.match(
      String(dateRangeError('2026-03-01', '2026-02-01')),
      /posterior/,
    );
    assert.match(
      String(dateRangeError('not-a-date', '2026-02-01')),
      /fechas válidas/,
    );
  });

  test('sort allowlist matches the shared media contract', () => {
    assert.deepEqual(
      [...MEDIA_SORT_ALLOWLIST],
      ['createdAt', 'updatedAt', 'filename', 'size', 'title'],
    );
  });
});

describe('upload validation', () => {
  test('accepts allowlisted image and PDF files within the limit', () => {
    assert.deepEqual(
      validateUploadFile({ name: 'foto.png', type: 'image/png', size: 2048 }),
      { ok: true },
    );
    assert.deepEqual(
      validateUploadFile({ name: 'notas.pdf', type: 'application/pdf', size: 2048 }),
      { ok: true },
    );
  });

  test('rejects unsupported types, empty files, empty names and oversize files', () => {
    const unsupported = validateUploadFile({
      name: 'vector.svg',
      type: 'image/svg+xml',
      size: 100,
    });
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) assert.match(unsupported.message, /Formato no permitido/);

    const empty = validateUploadFile({ name: 'foto.png', type: 'image/png', size: 0 });
    assert.equal(empty.ok, false);

    const unnamed = validateUploadFile({ name: '  ', type: 'image/png', size: 10 });
    assert.equal(unnamed.ok, false);

    const oversize = validateUploadFile(
      { name: 'foto.png', type: 'image/png', size: MEDIA_UPLOAD_MAX_BYTES + 1 },
      MEDIA_UPLOAD_MAX_BYTES,
    );
    assert.equal(oversize.ok, false);
    if (!oversize.ok) assert.match(oversize.message, /10 MB/);
  });
});

describe('upload cancellation honesty', () => {
  test('an upload can only be cancelled before the server owns it', () => {
    assert.equal(canCancelUpload('idle'), false);
    assert.equal(canCancelUpload('uploading'), true);
    assert.equal(canCancelUpload('processing'), false);
  });

  test('interrupted-upload copy never claims the asset was not stored', () => {
    assert.doesNotMatch(UPLOAD_INTERRUPTED_MESSAGE, /no se guard[oó]/i);
    assert.match(UPLOAD_INTERRUPTED_MESSAGE, /puede completarse/i);
    assert.match(UPLOAD_INTERRUPTED_MESSAGE, /refresc/i);
    assert.match(UPLOAD_PROCESSING_CANCEL_HINT, /no se puede cancelar/i);
    assert.match(UPLOAD_PROCESSING_CANCEL_HINT, /termin/i);
  });
});

describe('picker guards', () => {
  test('the library only fetches while its dialog is open', () => {
    assert.equal(shouldFetchMediaLibrary(false), false);
    assert.equal(shouldFetchMediaLibrary(true), true);
  });

  test('a manually typed id is checked against the expected media type', () => {
    assert.equal(mediaTypeMismatchMessage('IMAGE', 'IMAGE'), null);
    assert.equal(mediaTypeMismatchMessage('DOCUMENT', 'DOCUMENT'), null);
    assert.match(
      String(mediaTypeMismatchMessage('DOCUMENT', 'IMAGE')),
      /documento.*imagen/i,
    );
    assert.match(
      String(mediaTypeMismatchMessage('IMAGE', 'DOCUMENT')),
      /imagen.*documento/i,
    );
  });
});

describe('metadata forms', () => {
  test('DTO values map to editable strings and blanks become empty', () => {
    assert.deepEqual(mediaToMetadataForm(fixture()), {
      alt: 'Fachada de la iglesia',
      title: 'Portada',
      description: 'Imagen de portada',
      caption: 'Portada del sitio',
    });
    assert.deepEqual(mediaToMetadataForm(fixture({ alt: null, title: null })), {
      alt: '',
      title: '',
      description: 'Imagen de portada',
      caption: 'Portada del sitio',
    });
  });

  test('blank fields clear stored metadata with null', () => {
    const result = validateMediaMetadata({
      alt: '',
      title: '  Portada nueva  ',
      description: '',
      caption: '   ',
    });
    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.input, {
      alt: null,
      title: 'Portada nueva',
      description: null,
      caption: null,
    });
  });

  test('length limits mirror the API and block the payload', () => {
    const result = validateMediaMetadata({
      alt: 'a'.repeat(501),
      title: 'b'.repeat(201),
      description: 'c'.repeat(5001),
      caption: 'd'.repeat(501),
    });
    assert.equal(result.input, null);
    assert.ok(result.errors.alt);
    assert.ok(result.errors.title);
    assert.ok(result.errors.description);
    assert.ok(result.errors.caption);
  });

  test('upload metadata trims values and omits blanks', () => {
    const form = {
      ...emptyUploadMetadata(),
      folder: 'sermons',
      alt: '  Texto  ',
      title: '   ',
      description: '  Descripción  ',
      caption: '',
    };
    assert.deepEqual(normalizeUploadMetadata(form), {
      folder: 'sermons',
      alt: 'Texto',
      description: 'Descripción',
    });
  });
});

describe('permissions and media errors', () => {
  test('mediaPermissions projects each grant independently', () => {
    assert.deepEqual(mediaPermissions(granted('media.read', 'media.update')), {
      read: true,
      upload: false,
      update: true,
      delete: false,
    });
    assert.deepEqual(mediaPermissions(granted()), {
      read: false,
      upload: false,
      update: false,
      delete: false,
    });
  });

  test('MEDIA_REFERENCED is detected and described as a reference conflict', () => {
    const error = new ApiError(
      409,
      'MEDIA_REFERENCED',
      'This media asset is still referenced by content.',
    );
    assert.equal(isMediaReferenced(error), true);
    assert.match(describeMediaError(error), /todavía está en uso/);
    assert.equal(isMediaReferenced(new ApiError(409, 'CONFLICT', 'x')), false);
  });

  test('413 and 422 get actionable upload copy', () => {
    assert.match(
      describeMediaError(new ApiError(413, 'FILE_TOO_LARGE', 'too large'), 5 * 1024 * 1024),
      /5 MB/,
    );
    assert.match(
      describeMediaError(new ApiError(422, 'UNSUPPORTED_MEDIA_TYPE', 'bad type')),
      /formato del archivo/i,
    );
  });

  test('permission failures keep the shared describeError copy', () => {
    assert.match(
      describeMediaError(new ApiError(403, 'FORBIDDEN', 'forbidden')),
      /no tiene permiso/,
    );
  });
});
