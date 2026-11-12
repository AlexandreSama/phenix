import { createCase, liftSanction, revokeCases, type Case, type CaseType } from '@phenix/database';
import { auditReason } from '@phenix/shared';
import type { ChatInputCommandInteraction, User } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { baseEmbed } from '../../core/embeds.js';
import { formatDuration } from '../../core/format.js';
import { CASE_COLORS, caseEmbed, caseLabel, NO_REASON } from './case-format.js';
import { actionEmbed, sendModLog } from './modlog.js';
import { notifyMember } from './notify.js';

export interface Sanction {
  type: CaseType;
  target: User;
  reason: string | null;
  durationMs?: number;
  /** Prévenir le membre en MP, avant l'action : après un kick ou un ban, le bot ne peut plus le joindre */
  notify: boolean;
  /** Lève d'abord les sanctions actives de ce type : un nouveau ban remplace l'ancien. Pas pour UNBAN et UNMUTE, qui passent par liftSanction */
  revokes?: CaseType;
  /** L'action Discord ; reçoit la raison à inscrire dans le journal d'audit du serveur */
  act?: (auditReason: string) => Promise<unknown>;
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

  await sanction.act?.(auditReason(moderator.username, sanction.reason));

  const record = await recordSanction(interaction, sanction, context);

  if (record) {
    await sendModLog(guild, caseEmbed(record), context);
  } else {
    // Rien à lever dans les cases (déjà levé depuis le site ou par une autre commande, ou posé à la
    // main sur Discord) : on garde quand même une trace de l'action dans le salon de logs
    await sendModLog(
      guild,
      actionEmbed(
        caseLabel(sanction.type),
        moderator,
        `${sanction.target} : aucune sanction active à lever dans les cases.` +
          (sanction.reason ? ` Raison : ${sanction.reason}` : ''),
      ),
      context,
    );
    // Sans salon de logs configuré, rien d'autre ne garde la décision : une ligne, sans la cible
    context.logger.info(
      { guildId: guild.id, type: sanction.type },
      'Sanction end with no active case',
    );
  }

  const embed = baseEmbed(CASE_COLORS[sanction.type])
    .setDescription(`**${caseLabel(sanction.type)}** · ${sanction.target}`)
    .addFields({ name: 'Raison', value: sanction.reason ?? NO_REASON });
  if (sanction.durationMs) {
    embed.addFields({ name: 'Durée', value: formatDuration(sanction.durationMs) });
  }
  const dm = sanction.notify ? (notified ? ' · prévenu en MP' : ' · MP impossible') : '';
  embed.setFooter({
    text: record ? `Case #${record.number}${dm}` : 'Aucune sanction active à lever dans les cases',
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Enregistre la sanction. Un débannissement ou une fin de sourdine passent par `liftSanction`, comme
 * la levée du site : une transaction idempotente, qui ne crée la sanction de fin que si quelque chose
 * a été levé (deux levées simultanées ne laissent pas de doublon). Les autres sanctions lèvent d'abord
 * celles qu'elles remplacent (un nouveau ban remplace l'ancien), puis créent leur case.
 */
async function recordSanction(
  interaction: ChatInputCommandInteraction<'cached'>,
  sanction: Sanction,
  context: BotContext,
): Promise<Case | null> {
  const { guild, user: moderator } = interaction;
  if (sanction.type === 'UNBAN' || sanction.type === 'UNMUTE') {
    const { record } = await liftSanction(context.db, {
      guildId: guild.id,
      guildName: guild.name,
      targetId: sanction.target.id,
      type: sanction.type === 'UNBAN' ? 'BAN' : 'MUTE',
      actorId: moderator.id,
      reason: sanction.reason,
      via: 'COMMAND',
    });
    return record;
  }

  if (sanction.revokes) {
    await revokeCases(context.db, {
      guildId: guild.id,
      targetId: sanction.target.id,
      type: sanction.revokes,
      revokedById: moderator.id,
    });
  }
  return createCase(context.db, {
    guildId: guild.id,
    guildName: guild.name,
    type: sanction.type,
    targetId: sanction.target.id,
    moderatorId: moderator.id,
    reason: sanction.reason,
    expiresAt: sanction.durationMs ? new Date(Date.now() + sanction.durationMs) : null,
  });
}
