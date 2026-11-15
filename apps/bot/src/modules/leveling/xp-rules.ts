/** Où a été écrit un message : le salon, son éventuel parent (fil) et sa catégorie. */
export interface XpLocation {
  /** Salon du message : texte, vocal (sa discussion) ou fil. */
  channelId: string;
  /** Salon parent, pour un fil ; absent sinon. */
  parentChannelId?: string | null;
  /** Catégorie du salon, ou du salon parent pour un fil ; absente si le salon n'en a pas. */
  categoryId?: string | null;
}

/**
 * Vrai si les messages écrits ici ne rapportent pas d'XP : le salon, son parent (fil)
 * ou leur catégorie figure dans la liste d'exclusion. Liste vide : rien n'est exclu.
 */
export function isXpExcluded(excludedIds: readonly string[], where: XpLocation): boolean {
  if (excludedIds.length === 0) return false;
  return [where.channelId, where.parentChannelId, where.categoryId].some(
    (id) => id != null && excludedIds.includes(id),
  );
}
