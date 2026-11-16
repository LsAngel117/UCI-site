-- CreateEnum
CREATE TYPE "contact_submission_status" AS ENUM ('NEW', 'HANDLED');

-- AlterTable
ALTER TABLE "contact_submissions" ADD COLUMN     "handled_at" TIMESTAMP(3),
ADD COLUMN     "status" "contact_submission_status" NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "contact_submissions_status_created_at_idx" ON "contact_submissions"("status", "created_at");
