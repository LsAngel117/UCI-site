-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "content" JSONB;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "full_story" TEXT NOT NULL,
    "cover_media_id" TEXT,
    "date" TIMESTAMP(3),
    "editorial_approved" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "publish_at" TIMESTAMP(3),
    "unpublished_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stories_slug_key" ON "stories"("slug");

-- CreateIndex
CREATE INDEX "stories_status_published_at_idx" ON "stories"("status", "published_at");

-- CreateIndex
CREATE INDEX "stories_status_publish_at_idx" ON "stories"("status", "publish_at");

-- CreateIndex
CREATE INDEX "stories_status_editorial_approved_published_at_idx" ON "stories"("status", "editorial_approved", "published_at");

-- CreateIndex
CREATE INDEX "stories_cover_media_id_idx" ON "stories"("cover_media_id");

-- CreateIndex
CREATE INDEX "stories_featured_published_at_idx" ON "stories"("featured", "published_at");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
