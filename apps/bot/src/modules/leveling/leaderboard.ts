import { getLeaderboard, type LeaderboardSlice } from '@phenix/database';
import { LEADERBOARD_PAGE_SIZE } from '@phenix/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
  type EmbedBuilder,
} from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed } from '../../core/embeds.js';
import { formatNumber } from './rank-card.js';
import { levelingSettings } from './xp.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function leaderboardLine(entry: LeaderboardSlice['entries'][number]): string {
  const place = MEDALS[entry.rank - 1] ?? `**${entry.rank}.**`;
  const name = escapeMarkdown(entry.displayName ?? 'Membre parti');
  return `${place} ${name} · niveau ${entry.level} · ${formatNumber(entry.xp)} XP`;
}

const pageButton = (target: number, label: string, disabled: boolean) =>
    new ButtonBuilder()
        .setCustomId(buildCustomId('leaderboard', 'page', target))
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

export interface LeaderboardView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Le message de /leaderboard : une page et ses boutons. Partagé par la commande et les boutons. */
export function leaderboardView(
    guildName: string,
    slice: LeaderboardSlice,
    fullPageUrl?: string,
): LeaderboardView {
  const embed = baseEmbed()
      .setTitle(`Classement de ${guildName}`)
      .setDescription(
          slice.entries.length > 0
              ? slice.entries.map(leaderboardLine).join('\n')
              : "Personne n'a encore gagné d'XP. Le premier message ouvre le bal !",
      )
      .setFooter({ text: `${formatNumber(slice.total)} membres classés` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      pageButton(slice.page - 1, '◀', slice.page <= 1),
      new ButtonBuilder()
          .setCustomId(buildCustomId('leaderboard', 'current'))
          .setLabel(`Page ${slice.page} / ${slice.pageCount}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      pageButton(slice.page + 1, '▶', slice.page >= slice.pageCount),
  );
  if (fullPageUrl) {
    row.addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Classement complet')
            .setURL(fullPageUrl),
    );
  }
  return { embeds: [embed], components: [row] };
}

/** Lien vers la page publique du site, si le site est déployé et le classement public. */
export async function fullLeaderboardUrl(
    guildId: string,
    { configs, publicUrl }: BotContext,
): Promise<string | undefined> {
  if (!publicUrl) return undefined;
  const settings = levelingSettings(await configs.get(guildId));
  return settings.leaderboardPublic ? `${publicUrl}/classement/${guildId}` : undefined;
}

export async function buildLeaderboard(
    guild: { id: string; name: string },
    page: number,
    context: BotContext,
): Promise<LeaderboardView> {
  const [slice, url] = await Promise.all([
    getLeaderboard(context.db, guild.id, page, LEADERBOARD_PAGE_SIZE.bot),
    fullLeaderboardUrl(guild.id, context),
  ]);
  return leaderboardView(guild.name, slice, url);
}

/** Boutons ◀ ▶ : n'importe qui peut tourner les pages, le message est le même pour tous. */
export const leaderboardPageButton: ComponentHandler = {
  prefix: 'leaderboard:page',
  async execute(interaction, id, context) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const page = Number(id);
    if (!Number.isInteger(page)) return;
    await interaction.update(await buildLeaderboard(interaction.guild, page, context));
  },
};