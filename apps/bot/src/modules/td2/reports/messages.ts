import type { Td2PlayerReport, Td2Report } from '@phenix/database';
import {
  TD2_PLATFORM_LABELS,
  TD2_REPORT_REASONS,
  TD2_REPORT_STATUS_LABELS,
  type Td2PlatformKey,
  type Td2ReportReasonKey,
} from '@phenix/shared';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  time,
  TimestampStyles,
  type ColorResolvable,
  type EmbedBuilder,
} from 'discord.js';
import { buildCustomId } from '../../../core/custom-id.js';
import { baseEmbed, COLORS } from '../../../core/embeds.js';
import type { StoredEvidence } from './evidence.js';

export const STATUS_ICONS = {
  PENDING: '⏳',
  IN_REVIEW: '🔎',
  CONFIRMED: '✅',
  REJECTED: '🚫',
} as const satisfies Record<Td2Report['status'], string>;

const STATUS_COLORS: Record<Td2Report['status'], ColorResolvable> = {
  PENDING: COLORS.warning,
  IN_REVIEW: COLORS.primary,
  CONFIRMED: COLORS.danger,
  REJECTED: '#80848E',
};

export const reviewCustomId = (id: number) => buildCustomId('td2report', 'review', id);
export const confirmCustomId = (id: number) => buildCustomId('td2report', 'confirm', id);
export const rejectCustomId = (id: number) => buildCustomId('td2report', 'reject', id);

/** Un motif enregistré hors de la liste (une ancienne valeur) s'affiche tel quel. */
export const reasonLabel = (reason: string) =>
  TD2_REPORT_REASONS[reason as Td2ReportReasonKey] ?? reason;

/** « **Agent47** · PlayStation » */
export const playerLine = (report: { playerName: string; platform: Td2PlatformKey }) =>
  `**${report.playerName}** · ${TD2_PLATFORM_LABELS[report.platform]}`;

type StaffView = Pick<
  Td2Report,
  | 'id'
  | 'playerName'
  | 'platform'
  | 'reason'
  | 'details'
  | 'status'
  | 'reporterId'
  | 'reviewedById'
  | 'reviewedAt'
  | 'evidenceKeys'
  | 'createdAt'
>;

const evidenceText = (count: number) =>
  count === 0
    ? 'Aucune : il ne pourra pas être confirmé'
    : `${count} capture${count > 1 ? 's' : ''}, sous ce message`;

/**
 * Le message du signalement dans le salon du staff d'origine, régénéré à chaque examen.
 * Les captures sont jointes au premier envoi ; une édition sans `files` les garde.
 */
export function reportStaffMessage(
  report: StaffView,
  evidence: readonly StoredEvidence[] = [],
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files?: AttachmentBuilder[];
} {
  const lines = [
    playerLine(report),
    report.reviewedById && report.reviewedAt
      ? `Examiné par <@${report.reviewedById}> ${time(report.reviewedAt, TimestampStyles.RelativeTime)}`
      : '',
    report.status === 'CONFIRMED' ? 'Partagé avec les autres serveurs du réseau.' : '',
  ].filter(Boolean);

  const embed = baseEmbed(STATUS_COLORS[report.status])
    .setTitle(
      `${STATUS_ICONS[report.status]} Signalement #${report.id} · ${TD2_REPORT_STATUS_LABELS[report.status]}`,
    )
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Motif', value: reasonLabel(report.reason), inline: true },
      {
        name: 'Signalé par',
        value: `<@${report.reporterId}> ${time(report.createdAt, TimestampStyles.RelativeTime)}`,
        inline: true,
      },
      { name: 'Preuves', value: evidenceText(report.evidenceKeys.length) },
    );
  if (report.details) embed.addFields({ name: 'Détails', value: report.details.slice(0, 1024) });

  // Confirmé : la décision est partie dans le fil du réseau, elle ne se change plus ici
  const components =
    report.status === 'CONFIRMED'
      ? []
      : [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(reviewCustomId(report.id))
              .setLabel(report.status === 'REJECTED' ? 'Rouvrir' : 'Examiner')
              .setEmoji('🔎')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(report.status === 'IN_REVIEW'),
            new ButtonBuilder()
              .setCustomId(confirmCustomId(report.id))
              .setLabel('Confirmer')
              .setStyle(ButtonStyle.Success)
              .setDisabled(report.evidenceKeys.length === 0),
            new ButtonBuilder()
              .setCustomId(rejectCustomId(report.id))
              .setLabel('Rejeter')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(report.status === 'REJECTED'),
          ),
        ];

  const files = evidence.map(
    (entry) => new AttachmentBuilder(Buffer.from(entry.bytes), { name: entry.fileName }),
  );
  return { embeds: [embed], components, ...(files.length > 0 && { files }) };
}

/** L'annonce d'un signalement confirmé, dans le fil de chaque serveur. Jamais l'auteur, jamais les captures. */
export function reportFeedMessage(
  report: Pick<
    Td2Report,
    'id' | 'playerName' | 'platform' | 'reason' | 'details' | 'reviewedAt' | 'createdAt'
  > & { guild: { name: string } },
): { embeds: EmbedBuilder[] } {
  const embed = baseEmbed(COLORS.danger)
    .setTitle(`⚠️ Joueur signalé : ${report.playerName}`)
    .addFields(
      { name: 'Plateforme', value: TD2_PLATFORM_LABELS[report.platform], inline: true },
      { name: 'Motif', value: reasonLabel(report.reason), inline: true },
      {
        name: 'Confirmé par',
        value: `le staff de ${report.guild.name}, ${time(report.reviewedAt ?? report.createdAt, TimestampStyles.LongDate)}`,
      },
    )
    .setFooter({ text: `Signalement #${report.id} · preuves vérifiées par le staff d'origine` });
  if (report.details) embed.addFields({ name: 'Détails', value: report.details.slice(0, 1024) });
  return { embeds: [embed] };
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** La réponse de /td2 signalements : ce que ce serveur a le droit de voir d'un joueur. */
export function playerReportsMessage(
  player: { playerName: string; platform: Td2PlatformKey },
  reports: readonly Td2PlayerReport[],
): { embeds: EmbedBuilder[] } {
  const confirmed = reports.filter((report) => report.status === 'CONFIRMED').length;
  const embed = baseEmbed(confirmed > 0 ? COLORS.danger : COLORS.primary).setTitle(
    `Signalements · ${player.playerName} (${TD2_PLATFORM_LABELS[player.platform]})`,
  );

  if (reports.length === 0) {
    return { embeds: [embed.setDescription('Aucun signalement pour ce joueur sur le réseau.')] };
  }

  embed.setDescription(
    `${plural(reports.length, 'signalement')}, dont ${plural(confirmed, 'confirmé')}. ` +
      'Un signalement non vérifié n’a pas encore été examiné par le staff de son serveur.',
  );
  embed.addFields(
    reports.map((report) => {
      const origin = report.own ? 'ce serveur' : report.guildName;
      const lines = [
        `Sur ${origin}${report.reporterId ? `, par <@${report.reporterId}>` : ''}, ${time(report.createdAt, TimestampStyles.ShortDate)} · #${report.id}`,
        report.details ? report.details.slice(0, 200) : '',
      ].filter(Boolean);
      return {
        // Pas d'horodatage Discord dans un nom de champ : il ne s'y affiche pas, la date va dessous
        name: `${STATUS_ICONS[report.status]} ${TD2_REPORT_STATUS_LABELS[report.status]} · ${reasonLabel(report.reason)}`,
        value: lines.join('\n'),
      };
    }),
  );
  return { embeds: [embed] };
}
