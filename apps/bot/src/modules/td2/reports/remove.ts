import type { Client } from 'discord.js';
import type { GuildConfigCache } from '../../../core/guild-config-cache.js';
import { deleteMessageQuietly } from '../../../core/publish.js';
import type { Logger } from '../../../logger.js';

/**
 * Un signalement supprimé depuis la page d'administration : son embed quitte le salon du staff
 * d'origine. Le salon n'est pas enregistré avec le signalement ; c'est celui des réglages
 * actuels. Si le staff en a changé depuis, l'ancien message reste, sans effet : ses boutons
 * répondent « supprimé ».
 */
export async function removeReportStaffMessage(
    client: Client,
    configs: GuildConfigCache,
    { guildId, messageId }: { guildId: string; messageId: string },
    logger: Pick<Logger, 'warn'>,
): Promise<void> {
    const channelId = (await configs.get(guildId))?.td2ReportChannelId;
    if (!channelId) return;
    await deleteMessageQuietly(client, { channelId, messageId }, logger);
}