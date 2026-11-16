-- CreateEnum
CREATE TYPE "XpMultiplierKind" AS ENUM ('ROLE', 'CHANNEL', 'CATEGORY');

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "xpMultiplierMaxPercent" INTEGER NOT NULL DEFAULT 300;

-- CreateTable
CREATE TABLE "XpMultiplier" (
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "XpMultiplierKind" NOT NULL,
    "percent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpMultiplier_pkey" PRIMARY KEY ("guildId","targetId")
);

-- AddForeignKey
ALTER TABLE "XpMultiplier" ADD CONSTRAINT "XpMultiplier_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
