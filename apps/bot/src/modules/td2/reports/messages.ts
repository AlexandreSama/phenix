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
  REJECTED: COLORS.neutral,
};

/** Le texte du membre en citation : on voit que ce n'est pas celui du bot. */
const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** Les trois étapes de l'examen ; le statut stocké dit laquelle est atteinte, rien d'autre. */
const STAGES = ['⏳ Reçu', '🔎 Examen', '⚖️ Décision'] as const;
const STAGE_REACHED: Record<Td2Report['status'], number> = {
  PENDING: 0,
  IN_REVIEW: 1,
  CONFIRMED: 2,
  REJECTED: 2,
};
const timeline = (status: Td2Report['status']) =>
  STAGES.map((stage, index) => (index === STAGE_REACHED[status] ? `**${stage}**` : stage)).join(
    ' ─ ',
  );

export const reviewCustomId = (id: number) => buildCustomId('td2report', 'review', id);
export const confirmCustomId = (id: number) => buildCustomId('td2report', 'confirm', id);
export const rejectCustomId = (id: number) => buildCustomId('td2report', 'reject', id);

/** Un motif enregistré hors de la liste (une ancienne valeur) s'affiche tel quel. */
export const reasonLabel = (reason: string) =>
  TD2_REPORT_REASONS[reason as Td2ReportReasonKey] ?? reason;

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

/** « Confirmer » est grisé sans capture (bouton) et refusé par la base : la mention est exacte. */
const evidenceText = (count: number, status: Td2Report['status']) => {
  if (count > 0) return `📎 ${count} capture${count > 1 ? 's' : ''}`;
  return status === 'CONFIRMED' ? '📎 Aucune' : '📎 Aucune, confirmation impossible';
};

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
    `-# ${TD2_PLATFORM_LABELS[report.platform]}`,
    timeline(report.status),
    report.reviewedById && report.reviewedAt
      ? `-# Examiné par <@${report.reviewedById}> ${time(report.reviewedAt, TimestampStyles.RelativeTime)}`
      : '',
    report.status === 'CONFIRMED' ? '-# Partagé avec les autres serveurs du réseau.' : '',
  ].filter(Boolean);

  const embed = baseEmbed(STATUS_COLORS[report.status])
    .setAuthor({
      name: `${STATUS_ICONS[report.status]} ${TD2_REPORT_STATUS_LABELS[report.status].toUpperCase()} · SIGNALEMENT #${report.id}`,
    })
    .setTitle(report.playerName)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Motif', value: `🎯 ${reasonLabel(report.reason)}`, inline: true },
      {
        name: 'Preuves',
        value: evidenceText(report.evidenceKeys.length, report.status),
        inline: true,
      },
      {
        name: 'Signalé par',
        value: `<@${report.reporterId}>\n-# ${time(report.createdAt, TimestampStyles.RelativeTime)}`,
        inline: true,
      },
    )
    .setTimestamp(report.createdAt);
  if (report.evidenceKeys.length > 0) embed.setFooter({ text: 'Captures jointes sous ce message' });
  if (report.details) {
    embed.addFields({ name: 'Détails', value: quote(report.details).slice(0, 1024) });
  }

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
    .setAuthor({ name: '⚠️ ALERTE RÉSEAU · CONFIRMÉ' })
    .setTitle(report.playerName)
    .setDescription(
      `Signalé pour **${reasonLabel(report.reason)}** sur **${TD2_PLATFORM_LABELS[report.platform]}**.\n` +
        `-# Confirmé par le staff de ${report.guild.name} · ${time(report.reviewedAt ?? report.createdAt, TimestampStyles.LongDate)}`,
    )
    .setFooter({ text: `Signalement #${report.id} · preuves vérifiées par le staff d'origine` });
  if (report.details) {
    embed.addFields({ name: 'Détails', value: quote(report.details).slice(0, 1024) });
  }
  return { embeds: [embed] };
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Trois niveaux : au moins un confirmé, du non décidé seulement, ou rien (les rejetés ne comptent pas). */
function verdict(reports: readonly Td2PlayerReport[]) {
  if (reports.some((report) => report.status === 'CONFIRMED')) {
    return { title: '🔴 À surveiller', color: COLORS.danger };
  }
  if (reports.some((report) => report.status === 'PENDING' || report.status === 'IN_REVIEW')) {
    return { title: '🟡 À vérifier', color: COLORS.warning };
  }
  return { title: '🟢 Rien à signaler', color: COLORS.success };
}

/** La réponse de /td2 signalements : ce que ce serveur a le droit de voir d'un joueur. */
export function playerReportsMessage(
  player: { playerName: string; platform: Td2PlatformKey },
  reports: readonly Td2PlayerReport[],
): { embeds: EmbedBuilder[] } {
  const { title, color } = verdict(reports);
  const embed = baseEmbed(color)
    .setAuthor({ name: '🔍 HISTORIQUE RÉSEAU' })
    .setTitle(`${player.playerName} · ${TD2_PLATFORM_LABELS[player.platform]}`);

  if (reports.length === 0) {
    return {
      embeds: [
        embed.setDescription(`### ${title}\n-# Aucun signalement pour ce joueur sur le réseau.`),
      ],
    };
  }

  const count = (statuses: readonly Td2Report['status'][]) =>
    reports.filter((report) => statuses.includes(report.status)).length;
  // « En cours d'examen » compte avec « non vérifié » : la décision n'est pas prise
  const pills = [
    { n: count(['CONFIRMED']), word: 'confirmé' },
    { n: count(['PENDING', 'IN_REVIEW']), word: 'non vérifié' },
    { n: count(['REJECTED']), word: 'rejeté' },
  ]
    .filter(({ n }) => n > 0)
    .map(({ n, word }) => `\`${plural(n, word)}\``);

  embed.setDescription(
    `### ${title}\n${pills.join(' ')}\n` +
      '-# Un signalement non vérifié n’a pas encore été examiné par le staff de son serveur.',
  );
  // Les confirmés d'abord ; à statut égal, l'ordre reçu (le plus récent en premier)
  const ordered = reports.toSorted(
    (a, b) => Number(b.status === 'CONFIRMED') - Number(a.status === 'CONFIRMED'),
  );
  embed.addFields(
    ordered.map((report) => {
      const source = [
        report.own ? 'Ce serveur' : report.guildName,
        report.reporterId ? `<@${report.reporterId}>` : '',
        time(report.createdAt, TimestampStyles.ShortDate),
        `#${report.id}`,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        // Pas d'horodatage Discord dans un nom de champ : il ne s'y affiche pas, la date va dessous
        name: `${STATUS_ICONS[report.status]} ${TD2_REPORT_STATUS_LABELS[report.status]} · ${reasonLabel(report.reason)}`,
        value: [`-# ${source}`, report.details ? quote(report.details.slice(0, 200)) : '']
          .filter(Boolean)
          .join('\n'),
      };
    }),
  );
  return { embeds: [embed] };
}
