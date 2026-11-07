import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  OAuth2Scopes,
  SlashCommandBuilder,
} from 'discord.js';
import { BOT_PERMISSIONS } from '../../../client.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed } from '../../../core/embeds.js';

export const botinvite: SlashCommand = {
  category: 'utils',
  data: new SlashCommandBuilder()
    .setName('botinvite')
    .setDescription('Donne le lien pour inviter le bot sur un autre serveur')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const url = interaction.client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: BOT_PERMISSIONS,
    });

    const button = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Inviter le bot')
      .setURL(url);

    await interaction.reply({
      embeds: [baseEmbed().setDescription('Ajoute le bot à ton serveur en un clic.')],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    });
  },
};
