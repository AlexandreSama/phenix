/** Adresse de l'icône d'un serveur sur le CDN de Discord, ou null s'il n'en a pas. */
export function guildIconUrl(guildId: string, icon: string | null): string | null {
  return icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128` : null;
}
