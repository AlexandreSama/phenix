/** Adresse de l'icône d'un serveur sur le CDN de Discord, ou null s'il n'en a pas. */
export function guildIconUrl(guildId: string, icon: string | null): string | null {
  return icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128` : null;
}

/** Avatar d'un compte Discord sur le CDN, ou null s'il garde celui par défaut. */
export function userAvatarUrl(userId: string, avatar: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null;
}
