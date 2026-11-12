import type { Case, CaseType } from '@phenix/database';
import { BRAND, CASE_TYPE_LABELS, NO_REASON } from '@phenix/shared';
import { time, TimestampStyles, type ColorResolvable, type EmbedBuilder } from 'discord.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

// Défini dans @phenix/shared : le site et le journal d'audit disent la même chose
export { NO_REASON };

/** Les libellés partagés couvrent bien tous les types de la base : TypeScript le vérifie ici. */
const LABELS: Record<CaseType, string> = CASE_TYPE_LABELS;

export const CASE_COLORS = {
  WARN: COLORS.warning,
  MUTE: BRAND.orange,
  UNMUTE: COLORS.success,
  KICK: BRAND.ember,
  BAN: COLORS.danger,
  UNBAN: COLORS.success,
} satisfies Record<CaseType, ColorResolvable>;

export function caseLabel(type: CaseType): string {
  return LABELS[type];
}

/** Où en est une sanction, en quelques mots. */
export function caseStatus(
  sanction: Pick<Case, 'type' | 'expiresAt' | 'revokedAt'>,
  now = new Date(),
): string {
  if (sanction.revokedAt) return 'levée';
  if (sanction.type === 'WARN') return 'active';
  if (sanction.type === 'MUTE' || sanction.type === 'BAN') {
    if (!sanction.expiresAt) return 'définitive';
    return sanction.expiresAt > now
      ? `jusqu'au ${time(sanction.expiresAt, TimestampStyles.ShortDateTime)}`
      : 'terminée';
  }
  return 'appliquée';
}

/** Une ligne de /sanctions : « #12 · Bannissement · 7 nov. · active — raison ». */
export function caseLine(sanction: Case, now = new Date()): string {
  const reason = sanction.reason ?? NO_REASON;
  const short = reason.length > 80 ? `${reason.slice(0, 79)}…` : reason;
  return `**#${sanction.number}** · ${caseLabel(sanction.type)} · ${time(sanction.createdAt, TimestampStyles.ShortDate)} · ${caseStatus(sanction, now)}\n${short}`;
}

/** L'embed d'une case, pour le salon de logs et /case. */
export function caseEmbed(sanction: Case): EmbedBuilder {
  const embed = baseEmbed(CASE_COLORS[sanction.type])
    .setTitle(`Case #${sanction.number} · ${caseLabel(sanction.type)}`)
    .addFields(
      { name: 'Membre', value: `<@${sanction.targetId}> (${sanction.targetId})`, inline: true },
      { name: 'Modérateur', value: `<@${sanction.moderatorId}>`, inline: true },
      { name: 'Raison', value: sanction.reason ?? NO_REASON },
    )
    .setTimestamp(sanction.createdAt);

  if (sanction.expiresAt) {
    embed.addFields({
      name: 'Fin',
      value: `${time(sanction.expiresAt, TimestampStyles.LongDateTime)} (${time(sanction.expiresAt, TimestampStyles.RelativeTime)})`,
    });
  }
  return embed;
}
