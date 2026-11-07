-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "audio_url" TEXT,
ADD COLUMN     "cover_media_id" TEXT,
ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes_content" TEXT,
ADD COLUMN     "notes_media_id" TEXT,
ADD COLUMN     "preacher_id" TEXT,
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "video_external_id" TEXT,
ADD COLUMN     "video_provider" TEXT,
ADD COLUMN     "video_url" TEXT;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT,
    "photo_media_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermon_series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "cover_media_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermon_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermon_topics" (
    "sermon_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "sermon_topics_pkey" PRIMARY KEY ("sermon_id","topic_id")
);

-- CreateIndex
CREATE INDEX "people_active_display_name_idx" ON "people"("active", "display_name");

-- CreateIndex
CREATE INDEX "people_photo_media_id_idx" ON "people"("photo_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "sermon_series_slug_key" ON "sermon_series"("slug");

-- CreateIndex
CREATE INDEX "sermon_series_cover_media_id_idx" ON "sermon_series"("cover_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "sermon_topics_topic_id_idx" ON "sermon_topics"("topic_id");

-- CreateIndex
CREATE INDEX "sermons_preacher_id_idx" ON "sermons"("preacher_id");

-- CreateIndex
CREATE INDEX "sermons_series_id_idx" ON "sermons"("series_id");

-- CreateIndex
CREATE INDEX "sermons_cover_media_id_idx" ON "sermons"("cover_media_id");

-- CreateIndex
CREATE INDEX "sermons_notes_media_id_idx" ON "sermons"("notes_media_id");

-- CreateIndex
CREATE INDEX "sermons_featured_published_at_idx" ON "sermons"("featured", "published_at");

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_preacher_id_fkey" FOREIGN KEY ("preacher_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "sermon_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_notes_media_id_fkey" FOREIGN KEY ("notes_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_series" ADD CONSTRAINT "sermon_series_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_topics" ADD CONSTRAINT "sermon_topics_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_topics" ADD CONSTRAINT "sermon_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
