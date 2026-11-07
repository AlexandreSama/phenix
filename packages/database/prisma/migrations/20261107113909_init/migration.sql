-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('WARN', 'MUTE', 'UNMUTE', 'KICK', 'BAN', 'UNBAN');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RolePanelMode" AS ENUM ('MULTIPLE', 'UNIQUE');

-- CreateEnum
CREATE TYPE "Td2Platform" AS ENUM ('UBI', 'PSN', 'XBL');

-- CreateEnum
CREATE TYPE "Td2ActivityKind" AS ENUM ('RAID', 'INCURSION');

-- CreateEnum
CREATE TYPE "Td2Role" AS ENUM ('DPS', 'HEAL', 'TANK', 'HEAL_TANK');

-- CreateEnum
CREATE TYPE "Td2SignupStatus" AS ENUM ('CONFIRMED', 'RESERVE');

-- CreateEnum
CREATE TYPE "Td2ReportStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "caseCounter" INTEGER NOT NULL DEFAULT 0,
    "ticketCounter" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "modLogChannelId" TEXT,
    "staffRoleIds" TEXT[],
    "announceChannelId" TEXT,
    "xpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "xpMin" INTEGER NOT NULL DEFAULT 15,
    "xpMax" INTEGER NOT NULL DEFAULT 25,
    "xpCooldownSec" INTEGER NOT NULL DEFAULT 60,
    "levelUpChannelId" TEXT,
    "ticketCategoryId" TEXT,
    "ticketStaffRoleIds" TEXT[],
    "ticketLogChannelId" TEXT,
    "td2ChannelId" TEXT,
    "td2ReportChannelId" TEXT,
    "td2ReportViewerRoleIds" TEXT[],
    "td2ReportFeedChannelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "CaseType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberLevel" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),

    CONSTRAINT "MemberLevel_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "Marriage" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marriage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "transcriptKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "hostId" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "requiredRoleId" TEXT,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "winnerIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "giveawayId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("giveawayId","userId")
);

-- CreateTable
CREATE TABLE "RolePanel" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "RolePanelMode" NOT NULL DEFAULT 'MULTIPLE',

    CONSTRAINT "RolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePanelOption" (
    "id" SERIAL NOT NULL,
    "panelId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RolePanelOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Td2Profile" (
    "userId" TEXT NOT NULL,
    "platform" "Td2Platform" NOT NULL,
    "playerName" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Td2Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Td2Activity" (
    "id" SERIAL NOT NULL,
    "kind" "Td2ActivityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Td2Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Td2ActivityMode" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Td2ActivityMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Td2ModeSlot" (
    "modeId" INTEGER NOT NULL,
    "role" "Td2Role" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "Td2ModeSlot_pkey" PRIMARY KEY ("modeId","role")
);

-- CreateTable
CREATE TABLE "Td2Event" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "modeId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "organizerId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Td2Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Td2EventSlot" (
    "eventId" INTEGER NOT NULL,
    "role" "Td2Role" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "Td2EventSlot_pkey" PRIMARY KEY ("eventId","role")
);

-- CreateTable
CREATE TABLE "Td2Signup" (
    "eventId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Td2Role" NOT NULL,
    "status" "Td2SignupStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Td2Signup_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "Td2Report" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerNameLower" TEXT NOT NULL,
    "platform" "Td2Platform" NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "evidenceKeys" TEXT[],
    "status" "Td2ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "staffMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Td2Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumCategory" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ForumCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumThread" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAttachment" (
    "id" TEXT NOT NULL,
    "postId" INTEGER,
    "uploaderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Case_guildId_targetId_idx" ON "Case"("guildId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_guildId_number_key" ON "Case"("guildId", "number");

-- CreateIndex
CREATE INDEX "MemberLevel_guildId_xp_idx" ON "MemberLevel"("guildId", "xp" DESC);

-- CreateIndex
CREATE INDEX "Marriage_guildId_user2Id_idx" ON "Marriage"("guildId", "user2Id");

-- CreateIndex
CREATE UNIQUE INDEX "Marriage_guildId_user1Id_user2Id_key" ON "Marriage"("guildId", "user1Id", "user2Id");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Giveaway_messageId_key" ON "Giveaway"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePanel_messageId_key" ON "RolePanel"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Td2Activity_kind_name_key" ON "Td2Activity"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Td2ActivityMode_activityId_name_key" ON "Td2ActivityMode"("activityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Td2Event_messageId_key" ON "Td2Event"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Td2Report_staffMessageId_key" ON "Td2Report"("staffMessageId");

-- CreateIndex
CREATE INDEX "Td2Report_platform_playerNameLower_idx" ON "Td2Report"("platform", "playerNameLower");

-- CreateIndex
CREATE INDEX "Td2Report_guildId_status_idx" ON "Td2Report"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ForumCategory_slug_key" ON "ForumCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ForumAttachment_key_key" ON "ForumAttachment"("key");

-- CreateIndex
CREATE INDEX "ForumAttachment_postId_idx" ON "ForumAttachment"("postId");

-- AddForeignKey
ALTER TABLE "GuildConfig" ADD CONSTRAINT "GuildConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLevel" ADD CONSTRAINT "MemberLevel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanel" ADD CONSTRAINT "RolePanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanelOption" ADD CONSTRAINT "RolePanelOption_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "RolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2ActivityMode" ADD CONSTRAINT "Td2ActivityMode_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Td2Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2ModeSlot" ADD CONSTRAINT "Td2ModeSlot_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "Td2ActivityMode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2Event" ADD CONSTRAINT "Td2Event_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2Event" ADD CONSTRAINT "Td2Event_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "Td2ActivityMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2EventSlot" ADD CONSTRAINT "Td2EventSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Td2Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2Signup" ADD CONSTRAINT "Td2Signup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Td2Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Td2Report" ADD CONSTRAINT "Td2Report_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAttachment" ADD CONSTRAINT "ForumAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAttachment" ADD CONSTRAINT "ForumAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
