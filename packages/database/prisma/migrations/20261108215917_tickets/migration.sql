-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closedByName" TEXT,
ADD COLUMN     "messageCount" INTEGER,
ADD COLUMN     "ownerName" TEXT;

-- CreateTable
CREATE TABLE "TicketPanel" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "buttonLabel" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishError" TEXT,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("guildId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketPanel_messageId_key" ON "TicketPanel"("messageId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- CreateIndex
CREATE INDEX "Ticket_guildId_ownerId_status_idx" ON "Ticket"("guildId", "ownerId", "status");

-- AddForeignKey
ALTER TABLE "TicketPanel" ADD CONSTRAINT "TicketPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
