import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  deleteTicketType,
  findTicket,
  findTicketPanel,
  findTicketType,
  listTicketTypes,
  listTickets,
  Prisma,
  PrismaClient,
  publicationStatus,
  saveTicketPanel,
  saveTicketType,
  ticketRatingStats,
  type TicketPanel,
  type TicketTypeWithQuestions,
  type TicketWithType,
} from '@phenix/database';
import {
  maskRatingStats,
  TICKET_LIMITS,
  TICKET_PAGE_SIZE,
  type TicketListQuery,
  type TicketMemberStats,
  type TicketPage,
  type TicketSettings,
  type TicketSettingsInput,
  type TicketSummary,
  type TicketTypeDetail,
  type TicketTypeInput,
  type TicketTypeStats,
  type TicketTypeSummary,
} from '@phenix/shared';
import type { ObjectStorage } from '@phenix/storage';
import { BotEventsService } from '../../core/bot-events.service.js';
import { TRANSCRIPTS } from '../../core/tokens.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

interface TicketConfig {
  ticketLogChannelId: string | null;
}

/** La catégorie et les rôles ne sont plus des réglages du serveur : ils vivent dans chaque type. */
const CONFIG_FIELDS = { ticketLogChannelId: true } as const;

function toSettings(config: TicketConfig, panel: TicketPanel): TicketSettings {
  return {
    logChannelId: config.ticketLogChannelId,
    panel: {
      channelId: panel.channelId,
      title: panel.title,
      description: panel.description,
      buttonLabel: panel.buttonLabel,
    },
    panelStatus: publicationStatus(panel),
    panelError: panel.publishError,
  };
}

function toTypeSummary(type: TicketTypeWithQuestions): TicketTypeSummary {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    emoji: type.emoji,
    categoryId: type.categoryId,
    staffRoleIds: type.staffRoleIds,
    inactivityHours: type.inactivityHours,
    questionCount: type.questions.length,
  };
}

function toTypeDetail(type: TicketTypeWithQuestions): TicketTypeDetail {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    emoji: type.emoji,
    categoryId: type.categoryId,
    staffRoleIds: type.staffRoleIds,
    inactivityHours: type.inactivityHours,
    questions: type.questions.map(({ label, placeholder, style, required, maxLength }) => ({
      label,
      placeholder,
      style,
      required,
      maxLength,
    })),
  };
}

