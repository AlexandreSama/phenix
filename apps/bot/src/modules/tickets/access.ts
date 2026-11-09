import { PermissionFlagsBits, type GuildMember } from 'discord.js';

/**
 * Qui peut fermer un ticket : son auteur, un rôle de l'équipe des tickets,
 * ou quelqu'un qui gère les salons (un admin n'a pas forcément le rôle d'équipe).
 */
export function canCloseTicket(
  member: Pick<GuildMember, 'id' | 'roles' | 'permissions'>,
  ticket: { ownerId: string },
  staffRoleIds: string[],
): boolean {
  return (
    member.id === ticket.ownerId ||
    staffRoleIds.some((id) => member.roles.cache.has(id)) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}
