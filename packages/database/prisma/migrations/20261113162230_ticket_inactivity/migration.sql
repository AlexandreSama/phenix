-- CreateEnum
CREATE TYPE "TicketCloseSource" AS ENUM ('BUTTON', 'INACTIVITY', 'CHANNEL_DELETED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closedVia" "TicketCloseSource",
ADD COLUMN     "inactivityRemindedAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "inactivityHours" INTEGER;

-- CreateIndex
CREATE INDEX "Ticket_status_lastActivityAt_idx" ON "Ticket"("status", "lastActivityAt");
