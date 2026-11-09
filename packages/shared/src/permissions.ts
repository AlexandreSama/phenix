/**
 * Permissions qu'un panel de rôles ne doit jamais distribuer : un clic sur un bouton
 * ne peut pas faire d'un membre un admin ou un modérateur.
 * Valeurs des bits de Discord ; le bot vérifie dans ses tests qu'elles collent à discord.js.
 */
export const ROLE_PANEL_FORBIDDEN_PERMISSIONS = {
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  ManageMessages: 1n << 13n,
  MentionEveryone: 1n << 17n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ModerateMembers: 1n << 40n,
} as const;

const FORBIDDEN_MASK = Object.values(ROLE_PANEL_FORBIDDEN_PERMISSIONS).reduce((a, b) => a | b, 0n);

/** Vrai si un rôle porte au moins une permission de modération ou d'administration. */
export function hasForbiddenPermissions(permissions: bigint | string): boolean {
  return (BigInt(permissions) & FORBIDDEN_MASK) !== 0n;
}
