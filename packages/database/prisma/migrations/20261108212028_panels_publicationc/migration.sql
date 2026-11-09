-- AlterTable
ALTER TABLE "RolePanel" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "publishError" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RolePanel_guildId_idx" ON "RolePanel"("guildId");
