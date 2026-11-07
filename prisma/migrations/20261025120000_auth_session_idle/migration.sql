-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_agent" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");