function toSummary(ticket: TicketWithType): TicketSummary {
  return {
    id: ticket.id,
    number: ticket.number,
    ownerId: ticket.ownerId,
    ownerName: ticket.ownerName ?? ticket.ownerId,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
    closedByName: ticket.closedByName,
    messageCount: ticket.messageCount,
    typeName: ticket.type?.name ?? null,
    claimedByName: ticket.claimedByName,
    hasTranscript: ticket.transcriptKey !== null,
    closedVia: ticket.closedVia,
  };
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
    @Inject(TRANSCRIPTS) private readonly transcripts: ObjectStorage,
  ) {}

  async getSettings(guildId: string): Promise<TicketSettings | null> {
    const [config, panel] = await Promise.all([
      this.db.guildConfig.findUnique({ where: { guildId }, select: CONFIG_FIELDS }),
      findTicketPanel(this.db, guildId),
    ]);
    return config && panel ? toSettings(config, panel) : null;
  }

  /**
   * Enregistre les réglages (salon de logs) et le panel ensemble, puis prévient le bot : il relit
   * la config et publie le panel. Un panel qui change de salon laisse partir l'ancien message.
   */
  async saveSettings(guildId: string, input: TicketSettingsInput): Promise<TicketSettings> {
    await this.assertSettingsValid(guildId, input);
    const previous = await findTicketPanel(this.db, guildId);
    const moved =
      previous?.messageId && previous.channelId !== input.panel.channelId ? previous : null;

    const fields = { ticketLogChannelId: input.logChannelId };
    // Les deux écritures passent ou échouent ensemble
    const [config, panel] = await this.db.$transaction(async (tx) => [
      await tx.guildConfig.upsert({
        where: { guildId },
        create: { ...newGuildConfig(guildId), ...fields },
        update: fields,
        select: CONFIG_FIELDS,
      }),
      await saveTicketPanel(tx, guildId, input.panel, { forgetMessage: moved !== null }),
    ]);

    await this.botEvents.notify({ type: 'config.updated', guildId });
    if (moved?.messageId) {
      await this.botEvents.notify({
        type: 'ticketPanel.delete',
        guildId,
        channelId: moved.channelId,
        messageId: moved.messageId,
      });
    }
    await this.botEvents.notify({ type: 'ticketPanel.publish', guildId });
    return toSettings(config, panel);
  }

  async listTypes(guildId: string): Promise<TicketTypeSummary[]> {
    return (await listTicketTypes(this.db, guildId)).map(toTypeSummary);
  }

  async getType(guildId: string, id: number): Promise<TicketTypeDetail> {
    return toTypeDetail(await this.findOwnedType(guildId, id));
  }

  async createType(guildId: string, input: TicketTypeInput): Promise<TicketTypeDetail> {
    const count = await this.db.ticketType.count({ where: { guildId } });
    if (count >= TICKET_LIMITS.types) {
      throw new BadRequestException(`${TICKET_LIMITS.types} types au plus par serveur`);
    }
    await this.assertTypeValid(guildId, input);

    const type = await saveTicketType(this.db, guildId, input);
    // Le panneau liste les types : le bot le republie
    await this.botEvents.notify({ type: 'ticketPanel.publish', guildId });
    return toTypeDetail(type);
  }

  async updateType(guildId: string, id: number, input: TicketTypeInput): Promise<TicketTypeDetail> {
    await this.findOwnedType(guildId, id);
    await this.assertTypeValid(guildId, input);

    let type: TicketTypeWithQuestions;
    try {
      type = await saveTicketType(this.db, guildId, input, id);
    } catch (err) {
      // Supprimé par un autre appel entre la vérification et l'écriture : Prisma lève P2025
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Type de ticket introuvable');
      }
      throw err;
    }
    await this.botEvents.notify({ type: 'ticketPanel.publish', guildId });
    return toTypeDetail(type);
  }

  /** Un type qui a encore un ticket ouvert reste : le bot en a besoin (catégorie, rôles). */
  async removeType(guildId: string, id: number): Promise<void> {
    const result = await deleteTicketType(this.db, guildId, id);
    if (result === 'not_found') throw new NotFoundException('Type de ticket introuvable');
    if (result === 'has_open_tickets') {
      throw new ConflictException(
        'Ce type a encore un ticket ouvert : ferme-le avant de supprimer le type',
      );
    }
    await this.botEvents.notify({ type: 'ticketPanel.publish', guildId });
  }

  async list(guildId: string, query: TicketListQuery): Promise<TicketPage> {
    const status = query.status === 'open' ? 'OPEN' : 'CLOSED';
    const slice = await listTickets(this.db, guildId, status, query.page, TICKET_PAGE_SIZE);
    return { ...slice, tickets: slice.tickets.map(toSummary) };
  }

  /** Moyennes par type, préparées pour le site par `maskRatingStats` (sans nombre de notes). */
  async typeStats(guildId: string): Promise<TicketTypeStats> {
    const { types } = maskRatingStats(await ticketRatingStats(this.db, guildId));
    return { types };
  }

  /** Moyennes par membre de l'équipe, sans identifiant Discord : réservées aux administrateurs. */
  async memberStats(guildId: string): Promise<TicketMemberStats> {
    const { members } = maskRatingStats(await ticketRatingStats(this.db, guildId));
    return { members };
  }

  /**
   * Le HTML rangé dans Garage par le bot, et son nom de fichier (ticket-0042.html).
   * Le ticket d'un autre serveur répond 404, comme un ticket inexistant.
   */
  async transcript(guildId: string, ticketId: number): Promise<{ html: string; fileName: string }> {
    const ticket = await findTicket(this.db, ticketId);
    if (!ticket || ticket.guildId !== guildId) throw new NotFoundException('Ticket introuvable');
    if (!ticket.transcriptKey) {
      throw new NotFoundException(
        "Ce ticket n'a pas de transcript : il est ouvert, ou son salon a été supprimé à la main",
      );
    }
    const html = await this.transcripts.getText(ticket.transcriptKey);
    if (html === null) throw new NotFoundException('Transcript introuvable dans le stockage');
    return { html, fileName: ticket.transcriptKey.split('/').at(-1) ?? 'transcript.html' };
  }

  /** Un type d'un autre serveur répond 404, comme un type inexistant : on ne révèle rien. */
  private async findOwnedType(guildId: string, id: number): Promise<TicketTypeWithQuestions> {
    const type = await findTicketType(this.db, id);
    if (!type || type.guildId !== guildId)
      throw new NotFoundException('Type de ticket introuvable');
    return type;
  }

  /** Le schéma vérifie la forme des IDs ; ici on vérifie qu'ils existent sur ce serveur. */
  private async assertTypeValid(guildId: string, input: TicketTypeInput): Promise<void> {
    const [categories, roles] = await Promise.all([
      this.guilds.categories(guildId),
      this.guilds.roles(guildId),
    ]);
    const roleIds = new Set(roles.map((role) => role.id));

    const problems = [
      categories.some((category) => category.id === input.categoryId)
        ? null
        : 'Catégorie inconnue sur ce serveur',
      input.staffRoleIds.every((id) => roleIds.has(id)) ? null : 'Rôle inconnu sur ce serveur',
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) throw new BadRequestException(problems);
  }

  private async assertSettingsValid(guildId: string, input: TicketSettingsInput): Promise<void> {
    const channels = await this.guilds.channels(guildId);
    const channelIds = new Set(channels.map((channel) => channel.id));

    const problems = [
      input.logChannelId === null || channelIds.has(input.logChannelId)
        ? null
        : 'Salon de logs inconnu sur ce serveur',
      channelIds.has(input.panel.channelId) ? null : 'Salon du panel inconnu sur ce serveur',
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) throw new BadRequestException(problems);
  }
}
