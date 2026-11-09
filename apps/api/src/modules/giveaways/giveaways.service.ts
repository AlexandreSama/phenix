import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  advanceGiveawayEnd,
  createGiveaway,
  deleteGiveaway,
  findGiveaway,
  listGiveaways,
  PrismaClient,
  publicationStatus,
  type GiveawayWithCount,
} from '@phenix/database';
import type { GiveawayScheduler } from '@phenix/jobs';
import {
  GIVEAWAY_PAGE_SIZE,
  giveawayEndProblem,
  type GiveawayInput,
  type GiveawayListQuery,
  type GiveawayPage,
  type GiveawaySummary,
  type GiveawayWinner,
} from '@phenix/shared';
import { GIVEAWAYS } from '../../core/tokens.js';
import { GuildsService } from '../guilds/guilds.service.js';

function toSummary(giveaway: GiveawayWithCount, winners: GiveawayWinner[]): GiveawaySummary {
  return {
    id: giveaway.id,
    prize: giveaway.prize,
    channelId: giveaway.channelId,
    winnersCount: giveaway.winnersCount,
    requiredRoleId: giveaway.requiredRoleId,
    endsAt: giveaway.endsAt.toISOString(),
    endedAt: giveaway.endedAt?.toISOString() ?? null,
    announced: giveaway.announcedAt !== null,
    entryCount: giveaway._count.entries,
    winners,
    publication: publicationStatus(giveaway),
    publishError: giveaway.publishError,
  };
}

@Injectable()
export class GiveawaysService {
  constructor(
    private readonly db: PrismaClient,
    private readonly guilds: GuildsService,
    @Inject(GIVEAWAYS) private readonly scheduler: GiveawayScheduler,
  ) {}

  async list(guildId: string, query: GiveawayListQuery): Promise<GiveawayPage> {
    const slice = await listGiveaways(
      this.db,
      guildId,
      query.status,
      query.page,
      GIVEAWAY_PAGE_SIZE,
    );
    return {
      ...slice,
      giveaways: slice.giveaways.map((giveaway) => toSummary(giveaway, giveaway.winners)),
    };
  }

  /** Enregistre le giveaway, puis confie à la file sa publication et son tirage. */
  async create(guildId: string, hostId: string, input: GiveawayInput): Promise<GiveawaySummary> {
    const endsAt = new Date(input.endsAt);
    await this.assertValid(guildId, input, endsAt);

    const giveaway = await createGiveaway(this.db, {
      guildId,
      channelId: input.channelId,
      hostId,
      prize: input.prize,
      winnersCount: input.winnersCount,
      requiredRoleId: input.requiredRoleId,
      endsAt,
    });
    await this.scheduler.publish(giveaway.id);
    await this.scheduler.scheduleEnd(giveaway.id, endsAt);
    return toSummary({ ...giveaway, _count: { entries: 0 } }, []);
  }

  /**
   * Avance le tirage à maintenant. Sur un giveaway tiré mais pas annoncé (salon inaccessible
   * au moment du tirage), réessaie l'annonce : le tirage, lui, n'est jamais refait.
   */
  async end(guildId: string, giveawayId: number): Promise<void> {
    const giveaway = await this.find(guildId, giveawayId);
    if (giveaway.announcedAt) throw new ConflictException('Ce giveaway est déjà terminé');
    await advanceGiveawayEnd(this.db, giveawayId);
    await this.scheduler.endNow(giveawayId);
  }

  async reroll(guildId: string, giveawayId: number): Promise<void> {
    const giveaway = await this.find(guildId, giveawayId);
    if (!giveaway.endedAt) throw new ConflictException("Ce giveaway n'est pas encore terminé");
    if (!giveaway.announcedAt) {
      throw new ConflictException("Le tirage précédent n'est pas encore annoncé");
    }
    await this.scheduler.reroll(giveawayId);
  }

  /** Supprime le giveaway, annule ses tâches en attente et retire son message de Discord. */
  async remove(guildId: string, giveawayId: number): Promise<void> {
    await this.find(guildId, giveawayId);
    const deleted = await deleteGiveaway(this.db, giveawayId);
    await this.scheduler.cancel(giveawayId);
    if (deleted?.messageId) {
      await this.scheduler.removeMessage({
        channelId: deleted.channelId,
        messageId: deleted.messageId,
      });
    }
  }

  /** Le giveaway d'un autre serveur répond 404, comme un giveaway inexistant. */
  private async find(guildId: string, giveawayId: number): Promise<GiveawayWithCount> {
    const giveaway = await findGiveaway(this.db, giveawayId);
    if (giveaway?.guildId !== guildId) throw new NotFoundException('Giveaway introuvable');
    return giveaway;
  }

  /** Le schéma vérifie la forme ; ici, la date de fin et l'existence du salon et du rôle. */
  private async assertValid(guildId: string, input: GiveawayInput, endsAt: Date): Promise<void> {
    const [channels, roles] = await Promise.all([
      this.guilds.channels(guildId),
      input.requiredRoleId ? this.guilds.roles(guildId) : Promise.resolve([]),
    ]);
    const problems = [
      giveawayEndProblem(endsAt, new Date()),
      channels.some((channel) => channel.id === input.channelId)
        ? null
        : 'Salon inconnu sur ce serveur',
      input.requiredRoleId === null || roles.some((role) => role.id === input.requiredRoleId)
        ? null
        : 'Rôle inconnu sur ce serveur',
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) throw new BadRequestException(problems);
  }
}
