import type { XpMultiplierEntry } from '@phenix/shared';
import type { PrismaClient } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, '$transaction' | 'xpMultiplier'>;

/**
 * Ordre des bonus d'un serveur : celui des identifiants, comparés comme des chaînes (« 1000 »
 * avant « 400 » avant « 99 »). Pour des identifiants faits de chiffres, c'est aussi l'ordre de
 * `orderBy: { targetId: 'asc' }` en base : l'API trie ses réponses avec cette fonction pour
 * répondre dans le même ordre que la lecture.
 */
export function compareXpMultipliers(a: XpMultiplierEntry, b: XpMultiplierEntry): number {
  if (a.targetId === b.targetId) return 0;
  return a.targetId < b.targetId ? -1 : 1;
}

/** Les bonus d'XP d'un serveur (rôles, salons, catégories), sans autre champ que ceux du site. */
export function listXpMultipliers(
  db: Pick<PrismaClient, 'xpMultiplier'>,
  guildId: string,
): Promise<XpMultiplierEntry[]> {
  return db.xpMultiplier.findMany({
    where: { guildId },
    select: { kind: true, targetId: true, percent: true },
    // Toutes les lignes d'un enregistrement ont le même createdAt (une seule transaction) : il ne
    // trie rien. L'ordre de saisie n'est pas conservé ; celui des identifiants est stable, donc
    // l'écran ne se réorganise pas d'une lecture à l'autre
    orderBy: { targetId: 'asc' },
  });
}

/**
 * Remplace tous les bonus d'un serveur : supprime, puis recrée. Une seule transaction,
 * donc un échec (cible en double…) laisse l'ancienne liste intacte. Liste vide : tout est supprimé.
 */
export async function replaceXpMultipliers(
  db: Db,
  guildId: string,
  multipliers: readonly XpMultiplierEntry[],
): Promise<void> {
  await db.$transaction([
    db.xpMultiplier.deleteMany({ where: { guildId } }),
    db.xpMultiplier.createMany({
      data: multipliers.map(({ kind, targetId, percent }) => ({
        guildId,
        kind,
        targetId,
        percent,
      })),
    }),
  ]);
}
