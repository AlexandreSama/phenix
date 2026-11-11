-- CreateEnum
CREATE TYPE "DashboardModule" AS ENUM ('GENERAL', 'LEVELING', 'ROLES', 'TICKETS', 'GIVEAWAYS', 'TD2');

-- CreateEnum
CREATE TYPE "Td2Difficulty" AS ENUM ('NORMAL', 'HARD', 'CHALLENGING', 'HEROIC', 'LEGENDARY');

-- AlterEnum
ALTER TYPE "Td2Role" ADD VALUE 'PLAYER';

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "td2PublicListing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Td2Event" ADD COLUMN     "difficulty" "Td2Difficulty",
ADD COLUMN     "directives" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "missionName" TEXT,
ALTER COLUMN "modeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GuildDelegate" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "modules" "DashboardModule"[],
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildDelegate_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "Td2Directive" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Td2Directive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildDelegate_userId_idx" ON "GuildDelegate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Td2Directive_name_key" ON "Td2Directive"("name");

-- AddForeignKey
ALTER TABLE "GuildDelegate" ADD CONSTRAINT "GuildDelegate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les directives du jeu, une seule fois : renommables ensuite depuis l'administration
INSERT INTO "Td2Directive" ("name", "description") VALUES
                                                       ('Munitions comptées', 'Moins de munitions en réserve, chargeur entamé perdu, aucune munition au sol.'),
                                                       ('Compétences alternées', 'Quand une compétence est active, l’autre se met en recharge.'),
                                                       ('Brouillard de guerre', 'Plus de menaces ni d’indicateurs sur la mini-carte.'),
                                                       ('Sans régénération', 'La santé ne se régénère plus pendant les combats : seuls les soins la rendent.'),
                                                       ('Munitions spéciales', 'Les ennemis tirent des munitions à effet (feu, saignement, choc…) selon leur faction.')
ON CONFLICT ("name") DO NOTHING;