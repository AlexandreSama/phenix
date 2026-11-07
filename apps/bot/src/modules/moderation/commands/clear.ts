import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { refuse } from '../common.js';
import { actionEmbed, sendModLog } from '../modlog.js';

export const clear: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime les derniers messages du salon')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('nombre')
        .setDescription('Combien de messages (100 au plus)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((option) =>
      option.setName('membre').setDescription('Seulement les messages de ce membre'),
    ),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const { channel } = interaction;
    if (!channel) return refuse(interaction, 'Impossible de supprimer des messages ici.');

    const count = interaction.options.getInteger('nombre', true);
    const author = interaction.options.getUser('membre');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // On regarde les 100 derniers messages, puis on garde ceux du membre visé
    const recent = await channel.messages.fetch({ limit: 100 });
    const selected = [...recent.values()]
      .filter((message) => !author || message.author.id === author.id)
      .slice(0, count);

    // true : ignore les messages de plus de 14 jours, que Discord refuse de supprimer en masse
    const deleted = await channel.bulkDelete(selected, true);

    const skipped = selected.length - deleted.size;
    const plural = deleted.size > 1 ? 's' : '';
    let summary = `${deleted.size} message${plural} supprimé${plural}`;
    if (author) summary += ` de ${author}`;
    summary += ` dans ${channel}.`;
    if (skipped > 0) summary += ` ${skipped} trop ancien(s) pour être supprimé(s) en masse.`;

    await interaction.editReply(summary);
    if (deleted.size > 0) {
      await sendModLog(
        interaction.guild,
        actionEmbed('Messages supprimés', interaction.user, summary),
        context,
      );
    }
  },
};
