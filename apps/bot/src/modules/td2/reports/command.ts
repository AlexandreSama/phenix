import {
  countRecentTd2Reports,
  createTd2Report,
  deleteTd2Report,
  listPlayerReports,
  markTd2ReportPosted,
} from '@phenix/database';
import { TD2_EVIDENCE_LIMITS, TD2_REPORT_REASONS, type Td2ReportReasonKey } from '@phenix/shared';
import {
  MessageFlags,
  PermissionFlagsBits,
  type Attachment,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { BotContext } from '../../../core/context.js';
import { describePublishError } from '../../../core/publish.js';
import { refuse } from '../../moderation/common.js';
import { canViewReports } from './access.js';
import { checkEvidence, storeEvidence, type StoredEvidence } from './evidence.js';
import { playerReportsMessage, reportStaffMessage } from './messages.js';
import { playerOptions, readPlayer } from '../player-options.js';

/** Au-delà, un membre attend : de quoi décourager une rafale de faux signalements. */
export const REPORTS_PER_HOUR = 5;

/** Ce dont le bot a besoin dans le salon du staff : écrire, et joindre les captures. */
const STAFF_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

export const REPORT_REPLIES = {
  closed:
    "Les signalements ne sont pas ouverts sur ce serveur : l'équipe doit choisir le salon du staff sur le site, onglet TD2.",
  staffUnreachable: (channelId: string) =>
    `Je ne peux pas écrire dans le salon du staff (<#${channelId}>) : il me faut « Voir le salon », ` +
    '« Envoyer des messages », « Intégrer des liens » et « Joindre des fichiers ».',
  tooMany: `Tu as déjà fait ${REPORTS_PER_HOUR} signalements dans l'heure. Réessaie plus tard.`,
  storageDown: "Les captures n'ont pas pu être enregistrées. Réessaie dans quelques minutes.",
  postFailed: (reason: string) => `Le signalement n'a pas pu être envoyé au staff : ${reason}.`,
  sent: (id: number, withEvidence: boolean) =>
    `Signalement #${id} envoyé au staff. Il sera examiné avant d'être partagé avec les autres serveurs.` +
    (withEvidence
      ? ''
      : '\nSans capture, il ne pourra pas être confirmé : ajoute-en une la prochaine fois.'),
  forbidden:
    "Seuls l'équipe du serveur et les rôles choisis sur le site consultent les signalements.",
} as const;

const REASON_CHOICES = (Object.keys(TD2_REPORT_REASONS) as Td2ReportReasonKey[]).map((value) => ({
  name: TD2_REPORT_REASONS[value],
  value,
}));

const requiredPlayer = playerOptions({ required: true, platform: 'La plateforme du joueur' });

/** /td2 signaler : plateforme, pseudo, motif, jusqu'à 3 captures, détails. */
export const reportSubcommand = (sub: SlashCommandSubcommandBuilder) => {
  requiredPlayer(
    sub.setName('signaler').setDescription('Signale un joueur au staff du serveur'),
  ).addStringOption((option) =>
    option
      .setName('motif')
      .setDescription('Ce qui s’est passé')
      .setRequired(true)
      .addChoices(...REASON_CHOICES),
  );
  for (const name of ['preuve', 'preuve2', 'preuve3']) {
    sub.addAttachmentOption((option) =>
      option.setName(name).setDescription("Une capture d'écran (8 Mo au plus)"),
    );
  }
  return sub.addStringOption((option) =>
    option
      .setName('détails')
      .setDescription('Le contexte, un lien vers une vidéo…')
      .setMaxLength(500),
  );
};

/** /td2 signalements : plateforme et pseudo. */
export const lookupSubcommand = (sub: SlashCommandSubcommandBuilder) =>
  requiredPlayer(
    sub.setName('signalements').setDescription('Les signalements d’un joueur sur le réseau'),
  );

export async function reportPlayer(
  interaction: ChatInputCommandInteraction<'cached'>,
  { db, configs, evidence, logger }: BotContext,
): Promise<void> {
  const settings = await configs.get(interaction.guildId);
  const staffChannelId = settings?.td2ReportChannelId;
  if (!staffChannelId) return refuse(interaction, REPORT_REPLIES.closed);

  const attachments = ['preuve', 'preuve2', 'preuve3']
    .map((name) => interaction.options.getAttachment(name))
    .filter((attachment): attachment is Attachment => attachment !== null)
    .slice(0, TD2_EVIDENCE_LIMITS.maxFiles);
  const invalid = checkEvidence(attachments);
  if (invalid) return refuse(interaction, invalid);

  const since = new Date(Date.now() - 3_600_000);
  const recent = await countRecentTd2Reports(db, {
    guildId: interaction.guildId,
    reporterId: interaction.user.id,
    since,
  });
  if (recent >= REPORTS_PER_HOUR) return refuse(interaction, REPORT_REPLIES.tooMany);

  const channel =
    interaction.guild.channels.cache.get(staffChannelId) ??
    (await interaction.guild.channels.fetch(staffChannelId).catch(() => null));
  const me = interaction.guild.members.me;
  if (!channel?.isSendable() || !me || !channel.permissionsFor(me).has(STAFF_PERMISSIONS)) {
    return refuse(interaction, REPORT_REPLIES.staffUnreachable(staffChannelId));
  }

  // Télécharger les captures peut dépasser les 3 secondes qu'accorde Discord
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let stored: StoredEvidence[];
  try {
    stored = await storeEvidence(evidence, interaction.guildId, attachments);
  } catch (err) {
    logger.warn({ err, guildId: interaction.guildId }, 'Preuves impossibles à enregistrer');
    await interaction.editReply(REPORT_REPLIES.storageDown);
    return;
  }

  const evidenceKeys = stored.map((entry) => entry.key);
  const report = await createTd2Report(db, {
    guildId: interaction.guildId,
    reporterId: interaction.user.id,
    ...readPlayer(interaction),
    reason: interaction.options.getString('motif', true),
    details: interaction.options.getString('détails')?.trim() || null,
    evidenceKeys,
  }).catch(async (err: unknown) => {
    // Base indisponible : les captures déjà rangées ne serviraient à rien
    await evidence.delete(evidenceKeys).catch(() => undefined);
    throw err;
  });

  try {
    const message = await channel.send(reportStaffMessage(report, stored));
    await markTd2ReportPosted(db, report.id, message.id);
  } catch (err) {
    // Sans message dans le salon du staff, personne ne l'examinerait : on n'en garde rien
    await deleteTd2Report(db, report.id);
    await evidence.delete(report.evidenceKeys).catch(() => undefined);
    await interaction.editReply(REPORT_REPLIES.postFailed(describePublishError(err)));
    return;
  }

  logger.info({ guildId: interaction.guildId, reportId: report.id }, 'Signalement TD2 reçu');
  await interaction.editReply(REPORT_REPLIES.sent(report.id, stored.length > 0));
}

export async function lookupPlayer(
  interaction: ChatInputCommandInteraction<'cached'>,
  { db, configs }: BotContext,
): Promise<void> {
  const settings = await configs.get(interaction.guildId);
  if (!canViewReports(interaction.member, settings)) {
    return refuse(interaction, REPORT_REPLIES.forbidden);
  }
  const player = readPlayer(interaction);
  const reports = await listPlayerReports(db, { ...player, viewerGuildId: interaction.guildId });
  await interaction.reply({
    ...playerReportsMessage(player, reports),
    flags: MessageFlags.Ephemeral,
  });
}
