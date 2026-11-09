import {
  closeGiveaway,
  findGiveaway,
  markGiveawayAnnounced,
  markGiveawayFailed,
  markGiveawayPublished,
  rerollGiveaway,
  type Giveaway,
  type GiveawayWithCount,
  type PrismaClient,
} from '@phenix/database';
import type { GiveawayJob } from '@phenix/jobs';
import type { Client } from 'discord.js';
import {
  deleteMessageQuietly,
  describePublishError,
  isLastingPublishError,
  postOrEditMessage,
  PublishError,
} from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { announcementMessage, giveawayMessage } from './messages.js';

type Db = Pick<PrismaClient, 'giveaway' | 'giveawayEntry' | '$transaction'>;
type Log = Pick<Logger, 'info' | 'warn'>;

export interface GiveawayProcessorDeps {
  client: Client;
  db: Db;
  logger: Log;
}

/**
 * Poste ou met à jour le message du giveaway, et renvoie son ID.
 * Un échec durable (salon supprimé, droits manquants) est noté pour le site et renvoie null.
 * Un échec passager (Discord indisponible) remonte : BullMQ réessaiera la tâche.
 */
export async function publishGiveaway(
  { client, db, logger }: GiveawayProcessorDeps,
  giveaway: GiveawayWithCount,
): Promise<string | null> {
  try {
    const messageId = await postOrEditMessage(client, giveaway, giveawayMessage(giveaway));
    await markGiveawayPublished(db, giveaway.id, messageId);
    return messageId;
  } catch (err) {
    await markGiveawayFailed(db, giveaway.id, describePublishError(err));
    if (!isLastingPublishError(err)) throw err;
    logger.warn({ err, giveawayId: giveaway.id }, 'Message du giveaway impossible à publier');
    return null;
  }
}

/** Répond au message du giveaway pour annoncer les gagnants. */
async function announce(
  client: Client,
  giveaway: Giveaway,
  messageId: string,
  reroll: boolean,
): Promise<void> {
  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel?.isSendable()) throw new PublishError('Salon introuvable ou sans messages');
  await channel.send(announcementMessage(giveaway, { messageId, reroll }));
}

/**
 * Après un tirage : le message passe en « terminé » avec les gagnants, puis l'annonce part.
 * Si la tâche est rejouée, le tirage ne l'est pas : il est déjà en base.
 */
async function finish(deps: GiveawayProcessorDeps, giveawayId: number, reroll: boolean) {
  const { client, db, logger } = deps;
  const giveaway = await findGiveaway(db, giveawayId);
  if (!giveaway) return;

  const messageId = await publishGiveaway(deps, giveaway);
  if (!messageId) return; // salon inutilisable : l'erreur est affichée sur le site

  try {
    await announce(client, giveaway, messageId, reroll);
  } catch (err) {
    if (!isLastingPublishError(err)) throw err;
    logger.warn({ err, giveawayId }, 'Annonce des gagnants impossible');
    await markGiveawayFailed(db, giveawayId, describePublishError(err));
    return;
  }
  await markGiveawayAnnounced(db, giveawayId);
  logger.info({ giveawayId, winners: giveaway.winnerIds.length, reroll }, 'Giveaway annoncé');
}

/** Ce que fait le worker du bot pour chaque tâche de la file. */
export function createGiveawayProcessor(deps: GiveawayProcessorDeps) {
  const { client, db, logger } = deps;
  return async (job: GiveawayJob): Promise<void> => {
    switch (job.name) {
      case 'publish': {
        const giveaway = await findGiveaway(db, job.data.giveawayId);
        if (giveaway) await publishGiveaway(deps, giveaway);
        return;
      }
      case 'end': {
        const giveaway = await closeGiveaway(db, job.data.giveawayId);
        // Supprimé entre-temps, ou déjà annoncé : rien à faire
        if (!giveaway || giveaway.announcedAt) return;
        await finish(deps, giveaway.id, false);
        return;
      }
      case 'reroll': {
        const result = await rerollGiveaway(db, job.data.giveawayId);
        if (result === null) return;
        if (result === 'not-ended') {
          logger.warn({ giveawayId: job.data.giveawayId }, 'Relance avant le premier tirage');
          return;
        }
        await finish(deps, result.id, true);
        return;
      }
      case 'remove':
        await deleteMessageQuietly(client, job.data, logger);
        return;
    }
  };
}
