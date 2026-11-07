-- AlterTable
ALTER TABLE "events" ADD COLUMN     "address" TEXT,
ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cover_media_id" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location_name" TEXT,
ADD COLUMN     "publish_at" TIMESTAMP(3),
ADD COLUMN     "registration_url" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ministries" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "cover_media_id" TEXT,
ADD COLUMN     "cta_label" TEXT,
ADD COLUMN     "cta_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meeting_info" TEXT,
ADD COLUMN     "short_description" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "event_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_slug_key" ON "event_categories"("slug");

-- CreateIndex
CREATE INDEX "events_status_publish_at_idx" ON "events"("status", "publish_at");

-- CreateIndex
CREATE INDEX "events_category_id_idx" ON "events"("category_id");

-- CreateIndex
CREATE INDEX "events_cover_media_id_idx" ON "events"("cover_media_id");

-- CreateIndex
CREATE INDEX "events_featured_published_at_idx" ON "events"("featured", "published_at");

-- CreateIndex
CREATE INDEX "ministries_cover_media_id_idx" ON "ministries"("cover_media_id");

-- CreateIndex
CREATE INDEX "ministries_featured_published_at_idx" ON "ministries"("featured", "published_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
