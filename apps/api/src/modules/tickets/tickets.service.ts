import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  findTicket,
  findTicketPanel,
  listTickets,
  PrismaClient,
  publicationStatus,
  saveTicketPanel,
  type Ticket,
  type TicketPanel,
} from '@phenix/database';
import {
  TICKET_PAGE_SIZE,
  type TicketListQuery,
  type TicketPage,
  type TicketSettings,
  type TicketSettingsInput,
  type TicketSummary,
} from '@phenix/shared';
import type { ObjectStorage } from '@phenix/storage';
import { BotEventsService } from '../../core/bot-events.service.js';
import { TRANSCRIPTS } from '../../core/tokens.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

interface TicketConfig {
  ticketCategoryId: string | null;
  ticketStaffRoleIds: string[];
  ticketLogChannelId: string | null;
}

const CONFIG_FIELDS = {
  ticketCategoryId: true,
  ticketStaffRoleIds: true,
  ticketLogChannelId: true,
} as const;

function toSettings(config: TicketConfig, panel: TicketPanel): TicketSettings | null {
  if (!config.ticketCategoryId) return null;
  return {
    categoryId: config.ticketCategoryId,
    staffRoleIds: config.ticketStaffRoleIds,
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

function toSummary(ticket: Ticket): TicketSummary {
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
    hasTranscript: ticket.transcriptKey !== null,
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
   * Enregistre les réglages et le panel ensemble, puis prévient le bot : il relit la config
   * (catégorie, équipe) et publie le panel. Un panel qui change de salon laisse partir l'ancien message.
   */
  async saveSettings(guildId: string, input: TicketSettingsInput): Promise<TicketSettings> {
    await this.assertValid(guildId, input);
    const previous = await findTicketPanel(this.db, guildId);
    const moved =
      previous?.messageId && previous.channelId !== input.panel.channelId ? previous : null;

    const fields = {
      ticketCategoryId: input.categoryId,
      ticketStaffRoleIds: input.staffRoleIds,
      ticketLogChannelId: input.logChannelId,
    };
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
    // La catégorie vient d'être enregistrée : toSettings ne peut pas renvoyer null ici
    return toSettings(config, panel) as TicketSettings;
  }

  async list(guildId: string, query: TicketListQuery): Promise<TicketPage> {
    const status = query.status === 'open' ? 'OPEN' : 'CLOSED';
    const slice = await listTickets(this.db, guildId, status, query.page, TICKET_PAGE_SIZE);
    return { ...slice, tickets: slice.tickets.map(toSummary) };
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

  /** Le schéma vérifie la forme des IDs ; ici on vérifie qu'ils existent sur ce serveur. */
  private async assertValid(guildId: string, input: TicketSettingsInput): Promise<void> {
    const [categories, channels, roles] = await Promise.all([
      this.guilds.categories(guildId),
      this.guilds.channels(guildId),
      this.guilds.roles(guildId),
    ]);
    const channelIds = new Set(channels.map((channel) => channel.id));
    const roleIds = new Set(roles.map((role) => role.id));

    const problems = [
      categories.some((category) => category.id === input.categoryId)
        ? null
        : 'Catégorie inconnue sur ce serveur',
      input.staffRoleIds.every((id) => roleIds.has(id)) ? null : 'Rôle inconnu sur ce serveur',
      input.logChannelId === null || channelIds.has(input.logChannelId)
        ? null
        : 'Salon de logs inconnu sur ce serveur',
      channelIds.has(input.panel.channelId) ? null : 'Salon du panel inconnu sur ce serveur',
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) throw new BadRequestException(problems);
  }
}
