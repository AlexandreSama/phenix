-- Migration de données : les tickets passent de « une catégorie et des rôles par serveur »
-- (GuildConfig.ticketCategoryId, ticketStaffRoleIds) à des types de ticket (TicketType).
-- Les anciennes colonnes sont gardées, mais ne sont plus lues.
-- Idempotente : un serveur qui a déjà un type n'est pas retouché, un second passage ne change rien.

-- 1. Un type par serveur configuré qui n'en a pas encore : nom = ancien texte du bouton du panel
--    (« Support » à défaut), emoji = celui qui était codé en dur sur le bouton, catégorie et rôles
--    recopiés. Le panel de ces serveurs repasse « en attente » : le bot le republie au démarrage
--    (message conservé, il est modifié sur place) avec le nouveau bouton ou menu.
WITH created AS (
    INSERT INTO "TicketType" ("guildId", "name", "emoji", "categoryId", "staffRoleIds", "position", "updatedAt")
    SELECT
        c."guildId",
        COALESCE(NULLIF(btrim(p."buttonLabel"), ''), 'Support'),
        '🎫',
        c."ticketCategoryId",
        c."ticketStaffRoleIds",
        0,
        CURRENT_TIMESTAMP
    FROM "GuildConfig" c
    LEFT JOIN "TicketPanel" p ON p."guildId" = c."guildId"
    WHERE c."ticketCategoryId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "TicketType" t WHERE t."guildId" = c."guildId")
    RETURNING "guildId"
)
UPDATE "TicketPanel"
SET "publishedAt" = NULL, "publishError" = NULL
WHERE "guildId" IN (SELECT "guildId" FROM created);

-- 2. Les tickets existants sans type sont rattachés au premier type de leur serveur
--    (celui créé ci-dessus ; un serveur sans type garde ses tickets sans type).
UPDATE "Ticket" tk
SET "typeId" = (
    SELECT MIN(ty."id") FROM "TicketType" ty WHERE ty."guildId" = tk."guildId"
)
WHERE tk."typeId" IS NULL
  AND EXISTS (SELECT 1 FROM "TicketType" ty WHERE ty."guildId" = tk."guildId");
