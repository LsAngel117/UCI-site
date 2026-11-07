/**
 * Row → wire mapping for media (docs/08 §15.2).
 *
 * URLs are derived here, from `storageKey` + the active provider, rather than
 * trusting the cached URL column. That is what makes a storage-provider swap
 * invisible to clients and to the domain model (docs/12 §11).
 */
import type { MediaReference } from '@prisma/client';
import type {
  MediaDto,
  MediaReferenceDto,
  MediaVariantDto,
} from '@shared/media';
import type { MediaAssetWithVariants } from './repository';
import type { MediaStorage } from './storage';

function toVariantDto(
  variant: MediaAssetWithVariants['variants'][number],
  storage: MediaStorage,
): MediaVariantDto {
  return {
    id: variant.id,
    label: variant.label,
    format: variant.format,
    width: variant.width,
    height: variant.height,
    size: variant.size,
    storageKey: variant.storageKey,
    url: storage.getPublicUrl(variant.storageKey),
  };
}

export function toMediaDto(
  asset: MediaAssetWithVariants,
  storage: MediaStorage,
): MediaDto {
  return {
    id: asset.id,
    type: asset.type,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    storageKey: asset.storageKey,
    url: storage.getPublicUrl(asset.storageKey),
    provider: asset.provider,
    folder: asset.folder,
    title: asset.title,
    description: asset.description,
    caption: asset.caption,
    alt: asset.altText,
    createdById: asset.createdById,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    variants: asset.variants.map((variant) => toVariantDto(variant, storage)),
  };
}

export function toMediaReferenceDto(
  reference: MediaReference,
): MediaReferenceDto {
  return {
    id: reference.id,
    entityType: reference.entityType,
    entityId: reference.entityId,
    purpose: reference.purpose,
    createdAt: reference.createdAt.toISOString(),
  };
}