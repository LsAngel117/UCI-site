/**
 * Media subsystem unit suite (Phase 4, docs/12 §21–28).
 *
 * Pure, database-free characterization of the security boundary:
 *   - storage-key sanitization / path-traversal rejection;
 *   - filesystem adapter put/get/exists/delete/public URL;
 *   - MIME allowlist + magic-byte signature;
 *   - app-generated storage keys (never a user filename);
 *   - sharp variant generation;
 *   - external video (YouTube) validation.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import sharp from 'sharp';

import {
  assertSafeStorageKey,
  FilesystemStorage,
  normalizePublicBase,
  sanitizeOriginalFilename,
} from '@server/media/storage';
import {
  assertContentMatches,
  buildStorageKey,
  resolveUploadType,
  sniffMimeType,
} from '@server/media/files';
import {
  processImage,
  variantStorageKey,
} from '@server/media/images';
import { parseExternalVideo } from '@shared/media';

const ROOT = mkdtempSync(join(tmpdir(), 'uci-media-unit-'));

after(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 90, b: 180 },
    },
  })
    .png()
    .toBuffer();
}

describe('storage key safety (docs/11 §23–24, docs/12 §22)', () => {
  test('accepts canonical relative keys', () => {
    assert.equal(
      assertSafeStorageKey('sermons/2026/11/8f14e45f-ceea-467f-a1bd-6c1d3f0e1a2b.png'),
      'sermons/2026/11/8f14e45f-ceea-467f-a1bd-6c1d3f0e1a2b.png',
    );
  });

  test('rejects traversal, absolute paths, backslashes and control chars', () => {
    for (const key of [
      '../outside.png',
      'sermons/../../etc/passwd',
      '/etc/passwd',
      'sermons\\cover.png',
      'sermons//cover.png',
      'sermons/./cover.png',
      'sermons/2026/',
      '',
      'sermons/\u0000/c.png',
    ]) {
      assert.throws(() => assertSafeStorageKey(key), /Invalid storage key/);
    }
  });

  test('the original filename can never become the storage key', () => {
    const at = new Date('2026-11-06T12:00:00Z');
    const key = buildStorageKey('sermons', 'webp', at, 'fixed-id');
    assert.equal(key, 'sermons/2026/11/fixed-id.webp');
    assert.doesNotMatch(key, /notas|sermón|secret/i);
  });

  test('sanitizeOriginalFilename strips directories/control chars for metadata', () => {
    assert.equal(sanitizeOriginalFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeOriginalFilename('C:\\temp\\foto.png'), 'foto.png');
    assert.equal(sanitizeOriginalFilename('  foto\n.png  '), 'foto.png');
    assert.equal(sanitizeOriginalFilename('..'), 'upload');
  });
});

describe('filesystem storage adapter (docs/12 §5–7)', () => {
  test('put/get/exists/delete round-trip inside the configured root', async () => {
    const storage = new FilesystemStorage({ root: join(ROOT, 'adapter') });
    const key = 'uploads/2026/11/abc.png';
    const data = Buffer.from('binary');

    assert.equal(await storage.exists(key), false);
    await storage.put(key, data, 'image/png');
    assert.equal(await storage.exists(key), true);
    assert.deepEqual(await storage.get(key), data);
    assert.equal(storage.getPublicUrl(key), '/media/uploads/2026/11/abc.png');

    await storage.delete(key);
    assert.equal(await storage.exists(key), false);
    // Deleting a missing key is idempotent.
    await storage.delete(key);
  });

  test('rejects keys that would escape MEDIA_ROOT', async () => {
    const storage = new FilesystemStorage({ root: join(ROOT, 'adapter2') });
    await assert.rejects(
      () => storage.put('../escape.png', Buffer.from('x'), 'image/png'),
      /Invalid storage key/,
    );
    assert.equal(existsSync(join(ROOT, 'escape.png')), false);
  });

  test('getPublicUrl supports a CDN-style absolute base', () => {
    const storage = new FilesystemStorage({
      root: join(ROOT, 'adapter3'),
      publicBase: 'https://cdn.example.org/media/',
    });
    assert.equal(
      storage.getPublicUrl('pages/2026/11/a.png'),
      'https://cdn.example.org/media/pages/2026/11/a.png',
    );
    assert.equal(normalizePublicBase('media'), '/media');
    assert.equal(normalizePublicBase('/media/'), '/media');
    assert.throws(() => normalizePublicBase('/'), /filesystem root/);
  });

  test('getPublicUrl rejects traversal, absolute and malformed keys', () => {
    const storage = new FilesystemStorage({ root: join(ROOT, 'publicurl') });
    for (const key of [
      '../x.png',
      '/etc/passwd',
      'a\\b.png',
      'a/../b.png',
      'a//b.png',
    ]) {
      assert.throws(
        () => storage.getPublicUrl(key),
        /Invalid storage key/,
        `expected getPublicUrl to reject ${JSON.stringify(key)}`,
      );
    }
  });
});

describe('upload MIME and signature validation (docs/12 §21)', () => {
  test('allowlist accepts supported images/PDF and rejects SVG/text', () => {
    assert.equal(resolveUploadType('image/png').type, 'IMAGE');
    assert.equal(resolveUploadType('image/jpeg; charset=binary').extension, 'jpg');
    assert.equal(resolveUploadType('application/pdf').type, 'DOCUMENT');
    assert.throws(() => resolveUploadType('image/svg+xml'), /Unsupported media type/);
    assert.throws(() => resolveUploadType('text/plain'), /Unsupported media type/);
  });

  test('magic bytes must match the declared MIME type', async () => {
    const data = await png(10, 10);
    assert.equal(sniffMimeType(data), 'image/png');
    assert.doesNotThrow(() => assertContentMatches('image/png', data));
    assert.throws(
      () => assertContentMatches('image/jpeg', data),
      /does not match its declared MIME type/,
    );
    assert.equal(sniffMimeType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  });
});

describe('image variants (docs/12 §26–28)', () => {
  test('generates thumbnail/small/medium WebP derivatives for a large image', async () => {
    const data = await png(1600, 900);
    const baseKey = 'sermons/2026/11/asset.png';
    const processed = await processImage(data, baseKey);

    assert.equal(processed.width, 1600);
    assert.equal(processed.height, 900);
    assert.deepEqual(
      processed.variants.map((variant) => variant.label),
      ['thumbnail', 'small', 'medium'],
    );
    assert.deepEqual(
      processed.variants.map((variant) => variant.width),
      [320, 640, 1280],
    );
    for (const variant of processed.variants) {
      assert.equal(variant.format, 'webp');
      assert.equal(
        variant.storageKey,
        variantStorageKey(baseKey, variant.label),
      );
      // RIFF....WEBP magic.
      assert.equal(variant.data.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(variant.data.subarray(8, 12).toString('ascii'), 'WEBP');
      assert.ok(variant.size > 0);
    }
  });

  test('never upscales a small image', async () => {
    const data = await png(300, 200);
    const processed = await processImage(data, 'uploads/2026/11/small.png');
    assert.equal(processed.width, 300);
    assert.equal(processed.height, 200);
    assert.deepEqual(processed.variants, []);
  });

  test('rejects non-image bytes with a typed 422 error', async () => {
    await assert.rejects(
      () => processImage(Buffer.from('not an image'), 'uploads/x.png'),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, 422);
        assert.equal((error as { code?: string }).code, 'UNSUPPORTED_MEDIA_TYPE');
        return true;
      },
    );
  });
});

describe('external video (docs/08 §16, docs/12 §38–40)', () => {
  test('normalizes YouTube URLs and ids without a network call', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const result = parseExternalVideo({ url: input });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.video.provider, 'YOUTUBE');
        assert.equal(result.video.externalId, 'dQw4w9WgXcQ');
        assert.equal(result.video.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        assert.equal(
          result.video.thumbnailUrl,
          'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        );
      }
    }

    const byId = parseExternalVideo({ externalId: 'dQw4w9WgXcQ', title: ' Culto ' });
    assert.equal(byId.ok, true);
    if (byId.ok) assert.equal(byId.video.title, 'Culto');
  });

  test('rejects non-YouTube URLs, bad ids and unsupported providers', () => {
    assert.equal(parseExternalVideo({ url: 'https://vimeo.com/123' }).ok, false);
    assert.equal(parseExternalVideo({ url: 'javascript:alert(1)' }).ok, false);
    assert.equal(parseExternalVideo({ externalId: 'short' }).ok, false);
    assert.equal(
      parseExternalVideo({ provider: 'VIMEO', externalId: 'dQw4w9WgXcQ' }).ok,
      false,
    );
  });
});

// Keep a direct assertion that storage writes land on disk (not in PostgreSQL)
// without depending on the database-backed suite.
test('stored binaries are readable from the filesystem root', async () => {
  const storage = new FilesystemStorage({ root: join(ROOT, 'disk') });
  const key = 'documents/2026/11/guide.pdf';
  const data = Buffer.from('%PDF-1.7\n');
  await storage.put(key, data, 'application/pdf');
  assert.deepEqual(readFileSync(join(ROOT, 'disk', key)), data);
});