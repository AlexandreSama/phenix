/** Les trois sortes de cible d'un bonus d'XP ; mêmes valeurs que l'énumération Prisma XpMultiplierKind. */
export const XP_MULTIPLIER_KINDS = ['ROLE', 'CHANNEL', 'CATEGORY'] as const;

export type XpMultiplierKind = (typeof XP_MULTIPLIER_KINDS)[number];

/** Pourcentage le plus bas d'une cible (10 % = malus de 90 %) ; c'est aussi le plancher du total. */
export const XP_MULTIPLIER_MIN_PERCENT = 10;

/** Pourcentage le plus haut d'une cible (500 % = ×5). */
export const XP_MULTIPLIER_MAX_PERCENT = 500;

/** Un bonus ou un malus d'XP : 100 = inchangé, 150 = ×1,5, 50 = moitié moins. */
export interface XpMultiplierRule {
  kind: XpMultiplierKind;
  targetId: string;
  percent: number;
}

export interface EffectiveXpOptions {
  /** Pourcentage de chaque rôle du membre qui a un bonus ; ils se multiplient entre eux. */
  rolePercents: readonly number[];
  /** Pourcentage du lieu (salon, sinon catégorie) ; absent ou null s'il n'y en a pas. */
  placePercent?: number | null;
  /** Plafond du total, en pourcentage (réglage du serveur). */
  maxPercent: number;
}

/**
 * XP réellement gagnée : la base multipliée par le produit des pourcentages de tous les rôles
 * et du pourcentage du lieu, ce produit étant borné entre 10 % et `maxPercent`.
 *
 * Méthode : calcul exact en entiers (BigInt), sans flottants ni arrondi intermédiaire.
 * Le produit de n pourcentages vaut `produit / 100^n` ; on borne ce rapport, puis on arrondit
 * UNE SEULE fois le gain à l'entier le plus proche (la moitié vers le haut), avec au moins 1 XP.
 * Une base de 0 (ou négative) reste à 0 : il n'y a rien à multiplier.
 */
export function effectiveXp(base: number, options: EffectiveXpOptions): number {
  if (base <= 0) return 0;

  const percents = [...options.rolePercents];
  if (options.placePercent != null) percents.push(options.placePercent);
  if (percents.length === 0) return base;

  let numerator = 1n;
  let denominator = 1n;
  for (const percent of percents) {
    numerator *= BigInt(percent);
    denominator *= 100n;
  }

  // On compare le rapport numerator / denominator aux bornes, exprimées en pourcentages (÷ 100)
  const min = BigInt(XP_MULTIPLIER_MIN_PERCENT);
  const max = BigInt(options.maxPercent);
  if (numerator * 100n < min * denominator) {
    numerator = min;
    denominator = 100n;
  }
  if (numerator * 100n > max * denominator) {
    numerator = max;
    denominator = 100n;
  }

  // Arrondi à l'entier le plus proche, moitié vers le haut : floor((2·base·n + d) / 2d)
  const scaled = (2n * BigInt(base) * numerator + denominator) / (2n * denominator);
  return Math.max(1, Number(scaled));
}

/** Où a été écrit un message, pour retrouver le bonus du lieu. */
export interface XpPlace {
  /** Rôles du membre. */
  roleIds: readonly string[];
  /** Salon du message : texte, vocal (sa discussion) ou fil. */
  channelId: string;
  /** Salon parent, pour un fil ; absent sinon. */
  parentChannelId?: string | null;
  /** Catégorie du salon, ou du salon parent pour un fil ; absente si le salon n'en a pas. */
  categoryId?: string | null;
}

/**
 * Les pourcentages qui s'appliquent à un message : tous ceux des rôles du membre, et UN SEUL
 * pour le lieu, cherché dans l'ordre salon, salon parent (fil), catégorie.
 */
export function resolveXpPercents(
  multipliers: readonly XpMultiplierRule[],
  place: XpPlace,
): { rolePercents: number[]; placePercent: number | null } {
  const rolePercents: number[] = [];
  const roleIds = new Set(place.roleIds);
  for (const rule of multipliers) {
    if (rule.kind === 'ROLE' && roleIds.has(rule.targetId)) rolePercents.push(rule.percent);
  }

  const find = (kind: XpMultiplierKind, id: string | null | undefined): number | null => {
    if (id == null) return null;
    return multipliers.find((rule) => rule.kind === kind && rule.targetId === id)?.percent ?? null;
  };
  const placePercent =
    find('CHANNEL', place.channelId) ??
    find('CHANNEL', place.parentChannelId) ??
    find('CATEGORY', place.categoryId);

  return { rolePercents, placePercent };
}
