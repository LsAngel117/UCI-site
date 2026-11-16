/*
  Warnings:

  - A unique constraint covering the columns `[storage_key]` on the table `media_assets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `storage_key` to the `media_assets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'DOCUMENT');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "folder" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'filesystem',
ADD COLUMN     "storage_key" TEXT NOT NULL,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "media_type" NOT NULL DEFAULT 'IMAGE';

-- CreateTable
CREATE TABLE "media_variants" (
    "id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_storage_key_key" ON "media_variants"("storage_key");

-- CreateIndex
CREATE INDEX "media_variants_media_asset_id_idx" ON "media_variants"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_media_asset_id_label_key" ON "media_variants"("media_asset_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_type_created_at_idx" ON "media_assets"("type", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_folder_idx" ON "media_assets"("folder");

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
