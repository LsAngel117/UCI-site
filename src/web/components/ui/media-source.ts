/**
 * Media-source helpers.
 *
 * The data layer returns a `MediaSource` (`ImageMetadata | string | null`).
 * Components must branch on it consistently:
 *   - `ImageMetadata` -> Astro `<Image>` (optimized local asset)
 *   - `string`        -> plain `<img>` (CMS-delivered URL)
 *   - `null`          -> `MediaPlaceholder`
 *
 * These guards exist so sections never cast or duplicate the union logic, and
 * so the scoped-style convention keeps working: `<Image>` and literal `<img>`
 * elements written inside a section inherit that section's `data-astro-cid`,
 * which lets the section style them directly. (A class passed *through* a
 * custom component does not inherit the parent scope — the reason this helper
 * exists instead of a wrapper component.)
 */
import type { ImageMetadata } from 'astro';

export function isLocalAsset(value: unknown): value is ImageMetadata {
  return typeof value === 'object' && value !== null;
}

export function isRemoteAsset(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}