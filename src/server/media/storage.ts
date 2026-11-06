/**
 * Media storage abstraction (docs/12 §5–7).
 *
 * The domain/service layer only ever sees `MediaStorage`. `FilesystemStorage`
 * is the initial provider; an S3/R2 implementation can be dropped in without
 * touching media metadata, references or routes (docs/12 §8, docs/15 §10.4).
 *
 * Storage keys are app-generated and validated before they touch the
 * filesystem. A key can never be absolute, contain `..` segments, backslashes,
 * control characters or a path outside the configured root — user filenames
 * never become storage paths (docs/12 §22, docs/11 §23–24).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';

export const DEFAULT_MEDIA_PUBLIC_BASE = '/media';

/**
 * Validate a storage key and return it unchanged.
 *
 * A valid key is a relative POSIX path of safe ASCII segments. This is the
 * single choke point: both the filesystem adapter and the public-URL builder
 * call it, so no code path can construct an escaping key.
 */
export function assertSafeStorageKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 1024) {
    throw new Error('Invalid storage key: expected a non-empty relative path.');
  }
  if (key.includes('\0')) {
    throw new Error('Invalid storage key: control characters are not allowed.');
  }
  if (key.includes('\\')) {
    throw new Error('Invalid storage key: backslashes are not allowed.');
  }
  if (key.startsWith('/')) {
    throw new Error('Invalid storage key: absolute paths are not allowed.');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) {
    throw new Error('Invalid storage key: only [A-Za-z0-9._/-] are allowed.');
  }

  const segments = key.split('/');
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error('Invalid storage key: empty path segments are not allowed.');
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid storage key: path traversal is not allowed.');
  }
  // `normalize` catches any non-canonical form that survived the checks above.
  if (posix.normalize(key) !== key) {
    throw new Error('Invalid storage key: non-canonical path.');
  }

  return key;
}

/** Normalize the configured public base to a safe prefix. */
export function normalizePublicBase(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_MEDIA_PUBLIC_BASE;
  if (/^https?:\/\//i.test(value)) {
    const trimmed = value.replace(/\/+$/, '');
    // Validate the origin so a malformed CDN URL fails fast.
    new URL(trimmed);
    return trimmed;
  }
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(/\/+$/, '');
  if (normalized === '') {
    throw new Error('MEDIA_PUBLIC_BASE cannot be the filesystem root.');
  }
  if (normalized.includes('..')) {
    throw new Error('MEDIA_PUBLIC_BASE cannot contain "..".');
  }
  return normalized;
}

/** True when a public base is an absolute CDN/media host URL. */
export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Clean an untrusted original filename for *metadata only*. The result is
 * never used to build a storage path.
 */
export function sanitizeOriginalFilename(raw: string): string {
  const withoutPaths = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = withoutPaths
    // eslint-disable-next-line no-control-regex -- deliberately strip controls
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return 'upload';
  }
  return cleaned.slice(0, 255);
}

/** The provider-agnostic storage contract (docs/12 §6). */
export interface MediaStorage {
  /** Provider identifier persisted with each asset, e.g. `filesystem`. */
  readonly provider: string;
  /**
   * Persist a binary. `contentType` is advisory for providers that store it
   * (S3); the filesystem provider returns it to the caller via the DB instead.
   */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Read a binary. Missing keys reject. */
  get(key: string): Promise<Buffer>;
  /** Delete a binary. Missing keys are a no-op (idempotent). */
  delete(key: string): Promise<void>;
  /** Whether a binary exists. */
  exists(key: string): Promise<boolean>;
  /** Derive the public URL for a key (never required to exist). */
  getPublicUrl(key: string): string;
}

export interface FilesystemStorageOptions {
  /** Absolute or cwd-relative directory. Production supplies an env value. */
  root: string;
  /** Path prefix (`/media`) or absolute media host (`https://cdn...`). */
  publicBase?: string;
}

/**
 * Filesystem-backed storage. This is the only module in the media subsystem
 * allowed to import `node:fs` (docs/12 §5 "domain must not depend on
 * filesystem APIs").
 */
export class FilesystemStorage implements MediaStorage {
  readonly provider = 'filesystem';
  readonly root: string;
  readonly publicBase: string;

  constructor(options: FilesystemStorageOptions) {
    this.root = resolve(options.root);
    this.publicBase = normalizePublicBase(options.publicBase);
    // Fail fast at composition time: `@fastify/static` requires an existing
    // root, and uploads need the directory to be writable.
    mkdirSync(this.root, { recursive: true });
  }

  /** Resolve a validated key to an absolute path guaranteed to stay inside root. */
  private resolveKey(key: string): string {
    assertSafeStorageKey(key);
    const target = join(this.root, ...key.split('/'));
    const rootPrefix = this.root.endsWith(sep) ? this.root : `${this.root}${sep}`;
    if (target !== this.root && !target.startsWith(rootPrefix)) {
      throw new Error('Resolved storage path escapes MEDIA_ROOT.');
    }
    return target;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });

    // Write to a sibling temp file and rename atomically, so a crash mid-write
    // never leaves a truncated file at the final key (docs/12 §58).
    const temporary = `${target}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, data);
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    assertSafeStorageKey(key);
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBase}/${encoded}`;
  }
}

/** Build the configured storage provider. */
export function createMediaStorage(
  options: FilesystemStorageOptions,
): MediaStorage {
  return new FilesystemStorage(options);
}