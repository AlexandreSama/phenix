import type { RolePanelWithOptions } from '@phenix/database';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from 'discord.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed } from '../../core/embeds.js';

/** Discord range au plus 5 boutons par ligne. */
const BUTTONS_PER_ROW = 5;

export const PANEL_FOOTER = {
  MULTIPLE: 'Clique pour prendre un rôle, reclique pour le retirer.',
  UNIQUE: 'Un seul rôle à la fois : en choisir un retire le précédent.',
} as const;

/**
 * Le customId porte le panel et le rôle, pas l'ID de la ligne « option » :
 * réécrire les boutons sur le site ne casse pas un message déjà posté.
 */
export const toggleCustomId = (panelId: number, roleId: string) =>
  buildCustomId('rolepanel', 'toggle', `${panelId}.${roleId}`);

export interface PanelMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function rolePanelMessage(panel: RolePanelWithOptions): PanelMessage {
  const embed = baseEmbed().setTitle(panel.title).setFooter({ text: PANEL_FOOTER[panel.mode] });
  if (panel.description) embed.setDescription(panel.description);

  const buttons = panel.options.map((option) => {
    const button = new ButtonBuilder()
      .setCustomId(toggleCustomId(panel.id, option.roleId))
      .setLabel(option.label)
      .setStyle(ButtonStyle.Secondary);
    return option.emoji ? button.setEmoji(option.emoji) : button;
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < buttons.length; start += BUTTONS_PER_ROW) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.slice(start, start + BUTTONS_PER_ROW),
      ),
    );
  }
  return { embeds: [embed], components };
}
