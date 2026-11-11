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

/** Les quatre blocs de l'embed, et le libellé de chaque ligne. */
export const STAT_BLOCKS: { name: string; lines: [Td2StatKey, string][] }[] = [
  {
    name: 'Niveau',
    lines: [
      ['level', 'Niveau'],
      ['gearScore', 'Score d’équipement'],
      ['specialization', 'Spécialisation'],
    ],
  },
  {
    name: 'Temps de jeu',
    lines: [
      ['timePlayed', 'Total'],
      ['timePve', 'PvE'],
      ['timeDarkZone', 'Dark Zone'],
    ],
  },
  {
    name: 'PvE',
    lines: [
      ['npcKills', 'Ennemis éliminés'],
      ['eliteKills', 'Élites'],
      ['namedKills', 'Nommés'],
      ['headshots', 'Tirs à la tête'],
    ],
  },
  {
    name: 'Dark Zone',
    lines: [
      ['dzRank', 'Rang'],
      ['roguesKilled', 'Renégats éliminés'],
      ['pvpKills', 'Agents éliminés'],
    ],
  },
];

/** L'embed de /td2 stats. Un bloc sans aucune stat n'est pas affiché. */
export function careerMessage(career: Td2Career, credit: string) {
  const embed = baseEmbed().setTitle(`${career.handle} · ${TD2_PLATFORM_LABELS[career.platform]}`);
  if (career.avatarUrl) embed.setThumbnail(career.avatarUrl);
  if (credit) embed.setFooter({ text: credit });

  for (const block of STAT_BLOCKS) {
    const lines = block.lines.flatMap(([key, label]) => {
      const stat = career.stats[key];
      return stat ? [`${label} : **${formatStat(stat)}**`] : [];
    });
    if (lines.length > 0) {
      embed.addFields({ name: block.name, value: lines.join('\n'), inline: true });
    }
  }
  if (!embed.data.fields?.length) {
    embed.setDescription('Aucune statistique publique pour cet agent.');
  }
  return { embeds: [embed] };
}
