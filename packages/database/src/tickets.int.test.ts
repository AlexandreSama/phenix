import type { RawTicketStats, TicketTypeInput } from '@phenix/shared';
import { afterAll, describe, expect, expectTypeOf, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { publicationStatus } from './publication.js';
import {
  claimTicket,
  closeTicket,
  createTicket,
  deleteTicketType,
  findOpenTicket,
  findInactivityCandidates,
  findOpenTicketChannels,
  listTicketTypes,
  listTickets,
  markTicketInactivityFailed,
  markTicketInactivityReminded,
  markTicketPanelPublished,
  rateTicket,
  reserveTicketNumber,
  saveTicketPanel,
  saveTicketType,
  ticketRatingStats,
  touchTicketActivity,
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

const question = {
  label: 'Quel est ton problème ?',
  placeholder: null,
  style: 'PARAGRAPH' as const,
  required: true,
  maxLength: 1000,
};

const typeInput: TicketTypeInput = {
  name: 'Support',
  description: null,
  emoji: '🎫',
  categoryId: '100000000000000001',
  staffRoleIds: ['200000000000000001'],
  inactivityHours: null,
  questions: [
    question,
    { ...question, label: 'Ton pseudo en jeu', style: 'SHORT', required: false, maxLength: 50 },
  ],
};

describe('types de tickets', () => {
  it('liste les types de l’ordre de création, chacun avec ses questions dans l’ordre', async () => {
    const guildId = await newGuild();
    const other = await newGuild();
    await saveTicketType(prisma, guildId, typeInput);
    await saveTicketType(prisma, guildId, { ...typeInput, name: 'Recrutement', questions: [] });
    await saveTicketType(prisma, other, { ...typeInput, name: 'Ailleurs' });

    const types = await listTicketTypes(prisma, guildId);

    expect(types.map((type) => [type.name, type.position])).toEqual([
      ['Support', 0],
      ['Recrutement', 1],
    ]);
    expect(types[0]).toMatchObject({
      emoji: '🎫',
      categoryId: '100000000000000001',
      staffRoleIds: ['200000000000000001'],
    });
    expect(types[0]?.questions.map((q) => [q.position, q.label, q.style])).toEqual([
      [0, 'Quel est ton problème ?', 'PARAGRAPH'],
      [1, 'Ton pseudo en jeu', 'SHORT'],
    ]);
    expect(types[1]?.questions).toEqual([]);
  });

  it('remplace tout le contenu à la modification : questions réécrites dans l’ordre reçu', async () => {
    const guildId = await newGuild();
    const created = await saveTicketType(prisma, guildId, typeInput);
    const [first, second] = created.questions;

    const updated = await saveTicketType(
      prisma,
      guildId,
      {
        ...typeInput,
        name: 'Aide',
        staffRoleIds: ['200000000000000002', '200000000000000003'],
        questions: [
          { ...question, label: 'Dernière en premier', style: 'SHORT' },
          { ...question, label: 'Quel est ton problème ?' },
        ],
      },
      created.id,
    );

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Aide');
    expect(updated.position).toBe(created.position);
    expect(updated.staffRoleIds).toEqual(['200000000000000002', '200000000000000003']);
    expect(updated.questions.map((q) => [q.position, q.label])).toEqual([
      [0, 'Dernière en premier'],
      [1, 'Quel est ton problème ?'],
    ]);
    // Les anciennes questions sont supprimées, pas gardées en double
    expect(updated.questions.map((q) => q.id)).not.toContain(first!.id);
    expect(updated.questions.map((q) => q.id)).not.toContain(second!.id);
    expect(await prisma.ticketTypeQuestion.count({ where: { typeId: created.id } })).toBe(2);
  });

  it('refuse de modifier le type d’un autre serveur', async () => {
    const guildId = await newGuild();
    const other = await newGuild();
    const created = await saveTicketType(prisma, guildId, typeInput);

    await expect(saveTicketType(prisma, other, typeInput, created.id)).rejects.toThrow(
      /No .TicketType. record/,
    );
    expect((await listTicketTypes(prisma, guildId))[0]?.name).toBe('Support');
  });

  it('rattache le ticket à son type, et la liste en donne le nom', async () => {
    const guildId = await newGuild();
    const type = await saveTicketType(prisma, guildId, typeInput);
    const typed = await createTicket(prisma, {
      guildId,
      number: 1,
      channelId: `${guildId}1`,
      ownerId: '1',
      ownerName: 'Membre 1',
      typeId: type.id,
    });
    await open(guildId, 2, '2');

    const { tickets } = await listTickets(prisma, guildId, 'OPEN', 1, 10);

    expect(typed.typeId).toBe(type.id);
    expect(tickets.map((ticket) => [ticket.number, ticket.type?.name ?? null])).toEqual([
      [1, 'Support'],
      [2, null],
    ]);
  });

  it('ne garde aucune réponse de formulaire en base', async () => {
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('Ticket', 'TicketType', 'TicketTypeQuestion')
        AND (column_name ILIKE '%answer%' OR column_name ILIKE '%reponse%' OR column_name ILIKE '%response%')`;
    expect(columns).toEqual([]);
  });

  it('supprime un type sans ticket ouvert : ses questions partent, ses tickets fermés gardent leur historique sans type', async () => {
    const guildId = await newGuild();
    const type = await saveTicketType(prisma, guildId, typeInput);
    const ticket = await createTicket(prisma, {
      guildId,
      number: 1,
      channelId: `${guildId}1`,
      ownerId: '1',
      ownerName: 'Membre 1',
      typeId: type.id,
    });
    await closeTicket(prisma, ticket.id, closing);

    expect(await deleteTicketType(prisma, guildId, type.id)).toBe('deleted');

    expect(await listTicketTypes(prisma, guildId)).toEqual([]);
    expect(await prisma.ticketTypeQuestion.count({ where: { typeId: type.id } })).toBe(0);
    const kept = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(kept.typeId).toBe(null);
    expect(kept.status).toBe('CLOSED');
  });

  it('refuse de supprimer un type qui a encore un ticket ouvert', async () => {
    const guildId = await newGuild();
    const type = await saveTicketType(prisma, guildId, typeInput);
    await createTicket(prisma, {
      guildId,
      number: 1,
      channelId: `${guildId}1`,
      ownerId: '1',
      ownerName: 'Membre 1',
      typeId: type.id,
    });

    expect(await deleteTicketType(prisma, guildId, type.id)).toBe('has_open_tickets');

    expect(await listTicketTypes(prisma, guildId)).toHaveLength(1);
  });

  it('ne supprime pas le type d’un autre serveur, ni un type qui n’existe pas', async () => {
    const guildId = await newGuild();
    const other = await newGuild();
    const type = await saveTicketType(prisma, guildId, typeInput);

    expect(await deleteTicketType(prisma, other, type.id)).toBe('not_found');
    expect(await deleteTicketType(prisma, guildId, 2_000_000_000)).toBe('not_found');
    expect(await listTicketTypes(prisma, guildId)).toHaveLength(1);
  });
});

describe('prise en charge', () => {
  const claimer = { id: '7', name: 'Modo Sept' };

  it('prend un ticket ouvert en charge et retient qui et quand', async () => {
    const guildId = await newGuild();
    const ticket = await open(guildId, 1);

    expect(await claimTicket(prisma, ticket.id, claimer)).toEqual({ claimed: true });

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row).toMatchObject({ claimedById: '7', claimedByName: 'Modo Sept' });
    expect(row.claimedAt).toBeInstanceOf(Date);
  });

  it('n’a qu’un gagnant quand deux personnes cliquent en même temps (10 essais)', async () => {
    const guildId = await newGuild();

    for (let round = 1; round <= 10; round += 1) {
      const ticket = await open(guildId, round);

      const results = await Promise.all([
        claimTicket(prisma, ticket.id, { id: '7', name: 'Sept' }),
        claimTicket(prisma, ticket.id, { id: '8', name: 'Huit' }),
      ]);

      expect(results.filter((result) => result.claimed)).toHaveLength(1);
      const loser = results.find((result) => !result.claimed);
      const winner = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(loser).toEqual({ claimed: false, claimedByName: winner.claimedByName });
    }
  });

  it('refuse un ticket déjà pris, et dit par qui', async () => {
    const guildId = await newGuild();
    const ticket = await open(guildId, 1);
    await claimTicket(prisma, ticket.id, claimer);

    expect(await claimTicket(prisma, ticket.id, { id: '8', name: 'Huit' })).toEqual({
      claimed: false,
      claimedByName: 'Modo Sept',
    });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.claimedById).toBe('7');
  });

  it('refuse un ticket fermé ou inconnu, sans nom à afficher', async () => {
    const guildId = await newGuild();
    const ticket = await open(guildId, 1);
    await closeTicket(prisma, ticket.id, closing);

    expect(await claimTicket(prisma, ticket.id, claimer)).toEqual({
      claimed: false,
      claimedByName: null,
    });
    expect(await claimTicket(prisma, 2_000_000_000, claimer)).toEqual({
      claimed: false,
      claimedByName: null,
    });
  });

  it('refuse un ticket pris puis fermé, sans dire par qui', async () => {
    const guildId = await newGuild();
    const ticket = await open(guildId, 1);
    await claimTicket(prisma, ticket.id, claimer);
    await closeTicket(prisma, ticket.id, closing);

    expect(await claimTicket(prisma, ticket.id, { id: '8', name: 'Huit' })).toEqual({
      claimed: false,
      claimedByName: null,
    });
  });

  it('remonte claimedByName dans la liste', async () => {
    const guildId = await newGuild();
    const [taken, free] = [await open(guildId, 1), await open(guildId, 2)];
    await claimTicket(prisma, taken.id, claimer);

    const { tickets } = await listTickets(prisma, guildId, 'OPEN', 1, 10);

    expect(tickets.map((ticket) => [ticket.id, ticket.claimedByName])).toEqual([
      [taken.id, 'Modo Sept'],
      [free.id, null],
    ]);
  });
});

const rating = async (id: number) =>
  (await prisma.ticket.findUniqueOrThrow({ where: { id } })).rating;

describe('note du ticket', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  async function closedTicket(guildId: string, number: number, closedAt = daysAgo(1)) {
    const ticket = await open(guildId, number, '1');
    await closeTicket(prisma, ticket.id, { ...closing, now: closedAt });
    return ticket;
  }
  it('enregistre la note de l’auteur sur un ticket fermé, avec la date', async () => {
    const ticket = await closedTicket(await newGuild(), 1);

    expect(await rateTicket(prisma, ticket.id, '1', 4, now)).toBe('rated');

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.rating).toBe(4);
    expect(row.ratedAt).toEqual(now);
  });

  it.each([1, 5])('accepte la note %i au premier clic', async (score) => {
    const ticket = await closedTicket(await newGuild(), 1);

    expect(await rateTicket(prisma, ticket.id, '1', score, now)).toBe('rated');
    expect(await rating(ticket.id)).toBe(score);
  });

  it('ne retient qu’une note pour deux clics simultanés (10 essais)', async () => {
    const guildId = await newGuild();

    for (let round = 1; round <= 10; round += 1) {
      const ticket = await closedTicket(guildId, round);

      const results = await Promise.all([
        rateTicket(prisma, ticket.id, '1', 5, now),
        rateTicket(prisma, ticket.id, '1', 2, now),
      ]);

      expect(results.toSorted()).toEqual(['already_rated', 'rated']);
      expect([5, 2]).toContain(await rating(ticket.id));
    }
  });

  it('dit « déjà noté » au second clic sans changer la note', async () => {
    const ticket = await closedTicket(await newGuild(), 1);
    await rateTicket(prisma, ticket.id, '1', 5, now);

    expect(await rateTicket(prisma, ticket.id, '1', 1, now)).toBe('already_rated');
    expect(await rating(ticket.id)).toBe(5);
  });

  it('refuse quelqu’un d’autre que l’auteur, sans rien écrire', async () => {
    const ticket = await closedTicket(await newGuild(), 1);

    expect(await rateTicket(prisma, ticket.id, '999', 5, now)).toBe('refused');
    expect(await rating(ticket.id)).toBe(null);
  });

  it('refuse un tiers sur un ticket déjà noté : jamais « déjà noté », note inchangée', async () => {
    const ticket = await closedTicket(await newGuild(), 1);
    await rateTicket(prisma, ticket.id, '1', 4, now);

    expect(await rateTicket(prisma, ticket.id, '999', 1, now)).toBe('refused');
    expect(await rating(ticket.id)).toBe(4);
  });

  it('refuse un ticket encore ouvert ou inconnu', async () => {
    const ticket = await open(await newGuild(), 1, '1');

    expect(await rateTicket(prisma, ticket.id, '1', 5, now)).toBe('refused');
    expect(await rateTicket(prisma, 2_000_000_000, '1', 5, now)).toBe('refused');
    expect(await rating(ticket.id)).toBe(null);
  });

  it('accepte jusqu’à 7 jours exactement après la fermeture, refuse au-delà', async () => {
    const guildId = await newGuild();
    const edge = await closedTicket(guildId, 1, daysAgo(7));
    const late = await closedTicket(guildId, 2, new Date(daysAgo(7).getTime() - 1));

    expect(await rateTicket(prisma, edge.id, '1', 3, now)).toBe('rated');
    expect(await rateTicket(prisma, late.id, '1', 3, now)).toBe('refused');
    expect(await rating(late.id)).toBe(null);
  });

  it.each([0, 6, -1, 2.5, Number.NaN])('refuse la note %s', async (invalid) => {
    const ticket = await closedTicket(await newGuild(), 1);

    expect(await rateTicket(prisma, ticket.id, '1', invalid, now)).toBe('refused');
    expect(await rating(ticket.id)).toBe(null);
  });

  it('empêche en base une note hors de 1 à 5, même écrite sans passer par le code', async () => {
    const ticket = await closedTicket(await newGuild(), 1);

    await expect(
      prisma.ticket.update({ where: { id: ticket.id }, data: { rating: 6 } }),
    ).rejects.toThrow(/Ticket_rating_check/);
    await expect(
      prisma.ticket.update({ where: { id: ticket.id }, data: { rating: 0 } }),
    ).rejects.toThrow(/Ticket_rating_check/);
  });
});

describe('moyennes des notes', () => {
  const now = new Date('2026-11-13T12:00:00Z');

  async function rated(
    guildId: string,
    number: number,
    score: number,
    options: { typeId?: number; claimer?: { id: string; name: string } } = {},
  ) {
    const ticket = await createTicket(prisma, {
      guildId,
      number,
      channelId: `${guildId}${number}`,
      ownerId: '1',
      ownerName: 'Membre',
      typeId: options.typeId ?? null,
    });
    if (options.claimer) await claimTicket(prisma, ticket.id, options.claimer);
    await closeTicket(prisma, ticket.id, { ...closing, now });
    await rateTicket(prisma, ticket.id, '1', score, now);
    return ticket;
  }

  it('calcule le nombre et la moyenne par type et par personne, tout l’historique', async () => {
    const guildId = await newGuild();
    const support = await saveTicketType(prisma, guildId, { ...typeInput, name: 'Support' });
    const recrutement = await saveTicketType(prisma, guildId, {
      ...typeInput,
      name: 'Recrutement',
    });
    const [anna, bob] = [
      { id: '10', name: 'Anna' },
      { id: '11', name: 'Bob' },
    ];
    await rated(guildId, 1, 5, { typeId: support.id, claimer: anna });
    await rated(guildId, 2, 4, { typeId: support.id, claimer: anna });
    await rated(guildId, 3, 1, { typeId: recrutement.id, claimer: bob });
    // Sans type (type supprimé depuis) et non pris en charge : compté par type, pas par personne
    await rated(guildId, 4, 2);

    const stats = await ticketRatingStats(prisma, guildId);

    // Valeurs exactes, non masquées : c'est l'API qui les prépare pour le site (maskRatingStats)
    expectTypeOf(stats).toEqualTypeOf<RawTicketStats>();
    expect(stats.types).toEqual([
      { typeId: support.id, typeName: 'Support', count: 2, average: 4.5 },
      { typeId: recrutement.id, typeName: 'Recrutement', count: 1, average: 1 },
      { typeId: null, typeName: null, count: 1, average: 2 },
    ]);
    expect(stats.members).toEqual([
      { claimedById: '10', claimedByName: 'Anna', count: 2, average: 4.5 },
      { claimedById: '11', claimedByName: 'Bob', count: 1, average: 1 },
    ]);
  });

  it('ignore les tickets non notés, et ne mélange pas les serveurs', async () => {
    const [guildId, otherId] = [await newGuild(), await newGuild()];
    const claimer = { id: '10', name: 'Anna' };
    await rated(guildId, 1, 3, { claimer });
    await rated(otherId, 1, 5, { claimer });
    const unrated = await open(guildId, 2);
    await claimTicket(prisma, unrated.id, claimer);

    const stats = await ticketRatingStats(prisma, guildId);

    expect(stats.types).toEqual([{ typeId: null, typeName: null, count: 1, average: 3 }]);
    expect(stats.members).toEqual([
      { claimedById: '10', claimedByName: 'Anna', count: 1, average: 3 },
    ]);
  });

  it('renvoie des listes vides pour un serveur sans note', async () => {
    expect(await ticketRatingStats(prisma, await newGuild())).toEqual({ types: [], members: [] });
  });

  it('garde le dernier pseudo d’une personne qui a changé de nom', async () => {
    const guildId = await newGuild();
    const first = await rated(guildId, 1, 5, { claimer: { id: '10', name: 'Ancien' } });
    await prisma.ticket.update({
      where: { id: first.id },
      data: { claimedAt: new Date('2026-01-01') },
    });
    await rated(guildId, 2, 3, { claimer: { id: '10', name: 'Nouveau' } });

    const stats = await ticketRatingStats(prisma, guildId);

    expect(stats.members).toEqual([
      { claimedById: '10', claimedByName: 'Nouveau', count: 2, average: 4 },
    ]);
  });
});

describe('fermeture automatique après inactivité', () => {
  const t0 = new Date('2026-11-13T10:00:00Z');
  const t1 = new Date('2026-11-13T11:00:00Z');
  const t2 = new Date('2026-11-13T12:00:00Z');

  const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });

  async function openAt(guildId: string, number: number, lastActivityAt: Date) {
    const ticket = await open(guildId, number, `${number}`);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { lastActivityAt } });
    return ticket;
  }

  function newType(guildId: string, inactivityHours: number | null) {
    return saveTicketType(prisma, guildId, { ...typeInput, inactivityHours });
  }

  async function openWithType(
    guildId: string,
    number: number,
    typeId: number | null,
    lastActivityAt: Date,
  ) {
    const ticket = await createTicket(prisma, {
      guildId,
      number,
      channelId: `${guildId}${number}`,
      ownerId: `${number}`,
      ownerName: `Membre ${number}`,
      typeId,
    });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { lastActivityAt } });
    return ticket;
  }

  describe('colonnes', () => {
    it('lastActivityAt part de la création, rien n’est rappelé ni fermé par défaut', async () => {
      const before = Date.now();
      const ticket = await open(await newGuild(), 1);
      const saved = await row(ticket.id);

      expect(saved.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before - 5000);
      expect(saved.lastActivityAt.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
      expect(saved.inactivityRemindedAt).toBeNull();
      expect(saved.closedVia).toBeNull();
    });

    it('enregistre le délai d’inactivité du type, et sait le désactiver', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 48);
      expect(type.inactivityHours).toBe(48);
      const off = await saveTicketType(
        prisma,
        guildId,
        { ...typeInput, inactivityHours: null },
        type.id,
      );
      expect(off.inactivityHours).toBeNull();
    });
  });

  describe('touchTicketActivity', () => {
    it('met à jour l’activité et efface le rappel, sur un ticket ouvert', async () => {
      const guildId = await newGuild();
      const ticket = await openAt(guildId, 1, t0);
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { inactivityRemindedAt: t1 },
      });

      expect(await touchTicketActivity(prisma, ticket.channelId, t2)).toBe(true);

      const saved = await row(ticket.id);
      expect(saved.lastActivityAt).toEqual(t2);
      expect(saved.inactivityRemindedAt).toBeNull();
    });

    it('ne touche jamais un ticket fermé', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await closeTicket(prisma, ticket.id, closing);

      expect(await touchTicketActivity(prisma, ticket.channelId, t2)).toBe(false);
      expect((await row(ticket.id)).lastActivityAt).toEqual(t0);
    });

    it('ne fait rien pour un salon qui n’est pas un ticket', async () => {
      expect(await touchTicketActivity(prisma, '999999999999999999', t2)).toBe(false);
    });

    it('ne touche que le ticket de ce salon', async () => {
      const guildId = await newGuild();
      const a = await openAt(guildId, 1, t0);
      const b = await openAt(guildId, 2, t0);

      await touchTicketActivity(prisma, a.channelId, t2);

      expect((await row(b.id)).lastActivityAt).toEqual(t0);
    });

    it('utilise l’heure courante sans date fournie', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await touchTicketActivity(prisma, ticket.channelId);
      expect(Date.now() - (await row(ticket.id)).lastActivityAt.getTime()).toBeLessThan(10_000);
    });

    describe('écriture monotone quand une date est fournie', () => {
      it('une date plus ancienne que lastActivityAt ne change rien, et ne vide pas le rappel', async () => {
        const ticket = await openAt(await newGuild(), 1, t2);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inactivityRemindedAt: t2 },
        });

        expect(await touchTicketActivity(prisma, ticket.channelId, t1)).toBe(false);

        const saved = await row(ticket.id);
        expect(saved.lastActivityAt).toEqual(t2);
        expect(saved.inactivityRemindedAt).toEqual(t2);
      });

      it('une date égale à lastActivityAt ne change rien', async () => {
        const ticket = await openAt(await newGuild(), 1, t1);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inactivityRemindedAt: t2 },
        });

        expect(await touchTicketActivity(prisma, ticket.channelId, t1)).toBe(false);
        expect((await row(ticket.id)).inactivityRemindedAt).toEqual(t2);
      });

      it('une date plus récente met à jour et vide le rappel', async () => {
        const ticket = await openAt(await newGuild(), 1, t0);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inactivityRemindedAt: t1 },
        });

        expect(await touchTicketActivity(prisma, ticket.channelId, t1)).toBe(true);

        const saved = await row(ticket.id);
        expect(saved.lastActivityAt).toEqual(t1);
        expect(saved.inactivityRemindedAt).toBeNull();
      });

      it('sans date (maintenant), l’écriture reste inconditionnelle', async () => {
        const future = new Date(Date.now() + 3_600_000);
        const ticket = await openAt(await newGuild(), 1, future);

        expect(await touchTicketActivity(prisma, ticket.channelId)).toBe(true);
        expect((await row(ticket.id)).lastActivityAt.getTime()).toBeLessThan(future.getTime());
      });

      it('deux appels concurrents : la date la plus récente gagne quel que soit l’ordre (10 essais)', async () => {
        const guildId = await newGuild();
        for (let i = 1; i <= 10; i++) {
          const ticket = await openAt(guildId, i, t0);
          const calls = [
            () => touchTicketActivity(prisma, ticket.channelId, t1),
            () => touchTicketActivity(prisma, ticket.channelId, t2),
          ];
          if (i % 2 === 0) calls.reverse();
          await Promise.all(calls.map((call) => call()));
          expect((await row(ticket.id)).lastActivityAt).toEqual(t2);
        }
      });

      it('deux appels successifs, le plus récent d’abord : le plus ancien ne fait pas reculer', async () => {
        const ticket = await openAt(await newGuild(), 1, t0);

        await touchTicketActivity(prisma, ticket.channelId, t2);
        await touchTicketActivity(prisma, ticket.channelId, t1);

        expect((await row(ticket.id)).lastActivityAt).toEqual(t2);
      });
    });
  });

  describe('markTicketInactivityReminded', () => {
    it('note le rappel quand l’activité n’a pas bougé', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);

      expect(await markTicketInactivityReminded(prisma, ticket.id, t0, t1)).toBe(true);

      const saved = await row(ticket.id);
      expect(saved.inactivityRemindedAt).toEqual(t1);
      expect(saved.lastActivityAt).toEqual(t0);
    });

    it('refuse si quelqu’un a écrit entre-temps : aucun rappel noté', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await touchTicketActivity(prisma, ticket.channelId, t1);

      expect(await markTicketInactivityReminded(prisma, ticket.id, t0, t2)).toBe(false);
      expect((await row(ticket.id)).inactivityRemindedAt).toBeNull();
    });

    it('ne rappelle qu’une fois, même pour deux traitements simultanés (10 essais)', async () => {
      const guildId = await newGuild();
      for (let i = 1; i <= 10; i++) {
        const ticket = await openAt(guildId, i, t0);
        const results = await Promise.all([
          markTicketInactivityReminded(prisma, ticket.id, t0, t1),
          markTicketInactivityReminded(prisma, ticket.id, t0, t1),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
      }
    });

    it('refuse un ticket déjà rappelé, sans changer la date du rappel', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await markTicketInactivityReminded(prisma, ticket.id, t0, t1);

      expect(await markTicketInactivityReminded(prisma, ticket.id, t0, t2)).toBe(false);
      expect((await row(ticket.id)).inactivityRemindedAt).toEqual(t1);
    });

    it('refuse un ticket fermé ou inconnu', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await closeTicket(prisma, ticket.id, closing);

      expect(await markTicketInactivityReminded(prisma, ticket.id, t0, t1)).toBe(false);
      expect(await markTicketInactivityReminded(prisma, 2_000_000_000, t0, t1)).toBe(false);
    });
  });

  describe('closeTicket avec closedVia et expectedLastActivityAt', () => {
    it('écrit la source de la fermeture', async () => {
      const guildId = await newGuild();
      const a = await openAt(guildId, 1, t0);
      const b = await openAt(guildId, 2, t0);
      const c = await openAt(guildId, 3, t0);

      await closeTicket(prisma, a.id, { ...closing, closedVia: 'BUTTON' });
      await closeTicket(prisma, b.id, { ...closing, closedVia: 'INACTIVITY' });
      await closeTicket(prisma, c.id, { ...closing, closedVia: 'CHANNEL_DELETED' });

      expect((await row(a.id)).closedVia).toBe('BUTTON');
      expect((await row(b.id)).closedVia).toBe('INACTIVITY');
      expect((await row(c.id)).closedVia).toBe('CHANNEL_DELETED');
    });

    it('sans closedVia, un appel existant ferme comme avant (closedVia null)', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);

      expect(await closeTicket(prisma, ticket.id, closing)).toBe(true);

      const saved = await row(ticket.id);
      expect(saved.status).toBe('CLOSED');
      expect(saved.closedVia).toBeNull();
    });

    it('ferme quand l’activité attendue est toujours la dernière', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);

      expect(
        await closeTicket(prisma, ticket.id, {
          ...closing,
          closedVia: 'INACTIVITY',
          expectedLastActivityAt: t0,
        }),
      ).toBe(true);
      expect((await row(ticket.id)).status).toBe('CLOSED');
    });

    it('ne ferme pas si quelqu’un a écrit entre-temps : le ticket reste ouvert, intact', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await touchTicketActivity(prisma, ticket.channelId, t1);

      expect(
        await closeTicket(prisma, ticket.id, {
          ...closing,
          closedVia: 'INACTIVITY',
          expectedLastActivityAt: t0,
        }),
      ).toBe(false);

      const saved = await row(ticket.id);
      expect(saved.status).toBe('OPEN');
      expect(saved.closedVia).toBeNull();
      expect(saved.closedAt).toBeNull();
      expect(saved.closedByName).toBeNull();
      expect(saved.lastActivityAt).toEqual(t1);
    });

    it('une fermeture manuelle (sans expectedLastActivityAt) l’emporte quelle que soit l’activité', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      await touchTicketActivity(prisma, ticket.channelId, t1);

      expect(await closeTicket(prisma, ticket.id, { ...closing, closedVia: 'BUTTON' })).toBe(true);
    });
  });

  describe('frontières à la milliseconde', () => {
    const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

    it('closeTicket ne ferme pas si l’activité attendue est décalée d’1 ms, dans un sens ou l’autre', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);
      const auto = { ...closing, closedVia: 'INACTIVITY' as const };

      expect(
        await closeTicket(prisma, ticket.id, { ...auto, expectedLastActivityAt: ms(t0, 1) }),
      ).toBe(false);
      expect(
        await closeTicket(prisma, ticket.id, { ...auto, expectedLastActivityAt: ms(t0, -1) }),
      ).toBe(false);
      expect((await row(ticket.id)).status).toBe('OPEN');
    });

    it('markTicketInactivityReminded ne note rien si l’activité lue est décalée d’1 ms', async () => {
      const ticket = await openAt(await newGuild(), 1, t0);

      expect(await markTicketInactivityReminded(prisma, ticket.id, ms(t0, 1), t1)).toBe(false);
      expect(await markTicketInactivityReminded(prisma, ticket.id, ms(t0, -1), t1)).toBe(false);
      expect((await row(ticket.id)).inactivityRemindedAt).toBeNull();
    });
  });

  describe('changement du délai d’un type (saveTicketType)', () => {
    async function remindedTicket(guildId: string, number: number, typeId: number) {
      const ticket = await openWithType(guildId, number, typeId, t0);
      await markTicketInactivityReminded(prisma, ticket.id, t0, t1);
      return ticket;
    }
    const save = (guildId: string, id: number, inactivityHours: number | null, name = 'Support') =>
      saveTicketType(prisma, guildId, { ...typeInput, name, inactivityHours }, id);

    it('un nouveau délai efface les rappels des tickets OUVERTS du type : jamais de fermeture plus tôt qu’annoncé', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      const other = await newType(guildId, 24);
      const mineOpen = await remindedTicket(guildId, 1, type.id);
      const otherOpen = await remindedTicket(guildId, 2, other.id);
      const closed = await remindedTicket(guildId, 3, type.id);
      await closeTicket(prisma, closed.id, closing);

      await save(guildId, type.id, 12);

      expect((await row(mineOpen.id)).inactivityRemindedAt).toBeNull();
      expect((await row(mineOpen.id)).lastActivityAt).toEqual(t0);
      expect((await row(otherOpen.id)).inactivityRemindedAt).toEqual(t1);
      expect((await row(closed.id)).inactivityRemindedAt).toEqual(t1);
    });

    it('un délai inchangé (autre champ modifié) garde les rappels', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      const ticket = await remindedTicket(guildId, 1, type.id);

      await save(guildId, type.id, 24, 'Renommé');

      expect((await row(ticket.id)).inactivityRemindedAt).toEqual(t1);
    });

    it('désactivé (null) puis réactivé : les rappels sont effacés à chaque changement', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      const ticket = await remindedTicket(guildId, 1, type.id);

      await save(guildId, type.id, null);
      expect((await row(ticket.id)).inactivityRemindedAt).toBeNull();

      // Un rappel resté d'avant (posé pendant que le délai était encore actif, par exemple)
      await prisma.ticket.update({ where: { id: ticket.id }, data: { inactivityRemindedAt: t1 } });
      await save(guildId, type.id, 24);
      expect((await row(ticket.id)).inactivityRemindedAt).toBeNull();
    });

    it('un type d’un autre serveur n’est ni modifié ni ses tickets touchés', async () => {
      const guildId = await newGuild();
      const intruder = await newGuild();
      const type = await newType(guildId, 24);
      const ticket = await remindedTicket(guildId, 1, type.id);

      await expect(save(intruder, type.id, 12)).rejects.toThrow(/No .TicketType. record/);

      expect((await row(ticket.id)).inactivityRemindedAt).toEqual(t1);
    });
  });

  describe('markTicketInactivityFailed', () => {
    it('note l’échec d’un ticket ouvert, pas d’un ticket fermé', async () => {
      const guildId = await newGuild();
      const ticket = await openAt(guildId, 1, t0);
      const closed = await openAt(guildId, 2, t0);
      await closeTicket(prisma, closed.id, closing);

      expect(await markTicketInactivityFailed(prisma, ticket.id, t1)).toBe(true);
      expect(await markTicketInactivityFailed(prisma, closed.id, t1)).toBe(false);

      expect((await row(ticket.id)).inactivityFailedAt).toEqual(t1);
      expect((await row(closed.id)).inactivityFailedAt).toBeNull();
    });
  });

  describe('findInactivityCandidates', () => {
    const HOUR = 3_600_000;
    const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);
    const LIMITS = { limit: 1000, perGuildLimit: 1000 };
    const mine = async (guildId: string, now: Date, limits = LIMITS) =>
      (await findInactivityCandidates(prisma, { now, ...limits })).filter(
        (candidate) => candidate.guildId === guildId,
      );

    /**
     * Les fichiers de tests partagent la base : une époque à part (bien avant les autres données)
     * pour les tests qui regardent la liste entière et ses plafonds. Chaque époque est un an AVANT
     * la précédente : les tickets d'un test précédent sont alors dans le futur, jamais dus.
     */
    let eraCount = 0;
    const newEra = () => new Date(Date.UTC(2010 - eraCount++, 0, 1));

    /** Des tickets ouverts d'un type, d'un coup, avec leur dernière activité. */
    async function bulk(
      guildId: string,
      typeId: number,
      count: number,
      lastActivityAt: Date,
      extra: { inactivityFailedAt?: Date } = {},
    ) {
      const first = (await prisma.ticket.count({ where: { guildId } })) + 1;
      await prisma.ticket.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          guildId,
          number: first + index,
          channelId: `${guildId}-${first + index}`,
          ownerId: `${first + index}`,
          typeId,
          lastActivityAt,
          ...extra,
        })),
      });
    }

    it('ne renvoie que les tickets ouverts dus dont le type a un délai, avec ce qu’il faut pour décider', async () => {
      const guildId = await newGuild();
      const withDelay = await newType(guildId, 24);
      const noDelay = await newType(guildId, null);
      const ok = await openWithType(guildId, 1, withDelay.id, t0);
      await openWithType(guildId, 2, noDelay.id, t0);
      await openWithType(guildId, 3, null, t0);
      const closed = await openWithType(guildId, 4, withDelay.id, t0);
      await closeTicket(prisma, closed.id, closing);
      await markTicketInactivityReminded(prisma, ok.id, t0, t1);

      expect(await mine(guildId, plus(t0, 48 * HOUR))).toEqual([
        {
          id: ok.id,
          guildId,
          channelId: ok.channelId,
          ownerId: '1',
          lastActivityAt: t0,
          inactivityRemindedAt: t1,
          type: { inactivityHours: 24 },
        },
      ]);
    });

    it('trie du plus ancien au plus récent', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 12);
      const recent = await openWithType(guildId, 1, type.id, t2);
      const oldest = await openWithType(guildId, 2, type.id, t0);
      const middle = await openWithType(guildId, 3, type.id, t1);

      expect((await mine(guildId, plus(t2, 12 * HOUR))).map((c) => c.id)).toEqual([
        oldest.id,
        middle.id,
        recent.id,
      ]);
    });

    describe('seuls les tickets DUS sont candidats (délai 24 h)', () => {
      it('sans rappel : pas avant D/2 (1 ms près), candidat à D/2 pile', async () => {
        const guildId = await newGuild();
        const type = await newType(guildId, 24);
        await openWithType(guildId, 1, type.id, t0);

        expect(await mine(guildId, plus(t0, 12 * HOUR - 1))).toEqual([]);
        expect(await mine(guildId, plus(t0, 12 * HOUR))).toHaveLength(1);
      });

      it('rappel posté : pas avant D/2 depuis le rappel ET D depuis l’activité', async () => {
        const guildId = await newGuild();
        const type = await newType(guildId, 24);
        const ticket = await openWithType(guildId, 1, type.id, t0);
        // Rappel tardif à 20 h : fermeture due à 32 h (20 + 12), pas à 24 h
        await markTicketInactivityReminded(prisma, ticket.id, t0, plus(t0, 20 * HOUR));

        expect(await mine(guildId, plus(t0, 24 * HOUR))).toEqual([]);
        expect(await mine(guildId, plus(t0, 32 * HOUR - 1))).toEqual([]);
        expect(await mine(guildId, plus(t0, 32 * HOUR))).toHaveLength(1);
      });

      it('rappel à D/2 : candidat à D pile, pas 1 ms avant', async () => {
        const guildId = await newGuild();
        const type = await newType(guildId, 24);
        const ticket = await openWithType(guildId, 1, type.id, t0);
        await markTicketInactivityReminded(prisma, ticket.id, t0, plus(t0, 12 * HOUR));

        expect(await mine(guildId, plus(t0, 24 * HOUR - 1))).toEqual([]);
        expect(await mine(guildId, plus(t0, 24 * HOUR))).toHaveLength(1);
      });

      it('un rappel antérieur à la dernière activité (incohérent) n’est jamais candidat', async () => {
        const guildId = await newGuild();
        const type = await newType(guildId, 24);
        const ticket = await openWithType(guildId, 1, type.id, t1);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inactivityRemindedAt: t0 },
        });

        expect(await mine(guildId, plus(t1, 1000 * HOUR))).toEqual([]);
      });

      it('passages successifs : rappel, puis rien tout de suite, puis fermeture due à D', async () => {
        const guildId = await newGuild();
        const type = await newType(guildId, 24);
        const ticket = await openWithType(guildId, 1, type.id, t0);
        const first = plus(t0, 12 * HOUR);

        expect(await mine(guildId, first)).toHaveLength(1);
        await markTicketInactivityReminded(prisma, ticket.id, t0, first);
        expect(await mine(guildId, first)).toEqual([]);
        expect(await mine(guildId, plus(first, 5 * 60_000))).toEqual([]);
        expect(await mine(guildId, plus(t0, 24 * HOUR))).toHaveLength(1);
      });
    });

    it('201 tickets dont un seul dû, en dernière position : il est lu malgré le plafond de 200', async () => {
      const era = newEra();
      const guildId = await newGuild();
      const slow = await newType(guildId, 168);
      const fast = await newType(guildId, 12);
      // 200 tickets plus anciennement actifs mais pas encore dus (50 h < 84 h)
      await bulk(guildId, slow.id, 200, plus(era, -50 * HOUR));
      // Le seul dû (7 h ≥ 6 h), le plus récemment actif
      const due = await openWithType(guildId, 999, fast.id, plus(era, -7 * HOUR));

      const candidates = await findInactivityCandidates(prisma, {
        now: era,
        limit: 200,
        perGuildLimit: 200,
      });

      expect(candidates.map((c) => c.id)).toEqual([due.id]);
    });

    it('plafond par serveur : un serveur à 200 tickets dus ne monopolise pas le passage', async () => {
      const era = newEra();
      const busy = await newGuild();
      const quiet = await newGuild();
      const busyType = await newType(busy, 12);
      const quietType = await newType(quiet, 12);
      await bulk(busy, busyType.id, 200, plus(era, -100 * HOUR));
      const lone = await openWithType(quiet, 1, quietType.id, plus(era, -7 * HOUR));

      const candidates = await findInactivityCandidates(prisma, {
        now: era,
        limit: 10,
        perGuildLimit: 5,
      });

      expect(candidates.filter((c) => c.guildId === busy)).toHaveLength(5);
      expect(candidates.filter((c) => c.guildId === quiet).map((c) => c.id)).toEqual([lone.id]);
      expect(candidates).toHaveLength(6);
    });

    it('un serveur à 200 tickets en échec ne bloque pas un autre serveur (recul d’1 h après un échec)', async () => {
      const era = newEra();
      const broken = await newGuild();
      const healthy = await newGuild();
      const brokenType = await newType(broken, 12);
      const healthyType = await newType(healthy, 12);
      await bulk(broken, brokenType.id, 200, plus(era, -100 * HOUR), {
        inactivityFailedAt: plus(era, -HOUR + 1),
      });
      const ok = await openWithType(healthy, 1, healthyType.id, plus(era, -7 * HOUR));

      const candidates = await findInactivityCandidates(prisma, {
        now: era,
        limit: 200,
        perGuildLimit: 25,
      });
      expect(candidates.map((c) => c.id)).toEqual([ok.id]);

      // 1 h après l'échec, nouvel essai (plafonné par serveur)
      const later = await findInactivityCandidates(prisma, {
        now: plus(era, 1),
        limit: 200,
        perGuildLimit: 25,
      });
      expect(later.filter((c) => c.guildId === broken)).toHaveLength(25);
      expect(later.map((c) => c.id)).toContain(ok.id);
    });

    it('un ticket en échec laisse passer les autres tickets dus de son serveur', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      const failing = await openWithType(guildId, 1, type.id, t0);
      const next = await openWithType(guildId, 2, type.id, t1);
      const now = plus(t1, 12 * HOUR);
      await markTicketInactivityFailed(prisma, failing.id, now);

      expect(
        (await mine(guildId, now, { limit: 1000, perGuildLimit: 1 })).map((c) => c.id),
      ).toEqual([next.id]);
    });

    it('ne renvoie rien d’un serveur que le bot a quitté', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      await openWithType(guildId, 1, type.id, t0);
      await prisma.guild.update({ where: { id: guildId }, data: { leftAt: t1 } });

      expect(await mine(guildId, plus(t0, 100 * HOUR))).toEqual([]);
    });

    it('ne renvoie plus le ticket quand on désactive le délai du type', async () => {
      const guildId = await newGuild();
      const type = await newType(guildId, 24);
      await openWithType(guildId, 1, type.id, t0);
      await saveTicketType(prisma, guildId, { ...typeInput, inactivityHours: null }, type.id);

      expect(await mine(guildId, plus(t0, 100 * HOUR))).toEqual([]);
    });
  });
});
