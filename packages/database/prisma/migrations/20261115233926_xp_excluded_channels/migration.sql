-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "xpExcludedChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
