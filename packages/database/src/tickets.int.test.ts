import { afterAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { publicationStatus } from './publication.js';
import {
  closeTicket,
  createTicket,
  findOpenTicket,
  findOpenTicketChannels,
  listTickets,
  markTicketPanelPublished,
  reserveTicketNumber,
  saveTicketPanel,
} from './tickets.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

async function newGuild(): Promise<string> {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

const open = (guildId: string, number: number, ownerId = '1') =>
  createTicket(prisma, {
    guildId,
    number,
    channelId: `${guildId}${number}`,
    ownerId,
    ownerName: `Membre ${ownerId}`,
  });

const closing = { closedById: '2', closedByName: 'Modo', transcriptKey: null, messageCount: 3 };

describe('tickets', () => {
  it('numérote sans doublon, même pour dix ouvertures simultanées', async () => {
    const guildId = await newGuild();

    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => reserveTicketNumber(prisma, guildId)),
    );

    expect(numbers.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('ferme une seule fois, et libère le membre pour un nouveau ticket', async () => {
    const guildId = await newGuild();
    const ticket = await open(guildId, 1);
    expect((await findOpenTicket(prisma, guildId, '1'))?.id).toBe(ticket.id);

    const [first, second] = await Promise.all([
      closeTicket(prisma, ticket.id, closing),
      closeTicket(prisma, ticket.id, closing),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await findOpenTicket(prisma, guildId, '1')).toBe(null);
  });

  it('retrouve les salons des tickets ouverts, et seulement ceux des serveurs demandés', async () => {
    const [guildId, otherId] = [await newGuild(), await newGuild()];
    const first = await open(guildId, 1, '1');
    const second = await open(guildId, 2, '2');
    await open(otherId, 1, '1');
    await closeTicket(prisma, second.id, closing);

    expect(await findOpenTicketChannels(prisma, [guildId])).toEqual([
      { id: first.id, channelId: first.channelId },
    ]);
  });

  it('liste les ouverts du plus ancien, les fermés du plus récent', async () => {
    const guildId = await newGuild();
    const [one, two, three] = [
      await open(guildId, 1, 'a'),
      await open(guildId, 2, 'b'),
      await open(guildId, 3, 'c'),
    ];
    await closeTicket(prisma, one.id, { ...closing, now: new Date('2026-11-01') });
    await closeTicket(prisma, two.id, { ...closing, now: new Date('2026-11-05') });

    const opened = await listTickets(prisma, guildId, 'OPEN', 1, 10);
    const closed = await listTickets(prisma, guildId, 'CLOSED', 1, 10);

    expect(opened.tickets.map((ticket) => ticket.id)).toEqual([three.id]);
    expect(closed.tickets.map((ticket) => ticket.number)).toEqual([2, 1]);
  });
});

describe('panel de tickets', () => {
  it('repasse en attente à chaque enregistrement, et oublie le message s’il change de salon', async () => {
    const guildId = await newGuild();
    const panel = {
      channelId: '400000000000000001',
      title: 'Aide',
      description: null,
      buttonLabel: 'Ouvrir',
    };

    await saveTicketPanel(prisma, guildId, panel);
    await markTicketPanelPublished(prisma, guildId, '900000000000000009');
    const kept = await saveTicketPanel(prisma, guildId, { ...panel, title: 'Support' });
    expect(publicationStatus(kept)).toBe('pending');
    expect(kept.messageId).toBe('900000000000000009');

    const moved = await saveTicketPanel(prisma, guildId, panel, { forgetMessage: true });
    expect(moved.messageId).toBe(null);
  });
});
