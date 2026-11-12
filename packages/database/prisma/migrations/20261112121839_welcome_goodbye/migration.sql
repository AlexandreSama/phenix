-- AlterEnum
ALTER TYPE "DashboardModule" ADD VALUE 'WELCOME';

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "goodbyeChannelId" TEXT,
ADD COLUMN     "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "goodbyeMessage" TEXT,
ADD COLUMN     "welcomeChannelId" TEXT,
ADD COLUMN     "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "welcomeMessage" TEXT,
ADD COLUMN     "welcomeRoleId" TEXT;
