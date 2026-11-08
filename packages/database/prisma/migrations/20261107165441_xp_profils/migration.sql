-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "leaderboardPublic" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MemberLevel" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT;
