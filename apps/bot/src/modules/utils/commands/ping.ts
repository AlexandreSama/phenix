import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';

export const ping: SlashCommand = {
  category: 'utils',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifie que le bot répond et mesure sa latence')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.reply('Pong…');
    const reply = await interaction.fetchReply();
    const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
    const websocket = interaction.client.ws.ping;

    await interaction.editReply(
      `Pong ! Aller-retour : **${roundTrip} ms** · WebSocket : **${websocket >= 0 ? `${websocket} ms` : 'en cours de mesure'}**`,
    );
  },
};
