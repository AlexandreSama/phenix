import {
  effectiveXp,
  resolveXpPercents,
  type LevelingConfig,
  type XpMultiplierEntry,
} from '@phenix/shared';

export interface BonusPreview {
  /** XP minimale gagnée par message avec ce bonus seul */
  min: number;
  /** XP maximale gagnée par message avec ce bonus seul */
  max: number;
  /** Le plafond des bonus réduit le pourcentage du bonus */
  limited: boolean;
}

/**
 * Ce que rapporte un message avec ce bonus seul, calculé comme le bot (`resolveXpPercents` puis
 * `effectiveXp`, partagés) : un rôle que le membre a, un salon où il écrit ou une catégorie de ce salon.
 */
export function previewBonus(
  entry: XpMultiplierEntry,
  range: Pick<LevelingConfig, 'xpMin' | 'xpMax'>,
  maxPercent: number,
): BonusPreview {
  const { rolePercents, placePercent } = resolveXpPercents([entry], {
    roleIds: entry.kind === 'ROLE' ? [entry.targetId] : [],
    channelId: entry.kind === 'CHANNEL' ? entry.targetId : '',
    categoryId: entry.kind === 'CATEGORY' ? entry.targetId : null,
  });
  const options = { rolePercents, placePercent, maxPercent };
  return {
    min: effectiveXp(range.xpMin, options),
    max: effectiveXp(range.xpMax, options),
    limited: entry.percent > maxPercent,
  };
}
