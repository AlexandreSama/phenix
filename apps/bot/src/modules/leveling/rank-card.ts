import type { MemberRank } from '@phenix/database';
import { levelProgress } from '@phenix/shared';
import type { EmbedBuilder } from 'discord.js';
import { baseEmbed } from '../../core/embeds.js';

/** Nombre à la française : 12 345. */
export const formatNumber = (value: number) => value.toLocaleString('fr-FR');

/** Barre de progression en texte : ▰▰▰▰▱▱▱▱▱▱ */
export function progressBar(ratio: number, size = 12): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

interface RankCardInput {
  rank: Pick<MemberRank, 'xp' | 'messages' | 'rank' | 'total'>;
  displayName: string;
  avatarUrl: string;
}

/** La carte de /rank : niveau, place, et ce qu'il reste jusqu'au niveau suivant. */
export function rankEmbed({ rank, displayName, avatarUrl }: RankCardInput): EmbedBuilder {
  const progress = levelProgress(rank.xp);
  return baseEmbed()
    .setAuthor({ name: displayName, iconURL: avatarUrl })
    .setThumbnail(avatarUrl)
    .addFields(
      { name: 'Niveau', value: `**${progress.level}**`, inline: true },
      {
        name: 'Classement',
        value: `**#${rank.rank}** sur ${formatNumber(rank.total)}`,
        inline: true,
      },
      { name: 'XP totale', value: formatNumber(rank.xp), inline: true },
      {
        name: `Vers le niveau ${progress.level + 1}`,
        value: `${progressBar(progress.ratio)}  ${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP`,
      },
    )
    .setFooter({ text: `${formatNumber(rank.messages)} messages comptés` });
}
