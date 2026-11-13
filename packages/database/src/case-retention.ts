import { CASE_RETENTION_DEFAULT_MONTHS } from '@phenix/shared';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';

/**
 * La limite de conservation : `now` reculé de `months` mois calendaires, en UTC, à la même heure.
 * Le jour est borné au dernier jour du mois d'arrivée (31 mai − 6 mois → 30 novembre).
 * Refuse une durée qui n'est pas un entier d'au moins un mois, ou une date `now` invalide : la purge
 * est irréversible.
 */
export function caseRetentionCutoff(months: number, now: Date): Date {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError(`Invalid case retention: ${months} months`);
  }
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Invalid case retention reference date');
  }
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - months;
  // jour 0 du mois suivant = dernier jour du mois d'arrivée
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(year, month, Math.min(now.getUTCDate(), lastDay));
  return cutoff;
}

/**
 * Les sanctions closes avant la limite (bornes strictes : une sanction close pile à la limite est
 * gardée). Une sanction active n'est jamais visée : avertissement non retiré, ban non levé (même
 * temporaire et échu : le membre est encore banni), sourdine en cours.
 */
function closedBeforeWhere(cutoff: Date): Prisma.CaseWhereInput {
  return {
    OR: [
      // levée (avertissement retiré, ban ou sourdine levés)
      { revokedAt: { lt: cutoff } },
      // sourdine terminée d'elle-même
      { type: 'MUTE', expiresAt: { lt: cutoff } },
      // expulsion, débannissement, fin de sourdine : clos dès leur création
      { type: { in: ['KICK', 'UNBAN', 'UNMUTE'] }, createdAt: { lt: cutoff } },
    ],
  };
}

export interface CasePurgeResult {
  /** Serveurs où au moins une sanction a été purgée */
  guilds: number;
  /** Sanctions purgées en tout */
  cases: number;
  /** Serveurs sautés car leur durée de conservation en base est invalide (rien n'y est purgé) */
  skipped: number;
}

/**
 * Supprime les sanctions closes depuis plus longtemps que la durée de conservation de leur serveur
 * (`GuildConfig.caseRetentionMonths` ; sans ligne GuildConfig, 12 mois ; null, jamais).
 * La table Guild n'est pas modifiée : la numérotation (`Guild.caseCounter`) continue sans réutiliser
 * de numéro.
 * Un serveur dont la durée en base est invalide est sauté (compté dans `skipped`) sans arrêter la
 * purge des autres ; ni le résultat ni une erreur ne portent d'identifiant de serveur.
 */
export async function purgeCases(
  db: Pick<PrismaClient, 'guild' | 'case'>,
  now = new Date(),
): Promise<CasePurgeResult> {
  const guilds = await db.guild.findMany({
    select: { id: true, config: { select: { caseRetentionMonths: true } } },
  });
  const result: CasePurgeResult = { guilds: 0, cases: 0, skipped: 0 };
  for (const guild of guilds) {
    const months = guild.config ? guild.config.caseRetentionMonths : CASE_RETENTION_DEFAULT_MONTHS;
    if (months === null) continue;
    let cutoff: Date;
    try {
      cutoff = caseRetentionCutoff(months, now);
    } catch (error) {
      // seule une durée invalide est sautée ; une autre erreur (date `now` invalide…) arrête tout
      if (!(error instanceof RangeError) || !Number.isFinite(now.getTime())) throw error;
      result.skipped += 1;
      continue;
    }
    const { count } = await db.case.deleteMany({
      // guildId hors de tout OR : la purge ne sort jamais du serveur
      where: { AND: [{ guildId: guild.id }, closedBeforeWhere(cutoff)] },
    });
    if (count > 0) {
      result.guilds += 1;
      result.cases += count;
    }
  }
  return result;
}
