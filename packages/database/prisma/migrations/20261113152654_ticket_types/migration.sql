-- CreateEnum
CREATE TYPE "TicketTypeQuestionStyle" AS ENUM ('SHORT', 'PARAGRAPH');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "typeId" INTEGER;

-- CreateTable
CREATE TABLE "TicketType" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "categoryId" TEXT NOT NULL,
    "staffRoleIds" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTypeQuestion" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "style" "TicketTypeQuestionStyle" NOT NULL DEFAULT 'SHORT',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "maxLength" INTEGER NOT NULL DEFAULT 1000,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketTypeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketType_guildId_position_idx" ON "TicketType"("guildId", "position");

-- CreateIndex
CREATE INDEX "TicketTypeQuestion_typeId_position_idx" ON "TicketTypeQuestion"("typeId", "position");

-- CreateIndex
CREATE INDEX "Ticket_guildId_typeId_idx" ON "Ticket"("guildId", "typeId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTypeQuestion" ADD CONSTRAINT "TicketTypeQuestion_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
