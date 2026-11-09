import type { PrismaClient } from './generated/prisma/client.js';

export interface AnnounceTarget {
  guildId: string;
  channelId: string;
}

/**
 * Où envoyer un /broadcast : le salon d'annonces des serveurs qui en ont choisi un,
 * parmi ceux où le bot est encore présent.
 */
export async function findAnnounceChannels(
  db: Pick<PrismaClient, 'guildConfig'>,
  guildIds: string[],
): Promise<AnnounceTarget[]> {
  const rows = await db.guildConfig.findMany({
    where: { guildId: { in: guildIds }, announceChannelId: { not: null }, guild: { leftAt: null } },
    select: { guildId: true, announceChannelId: true },
    orderBy: { guildId: 'asc' },
  });
  return rows.flatMap(({ guildId, announceChannelId }) =>
    announceChannelId ? [{ guildId, channelId: announceChannelId }] : [],
  );
}
