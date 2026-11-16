/*
  Warnings:

  - Added the required column `snapshot` to the `sermon_revisions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "sermon_revisions" ADD COLUMN     "snapshot" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "description" TEXT,
ADD COLUMN     "preacher_name" TEXT,
ADD COLUMN     "publish_at" TIMESTAMP(3),
ADD COLUMN     "scripture_reference" TEXT,
ADD COLUMN     "scripture_text" TEXT,
ADD COLUMN     "sermon_date" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "sermons_status_publish_at_idx" ON "sermons"("status", "publish_at");
