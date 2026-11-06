/**
 * Media persistence (docs/15 §10.4 "Media Repository").
 *
 * This is the only media module that talks to Prisma. The service layer
 * depends on these functions instead of query builders, keeping storage and
 * business rules independent of the ORM.
 */
import { Prisma } from '@prisma/client';
import type { MediaReference } from '@prisma/client';
import { prisma } from '../db';

/** Variants are returned with every asset DTO, ordered small → large. */
export const mediaAssetInclude = {
  variants: { orderBy: { width: 'asc' } },
} satisfies Prisma.MediaAssetInclude;

export type MediaAssetWithVariants = Prisma.MediaAssetGetPayload<{
  include: typeof mediaAssetInclude;
}>;

export interface VariantRecord {
  label: string;
  format: string;
  storageKey: string;
  url: string;
  width: number | null;
  height: number | null;
  size: number | null;
}

export async function findAssetById(
  id: string,
): Promise<MediaAssetWithVariants | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
    include: mediaAssetInclude,
  });
}

export type MediaAssetWithReferenceCount = MediaAssetWithVariants & {
  _count: { references: number };
};

export async function findAssetWithReferenceCount(
  id: string,
): Promise<MediaAssetWithReferenceCount | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
    include: {
      ...mediaAssetInclude,
      _count: { select: { references: true } },
    },
  });
}

/**
 * Create the asset and its variants atomically. The binary has already been
 * written through `MediaStorage`; callers compensate on failure (docs/12 §58).
 */
export async function createAsset(
  record: Prisma.MediaAssetUncheckedCreateInput,
  variants: readonly VariantRecord[],
): Promise<MediaAssetWithVariants> {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.create({ data: record });
    if (variants.length > 0) {
      await tx.mediaVariant.createMany({
        data: variants.map((variant) => ({
          ...variant,
          mediaAssetId: asset.id,
        })),
      });
    }
    return tx.mediaAsset.findUniqueOrThrow({
      where: { id: asset.id },
      include: mediaAssetInclude,
    });
  });
}

export async function updateAsset(
  id: string,
  data: Prisma.MediaAssetUncheckedUpdateInput,
): Promise<MediaAssetWithVariants> {
  return prisma.mediaAsset.update({
    where: { id },
    data,
    include: mediaAssetInclude,
  });
}

export async function listAssets(
  where: Prisma.MediaAssetWhereInput,
  orderBy: Prisma.MediaAssetOrderByWithRelationInput,
  skip: number,
  take: number,
): Promise<MediaAssetWithVariants[]> {
  return prisma.mediaAsset.findMany({
    where,
    orderBy,
    skip,
    take,
    include: mediaAssetInclude,
  });
}

export async function countAssets(
  where: Prisma.MediaAssetWhereInput,
): Promise<number> {
  return prisma.mediaAsset.count({ where });
}

export async function listReferences(
  mediaAssetId: string,
): Promise<MediaReference[]> {
  return prisma.mediaReference.findMany({
    where: { mediaAssetId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Delete an asset. References must already be absent (FK Restrict). */
export async function deleteAsset(id: string): Promise<void> {
  await prisma.mediaAsset.delete({ where: { id } });
}

/**
 * Force delete: remove the reference rows first, then the asset, in one
 * transaction. Variants cascade with the asset. Content links are broken by
 * design — that is the explicit meaning of `force=true`.
 */
export async function deleteAssetWithReferences(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.mediaReference.deleteMany({ where: { mediaAssetId: id } }),
    prisma.mediaAsset.delete({ where: { id } }),
  ]);
}

/** Prisma FK violation (P2003) — a reference appeared during deletion. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}