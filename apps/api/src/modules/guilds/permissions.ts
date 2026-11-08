import { PermissionFlagsBits } from 'discord-api-types/v10';

const MANAGERS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild;

/** Le propriétaire, un administrateur ou quiconque a « Gérer le serveur » peut configurer le bot. */
export function canManageGuild(guild: { owner?: boolean; permissions?: string }): boolean {
  if (guild.owner) return true;
  return (BigInt(guild.permissions ?? '0') & MANAGERS) !== 0n;
}
