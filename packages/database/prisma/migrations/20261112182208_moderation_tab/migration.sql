-- AlterEnum
ALTER TYPE "DashboardModule" ADD VALUE 'MODERATION';

-- CreateIndex
CREATE INDEX "Case_guildId_moderatorId_idx" ON "Case"("guildId", "moderatorId");

-- CreateIndex
CREATE INDEX "Case_guildId_createdAt_idx" ON "Case"("guildId", "createdAt");
