import { PermissionFlagsBits, type OverwriteResolvable } from 'discord.js';

const MEMBER = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

/**
 * Qui voit le salon d'un ticket : personne par défaut, puis l'auteur, l'équipe et le bot.
 * Le bot garde « Gérer le salon » pour pouvoir le supprimer à la fermeture.
 */
export function ticketOverwrites(ids: {
  everyoneId: string;
  ownerId: string;
  staffRoleIds: string[];
  botId: string;
}): OverwriteResolvable[] {
  return [
    { id: ids.everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ids.ownerId, allow: MEMBER },
    ...ids.staffRoleIds.map((id) => ({
      id,
      allow: [...MEMBER, PermissionFlagsBits.ManageMessages],
    })),
    { id: ids.botId, allow: [...MEMBER, PermissionFlagsBits.ManageChannels] },
  ];
}

/** ticket-0042 : le numéro sur quatre chiffres garde les salons triés dans la catégorie. */
export const ticketChannelName = (number: number) => `ticket-${String(number).padStart(4, '0')}`;

/** Où le transcript est rangé dans le bucket : un dossier par serveur. */
export const transcriptKey = (guildId: string, number: number) =>
  `${guildId}/${ticketChannelName(number)}.html`;
