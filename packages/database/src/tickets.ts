import type { PrismaClient, Ticket, TicketPanel } from './generated/prisma/client.js';
import type { TicketPanelInput } from '@phenix/shared';

type TicketDb = Pick<PrismaClient, 'ticket'>;
type PanelDb = Pick<PrismaClient, 'ticketPanel'>;

/**
 * Réserve le numéro du prochain ticket du serveur. L'incrément est atomique dans Postgres :
 * deux tickets ouverts au même instant n'ont jamais le même numéro.
 */
export async function reserveTicketNumber(
  db: Pick<PrismaClient, 'guild'>,
  guildId: string,
): Promise<number> {
  const guild = await db.guild.update({
    where: { id: guildId },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true },
  });
  return guild.ticketCounter;
}

export function createTicket(
  db: TicketDb,
  data: { guildId: string; number: number; channelId: string; ownerId: string; ownerName: string },
): Promise<Ticket> {
  return db.ticket.create({ data });
}

export function findTicket(db: TicketDb, id: number): Promise<Ticket | null> {
  return db.ticket.findUnique({ where: { id } });
}

export function findTicketByChannel(db: TicketDb, channelId: string): Promise<Ticket | null> {
  return db.ticket.findUnique({ where: { channelId } });
}

/** Le ticket encore ouvert d'un membre sur ce serveur : un seul à la fois. */
export function findOpenTicket(
  db: TicketDb,
  guildId: string,
  ownerId: string,
): Promise<Ticket | null> {
  return db.ticket.findFirst({ where: { guildId, ownerId, status: 'OPEN' } });
}

/** Les tickets ouverts de ces serveurs, pour retrouver ceux dont le salon a disparu. */
export function findOpenTicketChannels(
  db: TicketDb,
  guildIds: string[],
): Promise<{ id: number; channelId: string }[]> {
  return db.ticket.findMany({
    where: { guildId: { in: guildIds }, status: 'OPEN' },
    select: { id: true, channelId: true },
  });
}

export interface TicketClosing {
  closedById: string | null;
  closedByName: string | null;
  transcriptKey: string | null;
  messageCount: number | null;
  now?: Date;
}

/**
 * Ferme un ticket ouvert. Renvoie false s'il était déjà fermé :
 * deux clics simultanés sur « Confirmer » ne ferment qu'une fois.
 */
export async function closeTicket(
  db: TicketDb,
  id: number,
  closing: TicketClosing,
): Promise<boolean> {
  const { now = new Date(), ...fields } = closing;
  const { count } = await db.ticket.updateMany({
    where: { id, status: 'OPEN' },
    data: { ...fields, status: 'CLOSED', closedAt: now },
  });
  return count > 0;
}

export interface TicketSlice {
  tickets: Ticket[];
  page: number;
  pageCount: number;
  total: number;
}

/** Les ouverts du plus ancien au plus récent (à traiter d'abord), les fermés du plus récent. */
export async function listTickets(
  db: TicketDb,
  guildId: string,
  status: 'OPEN' | 'CLOSED',
  page: number,
  pageSize: number,
): Promise<TicketSlice> {
  const where = { guildId, status };
  const total = await db.ticket.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const tickets = await db.ticket.findMany({
    where,
    orderBy: status === 'OPEN' ? { createdAt: 'asc' } : { closedAt: 'desc' },
    skip: (current - 1) * pageSize,
    take: pageSize,
  });
  return { tickets, page: current, pageCount, total };
}

/** Serveurs dont le panel a été enregistré pendant que le bot était éteint. */
export async function findPendingTicketPanels(db: PanelDb, guildIds: string[]): Promise<string[]> {
  const rows = await db.ticketPanel.findMany({
    where: { guildId: { in: guildIds }, publishedAt: null, publishError: null },
    select: { guildId: true },
  });
  return rows.map((row) => row.guildId);
}

export function findTicketPanel(db: PanelDb, guildId: string): Promise<TicketPanel | null> {
  return db.ticketPanel.findUnique({ where: { guildId } });
}

/** Crée ou remplace le panel du serveur ; il repasse « en attente » jusqu'à ce que le bot le publie. */
export function saveTicketPanel(
  db: PanelDb,
  guildId: string,
  input: TicketPanelInput,
  options: { forgetMessage?: boolean } = {},
): Promise<TicketPanel> {
  const fields = {
    ...input,
    publishedAt: null,
    publishError: null,
    // Nouveau salon : le bot postera un message neuf au lieu de modifier l'ancien
    ...(options.forgetMessage ? { messageId: null } : {}),
  };
  return db.ticketPanel.upsert({
    where: { guildId },
    create: { ...fields, guildId },
    update: fields,
  });
}

export async function markTicketPanelPublished(
  db: PanelDb,
  guildId: string,
  messageId: string,
): Promise<void> {
  await db.ticketPanel.updateMany({
    where: { guildId },
    data: { messageId, publishedAt: new Date(), publishError: null },
  });
}

export async function markTicketPanelFailed(
  db: PanelDb,
  guildId: string,
  error: string,
): Promise<void> {
  await db.ticketPanel.updateMany({
    where: { guildId },
    data: { publishedAt: null, publishError: error },
  });
}
