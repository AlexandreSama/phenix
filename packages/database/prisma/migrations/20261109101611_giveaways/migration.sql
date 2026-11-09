-- AlterTable
ALTER TABLE "Giveaway" ADD COLUMN     "announcedAt" TIMESTAMP(3),
ADD COLUMN     "publishError" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GiveawayEntry" ADD COLUMN     "displayName" TEXT;

-- CreateIndex
CREATE INDEX "Giveaway_guildId_endedAt_idx" ON "Giveaway"("guildId", "endedAt");
