import { purgeCases, type PrismaClient } from '@phenix/database';
import type { ModerationJob } from '@phenix/jobs';
import type { Logger } from 'pino';

interface ModerationDeps {
  db: Pick<PrismaClient, 'guild' | 'case'>;
  logger: Pick<Logger, 'info' | 'warn'>;
}

/** Avance tolérée de la date d'une tâche sur l'horloge du worker (horloges légèrement décalées) */
const MAX_SCHEDULE_AHEAD_MS = 60_000;

/**
 * Traite la file de modération ; un nom de tâche inconnu est ignoré (log `warn`). `purge` : efface les sanctions closes au-delà de la rétention de
 * chaque serveur, à l'heure prévue de la tâche, bornée à « maintenant » : une tâche datée dans le
 * futur (injectée dans Valkey) viserait des sanctions récentes. Le log ne porte que des comptes,
 * aucun identifiant ; un serveur sauté (durée invalide en base) passe le log en `warn`. Une erreur
 * remonte au worker, dont le gestionnaire « failed » la journalise.
 */
export function createModerationProcessor({ db, logger }: ModerationDeps) {
  return async (job: ModerationJob): Promise<void> => {
    // le nom vient de Valkey (simple transtypage) : seule `purge` purge, un autre nom est ignoré
    const name: string = job.name;
    if (name !== 'purge') {
      logger.warn({ job: name }, 'Unknown moderation job ignored');
      return;
    }
    const now = new Date();
    const reference =
      job.scheduledAt.getTime() > now.getTime() + MAX_SCHEDULE_AHEAD_MS ? now : job.scheduledAt;
    const { cases, guilds, skipped } = await purgeCases(db, reference);
    if (skipped > 0) {
      logger.warn(
        { cases, guilds, skipped },
        'Closed cases past retention purged, guilds with an invalid retention skipped',
      );
    } else {
      logger.info({ cases, guilds, skipped }, 'Closed cases past retention purged');
    }
  };
}
