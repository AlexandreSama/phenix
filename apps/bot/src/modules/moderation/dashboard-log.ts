import { findCaseById } from '@phenix/database';
import type { Client } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { caseEmbed } from './case-format.js';
import { actionEmbed, sendModLog } from './modlog.js';

/**
 * Publie dans le salon de logs une sanction levée depuis le site. L'API a déjà tout enregistré ; le
 * bot, seul à avoir ses embeds, ne fait que relire la sanction par son identifiant. L'événement ne
 * porte aucune donnée personnelle. Il n'est cru que si la base le confirme : un avertissement doit
 * avoir été retiré depuis le tableau de bord. Pour un UNBAN ou un UNMUTE, un événement rejoué sur
 * Valkey (réseau interne) republierait un log déjà publié : sans conséquence sur les personnes.
 */
export async function publishDashboardLog(
  client: Client,
  context: BotContext,
  event: { guildId: string; caseId: number },
): Promise<void> {
  const guild = client.guilds.cache.get(event.guildId);
  if (!guild) return;
  const record = await findCaseById(context.db, event.guildId, event.caseId);
  if (!record) {
    context.logger.warn('Moderation log skipped: case not found');
    return;
  }

  if (record.type === 'UNBAN' || record.type === 'UNMUTE') {
    await sendModLog(guild, caseEmbed(record), context);
    return;
  }
  // Un avertissement n'a pas de sanction de fin : on publie son retrait
  if (
    record.type === 'WARN' &&
    record.revokedVia === 'DASHBOARD' &&
    record.revokedAt &&
    record.revokedById
  ) {
    await sendModLog(
      guild,
      actionEmbed(
        'Avertissement retiré',
        `<@${record.revokedById}>`,
        `Avertissement #${record.number} retiré pour <@${record.targetId}> depuis le tableau de bord.`,
      ),
      context,
    );
  }
}
