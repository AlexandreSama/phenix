-- CreateEnum
CREATE TYPE "RevocationSource" AS ENUM ('COMMAND', 'SCHEDULE', 'DASHBOARD');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "revokedVia" "RevocationSource";
