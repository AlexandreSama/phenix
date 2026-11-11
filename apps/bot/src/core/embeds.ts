import { BRAND } from '@phenix/shared';
import { EmbedBuilder, type ColorResolvable } from 'discord.js';

/**
 * Couleurs des embeds : celles du logo, plus un vert et un rouge qui gardent leur sens.
 * La couleur dit l'état : primary = ouvert ou en examen, soon = en cours ou bientôt,
 * warning = à vérifier, neutral = rejeté, danger = annulé ou alerte, success = rien à signaler.
 */
export const COLORS = {
  primary: BRAND.flame,
  fun: BRAND.gold,
  soon: BRAND.gold,
  warning: BRAND.yellow,
  neutral: '#80848E',
  success: '#57F287',
  danger: '#ED4245',
} as const;

/** Embed de base, aux couleurs du bot. */
export function baseEmbed(color: ColorResolvable = COLORS.primary): EmbedBuilder {
  return new EmbedBuilder().setColor(color);
}
