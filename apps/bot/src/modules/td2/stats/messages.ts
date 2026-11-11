import { TD2_PLATFORM_LABELS } from '@phenix/shared';
import { baseEmbed } from '../../../core/embeds.js';
import type { Td2Career, Td2Stat, Td2StatKey } from './provider.js';

const numbers = new Intl.NumberFormat('fr-FR');

/** 123 456 secondes → « 34 h 17 min » ; moins d'une heure → « 42 min ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return `${numbers.format(hours)} h ${minutes % 60} min`;
}

export function formatStat(stat: Td2Stat): string {
  switch (stat.kind) {
    case 'number':
      return numbers.format(stat.value);
    case 'duration':
      return formatDuration(stat.seconds);
    case 'text':
      return stat.value;
    default: {
      const unhandled: never = stat;
      return unhandled;
    }
  }
}

/** Les lignes d'un bloc : le chiffre d'abord, puis le libellé complet. */
type StatLine = [Td2StatKey, (value: string) => string];

const TIME_LINES: StatLine[] = [
  ['timePlayed', (value) => `**${value}** au total`],
  ['timePve', (value) => `**${value}** en PvE`],
  ['timeDarkZone', (value) => `**${value}** en Dark Zone`],
];

const PVE_LINES: StatLine[] = [
  ['npcKills', (value) => `**${value}** ennemis éliminés`],
  ['eliteKills', (value) => `**${value}** élites`],
  ['namedKills', (value) => `**${value}** nommés`],
  ['headshots', (value) => `**${value}** tirs à la tête`],
];

const DARK_ZONE_LINES: StatLine[] = [
  ['dzRank', (value) => `Rang **${value}**`],
  ['roguesKilled', (value) => `**${value}** renégats éliminés`],
  ['pvpKills', (value) => `**${value}** agents éliminés`],
];

/** L'embed de /td2 stats. Un champ sans aucune stat n'est pas affiché. */
export function careerMessage(career: Td2Career, credit: string) {
  const { stats } = career;
  const embed = baseEmbed()
    .setAuthor({ name: `${TD2_PLATFORM_LABELS[career.platform]} · PROFIL D’AGENT`.toUpperCase() })
    .setTitle(career.handle);
  if (career.profileUrl) embed.setURL(career.profileUrl);
  if (career.avatarUrl) embed.setThumbnail(career.avatarUrl);
  if (credit) embed.setFooter({ text: credit });

  // niveau et score d'équipement en titre ###, la spécialisation dessous
  const headline = [
    stats.level && `Niveau ${formatStat(stats.level)}`,
    stats.gearScore && `Score d’équipement ${formatStat(stats.gearScore)}`,
  ].filter(Boolean);
  const description = [
    headline.length > 0 ? `### ${headline.join(' · ')}` : null,
    stats.specialization ? `🧬 Spécialisation : **${formatStat(stats.specialization)}**` : null,
  ].filter(Boolean);
  if (description.length > 0) embed.setDescription(description.join('\n'));

  const blocks: { name: string; lines: StatLine[]; inline: boolean }[] = [
    { name: '⏱️ Temps de jeu', lines: TIME_LINES, inline: false },
    { name: '🎯 PvE', lines: PVE_LINES, inline: true },
    { name: '☠️ Dark Zone', lines: DARK_ZONE_LINES, inline: true },
  ];
  for (const block of blocks) {
    const lines = block.lines.flatMap(([key, format]) => {
      const stat = stats[key];
      return stat ? [format(formatStat(stat))] : [];
    });
    if (lines.length > 0) {
      embed.addFields({ name: block.name, value: lines.join('\n'), inline: block.inline });
    }
  }
  if (description.length === 0 && !embed.data.fields?.length) {
    embed.setDescription('Aucune statistique publique pour cet agent.');
  }
  return { embeds: [embed] };
}
