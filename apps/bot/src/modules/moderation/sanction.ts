import { createCase, revokeCases, type CaseType } from '@phenix/database';
import type { ChatInputCommandInteraction, User } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { baseEmbed } from '../../core/embeds.js';
import { formatDuration } from '../../core/format.js';
import { CASE_COLORS, caseEmbed, caseLabel, NO_REASON } from './case-format.js';
import { sendModLog } from './modlog.js';
import { notifyMember } from './notify.js';

export interface Sanction {
  type: CaseType;
  target: User;
  reason: string | null;
  durationMs?: number;
  /** Prévenir le membre en MP, avant l'action : après un kick ou un ban, le bot ne peut plus le joindre */
  notify: boolean;
  /** Lève d'abord les sanctions actives de ce type : un unban lève le ban, un nouveau ban remplace l'ancien */
  revokes?: CaseType;
  /** L'action Discord ; reçoit la raison à inscrire dans le journal d'audit du serveur */
  act?: (auditReason: string) => Promise<unknown>;
}

export function auditReason(moderator: User, reason: string | null): string {
  return `${moderator.username} : ${reason ?? NO_REASON}`.slice(0, 512);
}

/** Le déroulé commun à toutes les sanctions : MP, action Discord, case numérotée, log, réponse. */
export async function applySanction(
  interaction: ChatInputCommandInteraction<'cached'>,
  sanction: Sanction,
  context: BotContext,
): Promise<void> {
  const { guild, user: moderator } = interaction;
  // MP, Discord et base à la suite : plus de 3 secondes possibles
  await interaction.deferReply();

  const notified = sanction.notify
    ? await notifyMember(sanction.target, {
        guildName: guild.name,
        type: sanction.type,
        reason: sanction.reason,
        durationMs: sanction.durationMs,
      })
    : false;

  await sanction.act?.(auditReason(moderator, sanction.reason));

  if (sanction.revokes) {
    await revokeCases(context.db, {
      guildId: guild.id,
      targetId: sanction.target.id,
      type: sanction.revokes,
      revokedById: moderator.id,
    });
  }

  const record = await createCase(context.db, {
    guildId: guild.id,
    guildName: guild.name,
    type: sanction.type,
    targetId: sanction.target.id,
    moderatorId: moderator.id,
    reason: sanction.reason,
    expiresAt: sanction.durationMs ? new Date(Date.now() + sanction.durationMs) : null,
  });

  await sendModLog(guild, caseEmbed(record), context);

  const embed = baseEmbed(CASE_COLORS[record.type])
    .setDescription(`**${caseLabel(record.type)}** · ${sanction.target}`)
    .addFields({ name: 'Raison', value: record.reason ?? NO_REASON });
  if (sanction.durationMs) {
    embed.addFields({ name: 'Durée', value: formatDuration(sanction.durationMs) });
  }
  const dm = sanction.notify ? (notified ? ' · prévenu en MP' : ' · MP impossible') : '';
  embed.setFooter({ text: `Case #${record.number}${dm}` });

  await interaction.editReply({ embeds: [embed] });
}
