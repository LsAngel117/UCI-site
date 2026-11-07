-- AlterTable
ALTER TABLE "navigation" ADD COLUMN     "location" TEXT NOT NULL DEFAULT 'HEADER',
ADD COLUMN     "target" TEXT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "content" JSONB,
ADD COLUMN     "cover_media_id" TEXT,
ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "publish_at" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "page_revisions" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" TEXT NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_revisions_created_by_idx" ON "page_revisions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "page_revisions_page_id_version_key" ON "page_revisions"("page_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_from_path_key" ON "redirects"("from_path");

-- CreateIndex
CREATE INDEX "redirects_entity_type_entity_id_idx" ON "redirects"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "navigation_location_order_idx" ON "navigation"("location", "order");

-- CreateIndex
CREATE INDEX "pages_status_publish_at_idx" ON "pages"("status", "publish_at");

-- CreateIndex
CREATE INDEX "pages_cover_media_id_idx" ON "pages"("cover_media_id");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
