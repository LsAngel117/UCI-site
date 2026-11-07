-- AlterTable
ALTER TABLE "ministries" ADD COLUMN     "publish_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ministries_status_publish_at_idx" ON "ministries"("status", "publish_at");
