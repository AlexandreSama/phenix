import { InteractionContextType, MessageFlags, SlashCommandBuilder, type User } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed, COLORS } from '../../../core/embeds.js';
import { createNekosBestProvider, type GifCategory, type GifProvider } from '../gifs.js';

interface ActionConfig {
  name: string;
  description: string;
  gif: GifCategory;
  phrase: (author: User, target: User) => string;
  /** Phrase quand on se cible soi-même ; absente = interdit. */
  selfPhrase?: (author: User) => string;
}

/** Fabrique une commande d'action (câlin, coup de poing…) : un membre ciblé, un GIF, une phrase. */
export function createActionCommand(
  config: ActionConfig,
  gifs: GifProvider = createNekosBestProvider(),
): SlashCommand {
  return {
    category: 'fun',
    data: new SlashCommandBuilder()
      .setName(config.name)
      .setDescription(config.description)
      .setContexts(InteractionContextType.Guild)
      .addUserOption((option) =>
        option.setName('membre').setDescription('Le membre visé').setRequired(true),
      ),

    async execute(interaction) {
      const author = interaction.user;
      const target = interaction.options.getUser('membre', true);
      const isSelf = target.id === author.id;

      if (isSelf && !config.selfPhrase) {
        await interaction.reply({
          content: "Choisis quelqu'un d'autre que toi.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Le GIF vient d'un service externe : on prévient Discord qu'on répond un peu plus tard
      await interaction.deferReply();
      const gif = await gifs(config.gif);

      const text =
        isSelf && config.selfPhrase ? config.selfPhrase(author) : config.phrase(author, target);
      const embed = baseEmbed(COLORS.fun).setDescription(text);
      if (gif) embed.setImage(gif).setFooter({ text: 'GIF : nekos.best' });

      await interaction.editReply({ embeds: [embed] });
    },
  };
}

export const hug = createActionCommand({
  name: 'hug',
  description: 'Fais un câlin à un membre',
  gif: 'hug',
  phrase: (author, target) => `${author} fait un gros câlin à ${target} 🤗`,
  selfPhrase: (author) => `${author} se fait un câlin… quelqu'un pour l'aider ? 🥺`,
});

export const punch = createActionCommand({
  name: 'punch',
  description: 'Mets un coup de poing à un membre',
  gif: 'punch',
  phrase: (author, target) => `${author} met un coup de poing à ${target} 👊`,
});

export const meurtre = createActionCommand({
  name: 'meurtre',
  description: 'Élimine un membre (pour de faux)',
  gif: 'shoot',
  phrase: (author, target) => `${author} élimine ${target}. Paix à son âme. 🪦`,
});
