import { Events, type Client } from 'discord.js';
import type { PrismaClient } from '@phenix/database';
import type { Logger } from '../logger.js';

type Db = Pick<PrismaClient, 'guild'>;
type GuildLike = { id: string; name: string };

/** Crée ou réactive un serveur, avec sa config par défaut. */
export async function upsertGuild(db: Db, guild: GuildLike): Promise<void> {
  await db.guild.upsert({
    where: { id: guild.id },
    update: { name: guild.name, leftAt: null },
    create: {
      id: guild.id,
      name: guild.name,
      config: {
        create: { staffRoleIds: [], ticketStaffRoleIds: [], td2ReportViewerRoleIds: [] },
      },
    },
  });
}

/** Marque un serveur comme quitté, sans effacer ses données (RGPD : suppression différée). */
export async function markGuildLeft(db: Db, guildId: string): Promise<void> {
  await db.guild.updateMany({
    where: { id: guildId, leftAt: null },
    data: { leftAt: new Date() },
  });
}

/** Au démarrage : aligne la base sur les serveurs réellement rejoints, le bot a pu bouger hors ligne. */
export async function syncGuilds(db: Db, current: GuildLike[]): Promise<void> {
  for (const guild of current) await upsertGuild(db, guild);
  await db.guild.updateMany({
    where: { leftAt: null, id: { notIn: current.map((guild) => guild.id) } },
    data: { leftAt: new Date() },
  });
}

export function registerGuildEvents(client: Client, db: Db, logger: Logger): void {
  client.on(Events.GuildCreate, (guild) => {
    upsertGuild(db, guild)
      .then(() => logger.info({ guildId: guild.id, name: guild.name }, 'Serveur rejoint'))
      .catch((err: unknown) => logger.error({ err, guildId: guild.id }, 'Échec : serveur rejoint'));
  });

  client.on(Events.GuildDelete, (guild) => {
    markGuildLeft(db, guild.id)
      .then(() => logger.info({ guildId: guild.id }, 'Serveur quitté'))
      .catch((err: unknown) => logger.error({ err, guildId: guild.id }, 'Échec : serveur quitté'));
  });
}
