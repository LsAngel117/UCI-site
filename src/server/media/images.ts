/**
 * Image processing via `sharp` (docs/12 §26–28).
 *
 * A deliberately small variant set: a thumbnail plus two responsive widths,
 * all encoded as WebP. The CMS must not generate dozens of derivatives
 * (docs/12 §27), so targets above the source width are skipped rather than
 * upscaled.
 *
 * Images are untrusted input. `sharp` validates decodability and enforces an
 * input-pixel cap to blunt decompression bombs. A failure to read the image is
 * translated to a 422; a failure on one derivative is skipped so it can never
 * crash the upload (the original remains valid).
 */
import sharp from 'sharp';
import { unsupportedMediaType } from './errors';

type SharpMetadata = Awaited<
  ReturnType<ReturnType<typeof sharp>['metadata']>
>;

export interface VariantTarget {
  label: string;
  width: number;
}

export const IMAGE_VARIANT_TARGETS: readonly VariantTarget[] = [
  { label: 'thumbnail', width: 320 },
  { label: 'small', width: 640 },
  { label: 'medium', width: 1280 },
];

/** Hard ceiling for decoded pixels (50 MP) to reject image bombs. */
const MAX_INPUT_PIXELS = 50_000_000;

export interface GeneratedVariant {
  label: string;
  format: 'webp';
  storageKey: string;
  data: Buffer;
  width: number;
  height: number;
  size: number;
}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: GeneratedVariant[];
}

/** Derive a variant key from the original key: `.../uuid.png` → `.../uuid-thumbnail.webp`. */
export function variantStorageKey(baseKey: string, label: string): string {
  const withoutExtension = baseKey.replace(/\.[^./]+$/, '');
  return `${withoutExtension}-${label}.webp`;
}

/**
 * Read dimensions and generate WebP variants. Throws a `MediaError` with
 * `UNSUPPORTED_MEDIA_TYPE` when the bytes cannot be decoded as an image.
 */
export async function processImage(
  buffer: Buffer,
  baseKey: string,
): Promise<ProcessedImage> {
  let metadata: SharpMetadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw unsupportedMediaType(
      'The uploaded image could not be decoded. It may be corrupt or unsafe.',
    );
  }

  if (!metadata.width || !metadata.height) {
    throw unsupportedMediaType('The uploaded image has no readable dimensions.');
  }

  const variants: GeneratedVariant[] = [];
  for (const target of IMAGE_VARIANT_TARGETS) {
    // Never upscale: a derivative wider than the source adds no value.
    if (metadata.width <= target.width) continue;
    try {
      const { data, info } = await sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .rotate() // honor EXIF orientation before resizing
        .resize({ width: target.width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      variants.push({
        label: target.label,
        format: 'webp',
        storageKey: variantStorageKey(baseKey, target.label),
        data,
        width: info.width,
        height: info.height,
        size: data.length,
      });
    } catch {
      // A single derivative failing must not lose an otherwise valid upload.
      continue;
    }
  }

  return { width: metadata.width, height: metadata.height, variants };
}