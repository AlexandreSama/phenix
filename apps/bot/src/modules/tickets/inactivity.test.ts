import { DiscordAPIError } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import {
  inactivityDecision,
  inactivityReminder,
  MAX_CLOSES_PER_PASS,
  processInactivity,
} from './inactivity.js';

const database = vi.hoisted(() => ({
  closeTicket: vi.fn(),
  findInactivityCandidates: vi.fn(),
  findTicket: vi.fn(),
  markTicketInactivityFailed: vi.fn(),
  markTicketInactivityReminded: vi.fn(),
  touchTicketActivity: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const close = vi.hoisted(() => ({ finishTicketClose: vi.fn() }));
vi.mock('./close.js', async (importActual) => ({
  ...(await importActual<typeof import('./close.js')>()),
  finishTicketClose: close.finishTicketClose,
}));

const HOUR = 3_600_000;
const T0 = new Date('2026-11-10T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('inactivityDecision', () => {
  // Délai de 24 h : rappel à 12 h, fermeture à 24 h
  const D = 24;
  const decide = (
    reminded: number | null,
    now: number,
    hours: number | null = D,
    last: number = 0,
  ) =>
    inactivityDecision(
      {
        lastActivityAt: at(last),
        inactivityRemindedAt: reminded === null ? null : at(reminded),
        inactivityHours: hours,
      },
      at(now),
    );

  describe('sans rappel posté', () => {
    it('rien juste avant la moitié du délai (D/2 - 1 ms)', () => {
      expect(decide(null, (D / 2) * HOUR - 1)).toBe('none');
    });

    it('rappel pile à la moitié du délai (D/2)', () => {
      expect(decide(null, (D / 2) * HOUR)).toBe('remind');
    });

    it('rappel juste après la moitié du délai (D/2 + 1 ms)', () => {
      expect(decide(null, (D / 2) * HOUR + 1)).toBe('remind');
    });

    it('jamais de fermeture sans rappel préalable, même très en retard (panne du bot)', () => {
      expect(decide(null, D * HOUR)).toBe('remind');
      expect(decide(null, 10 * D * HOUR)).toBe('remind');
    });

    it('rien tant que le délai est null (fermeture automatique désactivée)', () => {
      expect(decide(null, 100 * D * HOUR, null)).toBe('none');
      expect(decide(0, 100 * D * HOUR, null)).toBe('none');
    });

    it('un délai nul, négatif ou non fini ne déclenche rien', () => {
      for (const hours of [0, -24, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(decide(null, 100 * D * HOUR, hours)).toBe('none');
      }
    });

    it('une activité dans le futur (horloges décalées) ne déclenche rien', () => {
      expect(decide(null, 0, D, 5 * HOUR)).toBe('none');
    });
  });

  describe('avec rappel posté', () => {
    it('ferme à l’échéance pile : rappel à D/2, maintenant = D', () => {
      expect(decide((D / 2) * HOUR, D * HOUR)).toBe('close');
    });

    it('ne ferme pas 1 ms avant l’échéance', () => {
      expect(decide((D / 2) * HOUR, D * HOUR - 1)).toBe('none');
    });

    it('ferme 1 ms après l’échéance', () => {
      expect(decide((D / 2) * HOUR, D * HOUR + 1)).toBe('close');
    });

    it('rappel tardif après une longue panne : on ne ferme pas avant D/2 après le rappel', () => {
      const lateReminder = 40 * HOUR;
      expect(decide(lateReminder, lateReminder + (D / 2) * HOUR - 1)).toBe('none');
      expect(decide(lateReminder, lateReminder + (D / 2) * HOUR)).toBe('close');
    });

    // MC/DC de « D/2 écoulée depuis le rappel ET délai écoulé depuis l'activité »
    it('MC/DC : (vrai, vrai) ferme ; (faux, vrai) et (vrai, faux) ne ferment pas', () => {
      // moitié depuis le rappel : vrai ; délai depuis l'activité : vrai
      expect(decide(12 * HOUR, 24 * HOUR)).toBe('close');
      // moitié depuis le rappel : faux (rappel tardif) ; délai : vrai
      expect(decide(20 * HOUR, 24 * HOUR)).toBe('none');
      // moitié depuis le rappel : vrai (rappel posté tôt, délai réglé plus long depuis) ; délai : faux
      expect(decide(6 * HOUR, 23 * HOUR)).toBe('none');
    });

    it('MC/DC : la moitié depuis le rappel seule décide quand le délai est écoulé', () => {
      expect(decide(23 * HOUR, 24 * HOUR)).toBe('none');
      expect(decide(12 * HOUR, 24 * HOUR)).toBe('close');
    });

    it('un rappel antérieur à la dernière activité est incohérent : rien (jamais de fermeture)', () => {
      expect(decide(-HOUR, 100 * D * HOUR)).toBe('none');
    });

    it('un rappel daté pile de la dernière activité reste valable (même règle que la requête SQL)', () => {
      expect(decide(0, D * HOUR)).toBe('close');
    });
  });

  describe.each([12, 48, 72, 168])('frontières pour un délai de %i h', (hours) => {
    const half = (hours / 2) * HOUR;
    const full = hours * HOUR;

    it('rappel à D/2 pile, rien 1 ms avant', () => {
      expect(decide(null, half - 1, hours)).toBe('none');
      expect(decide(null, half, hours)).toBe('remind');
    });

    it('rappel posté à D/2 : fermeture à D pile, rien 1 ms avant', () => {
      expect(decide(half, full - 1, hours)).toBe('none');
      expect(decide(half, full, hours)).toBe('close');
    });
  });
});

describe('inactivityReminder', () => {
  it('mentionne seulement l’auteur et dit dans quel délai le ticket sera fermé', () => {
    const message = inactivityReminder('200000000000000001', 24);

    expect(message.content).toBe(
      '<@200000000000000001> ⏰ Ce ticket sera fermé automatiquement ' +
        's’il reste sans nouveau message d’ici 12 heures.',
    );
    expect(message.allowedMentions).toEqual({ users: ['200000000000000001'] });
  });

  it.each([
    [12, '6 heures'],
    [48, '1 jour'],
    [72, '1 jour et 12 heures'],
    [168, '3 jours et 12 heures'],
    [2, '1 heure'],
  ])('délai de %i h : « d’ici %s »', (hours, text) => {
    expect(inactivityReminder('1', hours).content).toContain(`d’ici ${text}.`);
  });

  it('une durée nulle donne un libellé valide, jamais « undefined »', () => {
    const { content } = inactivityReminder('1', 0);

    expect(content).not.toContain('undefined');
    expect(content).toContain('d’ici moins d’une minute.');
  });
});

const GUILD = '100000000000000001';
const unknownChannel = new DiscordAPIError(
  { code: 10003, message: 'Unknown Channel' },
  10003,
  404,
  'GET',
  '/channels/1',
  {},
);

const NOW = at(30 * HOUR);

const candidate = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  guildId: GUILD,
  channelId: `ch${id}`,
  ownerId: `owner${id}`,
  lastActivityAt: at(0),
  inactivityRemindedAt: null,
  type: { inactivityHours: 24 },
  ...overrides,
});

/** Un ticket dont le rappel est posté et l'échéance passée à NOW (30 h d'inactivité, délai 24 h). */
const due = (id: number) =>
  candidate(id, { lastActivityAt: at(0), inactivityRemindedAt: at(10 * HOUR) });

/** Un message lu dans le salon avant le rappel : seuls `author.bot`, `system` et `createdAt` comptent. */
const message = (createdAt: Date, bot = false) => ({ author: { bot }, system: false, createdAt });

const channelOf = (id: number) => ({
  id: `ch${id}`,
  guildId: GUILD,
  guild: { id: GUILD, name: 'Phénix' },
  isTextBased: () => true,
  isDMBased: () => false,
  send: vi.fn(async (_payload: unknown) => ({})),
  messages: {
    fetch: vi.fn(async (_options: unknown) => new Map<string, ReturnType<typeof message>>()),
  },
});

function setup() {
  const channels = new Map<number, ReturnType<typeof channelOf>>();
  const fetch = vi.fn(async (channelId: string) => {
    const channel = channels.get(Number(channelId.slice(2)));
    if (!channel) throw unknownChannel;
    return channel;
  });
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const context = { db: {}, logger } as unknown as BotContext;
  const client = { channels: { fetch }, users: {} };
  const run = (name: string = 'inactivity', scheduledAt: Date = NOW) =>
    processInactivity(
      { name: name as 'inactivity', scheduledAt },
      {
        client: client as never,
        context,
        now: () => NOW,
      },
    );
  const add = (id: number) => {
    const channel = channelOf(id);
    channels.set(id, channel);
    return channel;
  };
  return { channels, fetch, logger, run, add };
}

const PASS_DONE = 'Ticket inactivity pass done';

/** Le log de nombres du passage ; `candidates` et `due` sont vérifiés à part. */
const totals = (logger: ReturnType<typeof setup>['logger']) => {
  const call = logger.info.mock.calls.find((args) => args[1] === PASS_DONE) as
    [Record<string, number>, string] | undefined;
  return call?.[0];
};
const summary = (logger: ReturnType<typeof setup>['logger']) => {
  const { candidates: _candidates, due: _due, ...counts } = totals(logger) ?? {};
  return counts;
};

/** Les logs `info` de décision (un par action), sans le log de nombres. */
const decisions = (logger: ReturnType<typeof setup>['logger']) =>
  logger.info.mock.calls.filter((args) => args[1] !== PASS_DONE).map((args) => args[0]);

beforeEach(() => {
  vi.clearAllMocks();
  database.findInactivityCandidates.mockResolvedValue([]);
  database.markTicketInactivityReminded.mockResolvedValue(true);
  database.markTicketInactivityFailed.mockResolvedValue(true);
  database.touchTicketActivity.mockResolvedValue(true);
  database.closeTicket.mockResolvedValue(true);
  database.findTicket.mockImplementation(async (_db: unknown, id: number) => ({
    id,
    guildId: GUILD,
    status: 'OPEN',
    lastActivityAt: at(0),
  }));
  close.finishTicketClose.mockResolvedValue('closed');
});

describe('processInactivity', () => {
  it('ignore une tâche de nom inconnu sans toucher à la base', async () => {
    const { run, logger } = setup();

    await run('autre');

    expect(database.findInactivityCandidates).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ job: 'autre' }, 'Unknown ticket job ignored');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('ne fait rien quand aucun ticket n’a de délai (liste vide) et ne journalise pas en info', async () => {
    const { run, logger, fetch } = setup();

    await run();

    expect(database.findInactivityCandidates).toHaveBeenCalledWith(
      {},
      { now: NOW, limit: 200, perGuildLimit: 25 },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  describe('heure de la tâche', () => {
    it('tâche en retard : jugée à son heure prévue (pas encore D/2 à ce moment-là), rien', async () => {
      const { run, add, fetch, logger } = setup();
      add(1);
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run('inactivity', at(12 * HOUR - 1));

      expect(database.findInactivityCandidates).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ now: at(12 * HOUR - 1) }),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('tâche en retard due à son heure prévue : rappel, noté à l’heure RÉELLE du passage', async () => {
      const { run, add } = setup();
      const channel = add(1);
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run('inactivity', at(12 * HOUR));

      expect(channel.send).toHaveBeenCalledTimes(1);
      expect(database.markTicketInactivityReminded).toHaveBeenCalledWith({}, 1, at(0), NOW);
    });

    it('heure prévue = maintenant : jugée à maintenant', async () => {
      const { run, add } = setup();
      add(1);
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run('inactivity', NOW);

      expect(database.findInactivityCandidates).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ now: NOW }),
      );
      expect(close.finishTicketClose).toHaveBeenCalledTimes(1);
    });

    it('heure prévue invalide (Invalid Date) : rien n’est lu ni fait, warn', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      database.findInactivityCandidates.mockResolvedValue([due(1), candidate(2)]);

      await run('inactivity', new Date(Number.NaN));

      expect(database.findInactivityCandidates).not.toHaveBeenCalled();
      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        { job: 'inactivity' },
        'Ticket job with invalid date ignored',
      );
    });
  });

  it('une tâche datée dans le futur est bornée à « maintenant » : pas de fermeture anticipée', async () => {
    // 20 h d'inactivité, rappel posté à 12 h : à 20 h rien à faire ; une tâche « du futur » (48 h)
    // ne doit pas faire croire que l'échéance est passée
    const now = at(20 * HOUR);
    database.findInactivityCandidates.mockResolvedValue([
      candidate(1, { inactivityRemindedAt: at(12 * HOUR) }),
    ]);
    const { add, channels } = setup();
    add(1);
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    await processInactivity(
      { name: 'inactivity', scheduledAt: at(48 * HOUR) },
      {
        client: { channels: { fetch: vi.fn(async () => channels.get(1)) } } as never,
        context: { db: {}, logger } as never,
        now: () => now,
      },
    );

    expect(close.finishTicketClose).not.toHaveBeenCalled();
  });

  describe('rappel', () => {
    it('poste le rappel dans le salon PUIS marque le ticket (activité lue en condition)', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(channel.send).toHaveBeenCalledWith(inactivityReminder('owner1', 24));
      expect(database.markTicketInactivityReminded).toHaveBeenCalledWith({}, 1, at(0), NOW);
      expect(channel.send.mock.invocationCallOrder[0]).toBeLessThan(
        database.markTicketInactivityReminded.mock.invocationCallOrder[0]!,
      );
      expect(summary(logger)).toEqual({ reminded: 1, closed: 0, failed: 0, skipped: 0 });
    });

    it('envoi impossible : le ticket n’est PAS marqué (réessai au prochain passage), compté failed', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      channel.send.mockRejectedValue(new Error('Missing Permissions'));
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(database.markTicketInactivityReminded).not.toHaveBeenCalled();
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 1, skipped: 0 });
    });

    it('activité entre-temps (marquage refusé) : compté skipped, pas reminded', async () => {
      const { run, add, logger } = setup();
      add(1);
      database.markTicketInactivityReminded.mockResolvedValue(false);
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
    });

    it('marquage qui lève APRÈS l’envoi : compté failed, pas de crash, passage terminé', async () => {
      const { run, add, logger } = setup();
      add(1);
      const second = add(2);
      database.markTicketInactivityReminded
        .mockRejectedValueOnce(new Error('base HS'))
        .mockResolvedValueOnce(true);
      database.findInactivityCandidates.mockResolvedValue([candidate(1), candidate(2)]);

      await run();

      expect(second.send).toHaveBeenCalledTimes(1);
      expect(summary(logger)).toEqual({ reminded: 1, closed: 0, failed: 1, skipped: 0 });
    });

    describe('second signal tiré de Discord avant de rappeler', () => {
      it('lit les 20 derniers messages ; un message de membre plus récent que lastActivityAt : pas de rappel, activité recalée', async () => {
        const { run, add, logger } = setup();
        const channel = add(1);
        channel.messages.fetch.mockResolvedValue(
          new Map([
            ['b', message(at(20 * HOUR), true)],
            ['a', message(at(18 * HOUR))],
          ]),
        );
        database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

        await run();

        expect(channel.messages.fetch).toHaveBeenCalledWith({ limit: 20 });
        expect(database.touchTicketActivity).toHaveBeenCalledWith({}, 'ch1', at(18 * HOUR));
        expect(channel.send).not.toHaveBeenCalled();
        expect(database.markTicketInactivityReminded).not.toHaveBeenCalled();
        expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
      });

      it('un message de bot plus récent (ou de membre plus ancien) est ignoré : le rappel part', async () => {
        const { run, add } = setup();
        const channel = add(1);
        channel.messages.fetch.mockResolvedValue(
          new Map([
            ['b', message(at(20 * HOUR), true)],
            ['a', message(at(-HOUR))],
          ]),
        );
        database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

        await run();

        expect(database.touchTicketActivity).not.toHaveBeenCalled();
        expect(channel.send).toHaveBeenCalledTimes(1);
      });

      it('lecture des messages impossible : pas de rappel, compté failed', async () => {
        const { run, add, logger } = setup();
        const channel = add(1);
        channel.messages.fetch.mockRejectedValue(new Error('Missing Access'));
        database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

        await run();

        expect(channel.send).not.toHaveBeenCalled();
        expect(summary(logger).failed).toBe(1);
      });
    });

    it('ne rappelle pas avant la moitié du délai et ne contacte pas Discord', async () => {
      const { run, add, fetch, logger } = setup();
      add(1);
      database.findInactivityCandidates.mockResolvedValue([
        candidate(1, { lastActivityAt: at(30 * HOUR - (12 * HOUR - 1)) }),
      ]);

      await run();

      expect(fetch).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('fermeture automatique', () => {
    it('ferme avec closedBy null et l’activité lue, sans jamais passer par un membre', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(close.finishTicketClose).toHaveBeenCalledTimes(1);
      const input = close.finishTicketClose.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(input).toMatchObject({
        closedBy: null,
        expectedLastActivityAt: at(0),
        channel,
        guild: channel.guild,
      });
      expect(summary(logger)).toEqual({ reminded: 0, closed: 1, failed: 0, skipped: 0 });
    });

    it('Garage injoignable : le ticket reste ouvert, compté failed, en recul d’1 h', async () => {
      const { run, add, logger } = setup();
      add(1);
      close.finishTicketClose.mockResolvedValue('storage_down');
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(database.closeTicket).not.toHaveBeenCalled();
      expect(database.markTicketInactivityFailed).toHaveBeenCalledWith({}, 1, NOW);
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 1, skipped: 0 });
    });

    it('transcript tronqué (limite atteinte) : rien n’est fermé, compté skipped, warn { ticketId }', async () => {
      const { run, add, logger } = setup();
      add(1);
      close.finishTicketClose.mockResolvedValue('too_long');
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
      expect(logger.warn).toHaveBeenCalledWith(
        { ticketId: 1 },
        'Ticket transcript limit reached: automatic close skipped',
      );
      expect(decisions(logger)).toEqual([]);
    });

    it('activité entre-temps (fermeture refusée) : compté skipped', async () => {
      const { run, add, logger } = setup();
      add(1);
      close.finishTicketClose.mockResolvedValue('stale');
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
    });

    it('activité entre la liste et la fermeture (relecture du ticket) : rien n’est fermé', async () => {
      const { run, add, logger } = setup();
      add(1);
      database.findTicket.mockResolvedValue({
        id: 1,
        guildId: GUILD,
        status: 'OPEN',
        lastActivityAt: at(25 * HOUR),
      });
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
    });

    it('ticket déjà fermé ou introuvable à la relecture : ignoré', async () => {
      const { run, add, logger } = setup();
      add(1);
      add(2);
      database.findTicket
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2, guildId: GUILD, status: 'CLOSED', lastActivityAt: at(0) });
      database.findInactivityCandidates.mockResolvedValue([due(1), due(2)]);

      await run();

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 2 });
    });

    it('ticket déjà en cours de fermeture (bouton) : ignoré, rien n’est fermé deux fois', async () => {
      const { withTicketClosing } = await import('./close.js');
      const { run, add, logger } = setup();
      add(1);
      database.findInactivityCandidates.mockResolvedValue([due(1)]);
      let release!: () => void;
      const buttonClose = withTicketClosing(
        1,
        () => new Promise<void>((resolve) => (release = resolve)),
      );

      await run();
      release();
      await buttonClose;

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 0, skipped: 1 });
    });

    it('salon introuvable (10003) : fermeture CHANNEL_DELETED sans transcript', async () => {
      const { run, logger } = setup();
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(database.closeTicket).toHaveBeenCalledWith({}, 1, {
        closedById: null,
        closedByName: null,
        transcriptKey: null,
        messageCount: null,
        closedVia: 'CHANNEL_DELETED',
      });
      expect(summary(logger)).toEqual({ reminded: 0, closed: 1, failed: 0, skipped: 0 });
    });

    it('salon introuvable au moment du rappel : fermé CHANNEL_DELETED aussi (pas de rappel dans le vide)', async () => {
      const { run, logger } = setup();
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(database.closeTicket).toHaveBeenCalledWith(
        {},
        1,
        expect.objectContaining({ closedVia: 'CHANNEL_DELETED', transcriptKey: null }),
      );
      expect(database.markTicketInactivityReminded).not.toHaveBeenCalled();
      expect(summary(logger).closed).toBe(1);
    });

    it('une autre erreur Discord en cherchant le salon : failed, le ticket reste ouvert', async () => {
      const { run, fetch, logger } = setup();
      fetch.mockRejectedValue(
        new DiscordAPIError({ code: 50001, message: 'Missing Access' }, 50001, 403, 'GET', '/', {}),
      );
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(database.closeTicket).not.toHaveBeenCalled();
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 1, skipped: 0 });
    });

    it('fetch qui résout null : fermeture CHANNEL_DELETED sans transcript', async () => {
      const { run, fetch, logger } = setup();
      fetch.mockResolvedValue(null as never);
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(database.closeTicket).toHaveBeenCalledWith(
        {},
        1,
        expect.objectContaining({ closedVia: 'CHANNEL_DELETED', transcriptKey: null }),
      );
      expect(summary(logger)).toEqual({ reminded: 0, closed: 1, failed: 0, skipped: 0 });
    });

    it.each([
      ['un salon non textuel (isTextBased false)', { isTextBased: () => false }],
      ['un salon de messages privés (isDMBased true)', { isDMBased: () => true }],
    ])('%s : jamais touché, compté failed', async (_label, overrides) => {
      for (const make of [candidate, due]) {
        vi.clearAllMocks();
        const { run, add, logger } = setup();
        const channel = Object.assign(add(1), overrides);
        database.findInactivityCandidates.mockResolvedValue([make(1)]);

        await run();

        expect(channel.send).not.toHaveBeenCalled();
        expect(channel.messages.fetch).not.toHaveBeenCalled();
        expect(close.finishTicketClose).not.toHaveBeenCalled();
        expect(database.closeTicket).not.toHaveBeenCalled();
        expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 1, skipped: 0 });
      }
    });

    it('un salon d’un autre serveur que le ticket : jamais touché (défense en profondeur)', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      channel.guildId = '100000000000000099';
      database.findInactivityCandidates.mockResolvedValue([due(1)]);

      await run();

      expect(close.finishTicketClose).not.toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();
      expect(summary(logger).failed).toBe(1);
    });

    it(`au plus ${MAX_CLOSES_PER_PASS} fermetures par passage, le reste attend le suivant`, async () => {
      const { run, add, logger } = setup();
      const ids = Array.from({ length: MAX_CLOSES_PER_PASS + 3 }, (_, index) => index + 1);
      for (const id of ids) add(id);
      database.findInactivityCandidates.mockResolvedValue(ids.map(due));

      await run();

      expect(MAX_CLOSES_PER_PASS).toBe(10);
      expect(close.finishTicketClose).toHaveBeenCalledTimes(MAX_CLOSES_PER_PASS);
      expect(summary(logger)).toEqual({ reminded: 0, closed: 10, failed: 0, skipped: 3 });
    });

    it.each([
      [MAX_CLOSES_PER_PASS, 0],
      [MAX_CLOSES_PER_PASS + 1, 1],
    ])('plafond exact : %i tickets dus, %i attend le passage suivant', async (count, skipped) => {
      const { run, add, logger } = setup();
      const ids = Array.from({ length: count }, (_, index) => index + 1);
      for (const id of ids) add(id);
      database.findInactivityCandidates.mockResolvedValue(ids.map(due));

      await run();

      expect(close.finishTicketClose).toHaveBeenCalledTimes(MAX_CLOSES_PER_PASS);
      expect(summary(logger)).toEqual({
        reminded: 0,
        closed: MAX_CLOSES_PER_PASS,
        failed: 0,
        skipped,
      });
    });

    it('le plafond des fermetures ne bloque pas les rappels', async () => {
      const { run, add, logger } = setup();
      const ids = Array.from({ length: MAX_CLOSES_PER_PASS + 1 }, (_, index) => index + 1);
      for (const id of ids) add(id);
      const reminded = add(99);
      database.findInactivityCandidates.mockResolvedValue([...ids.map(due), candidate(99)]);

      await run();

      expect(reminded.send).toHaveBeenCalledTimes(1);
      expect(summary(logger)).toEqual({
        reminded: 1,
        closed: MAX_CLOSES_PER_PASS,
        failed: 0,
        skipped: 1,
      });
    });

    it('les échecs de Garage comptent dans le plafond : une panne ne lance pas 200 transcripts', async () => {
      const { run, add, logger } = setup();
      const ids = Array.from({ length: MAX_CLOSES_PER_PASS + 2 }, (_, index) => index + 1);
      for (const id of ids) add(id);
      close.finishTicketClose.mockResolvedValue('storage_down');
      database.findInactivityCandidates.mockResolvedValue(ids.map(due));

      await run();

      expect(close.finishTicketClose).toHaveBeenCalledTimes(MAX_CLOSES_PER_PASS);
      expect(summary(logger)).toEqual({ reminded: 0, closed: 0, failed: 10, skipped: 2 });
    });
  });

  describe('isolement et journal', () => {
    it('une erreur sur un ticket n’arrête pas les suivants', async () => {
      const { run, add, logger } = setup();
      const first = add(1);
      first.send.mockRejectedValue(new Error('boom'));
      const second = add(2);
      database.findInactivityCandidates.mockResolvedValue([candidate(1), candidate(2)]);

      await run();

      expect(second.send).toHaveBeenCalledTimes(1);
      expect(summary(logger)).toEqual({ reminded: 1, closed: 0, failed: 1, skipped: 0 });
    });

    it('une exception de fermeture (hors Garage) est isolée aussi', async () => {
      const { run, add, logger } = setup();
      add(1);
      add(2);
      close.finishTicketClose.mockRejectedValueOnce(new Error('Discord HS'));
      database.findInactivityCandidates.mockResolvedValue([due(1), due(2)]);

      await run();

      expect(close.finishTicketClose).toHaveBeenCalledTimes(2);
      expect(summary(logger)).toEqual({ reminded: 0, closed: 1, failed: 1, skipped: 0 });
    });

    it('un log info de nombres par passage, dont les candidats lus et dus : aucun identifiant ni nom', async () => {
      const { run, add, logger } = setup();
      add(1);
      database.findInactivityCandidates.mockResolvedValue([
        candidate(1),
        candidate(2, { lastActivityAt: at(29 * HOUR) }),
      ]);

      await run();

      const payload = totals(logger)!;
      expect(Object.keys(payload).toSorted()).toEqual([
        'candidates',
        'closed',
        'due',
        'failed',
        'reminded',
        'skipped',
      ]);
      for (const value of Object.values(payload)) expect(typeof value).toBe('number');
      expect(payload).toMatchObject({ candidates: 2, due: 1 });
    });

    it('un log info par décision d’action { ticketId, decision, inactivityHours }, sans pseudo, membre ni salon', async () => {
      const { run, add, logger } = setup();
      add(1);
      add(2);
      database.findInactivityCandidates.mockResolvedValue([
        candidate(1),
        due(2),
        // Salon disparu (jamais ajouté) ; délai de 48 h, rappel dû à 24 h
        candidate(3, { type: { inactivityHours: 48 } }),
      ]);

      await run();

      expect(decisions(logger)).toEqual([
        { ticketId: 1, decision: 'remind', inactivityHours: 24 },
        { ticketId: 2, decision: 'close', inactivityHours: 24 },
        { ticketId: 3, decision: 'channel_deleted', inactivityHours: 48 },
      ]);
      const logged = JSON.stringify(logger.info.mock.calls);
      for (const forbidden of ['owner', 'ch1', 'ch2', 'Phénix', GUILD]) {
        expect(logged).not.toContain(forbidden);
      }
    });

    it('pas de log de décision quand l’action n’a pas lieu (activité entre-temps)', async () => {
      const { run, add, logger } = setup();
      add(1);
      add(2);
      database.markTicketInactivityReminded.mockResolvedValue(false);
      close.finishTicketClose.mockResolvedValue('stale');
      database.findInactivityCandidates.mockResolvedValue([candidate(1), due(2)]);

      await run();

      expect(decisions(logger)).toEqual([]);
    });

    it('un échec met le ticket en recul d’1 h ; un échec de ce marquage ne fait rien tomber', async () => {
      const { run, add, logger } = setup();
      add(1).send.mockRejectedValue(new Error('boom'));
      add(2);
      database.markTicketInactivityFailed.mockRejectedValue(new Error('base HS'));
      database.findInactivityCandidates.mockResolvedValue([candidate(1), candidate(2)]);

      await run();

      expect(database.markTicketInactivityFailed).toHaveBeenCalledWith({}, 1, NOW);
      expect(database.markTicketInactivityFailed).toHaveBeenCalledTimes(1);
      expect(summary(logger)).toEqual({ reminded: 1, closed: 0, failed: 1, skipped: 0 });
    });

    it('l’erreur d’un ticket : warn avec ticketId et code seulement, jamais l’erreur complète', async () => {
      const { run, add, logger } = setup();
      const channel = add(1);
      channel.send.mockRejectedValue(
        new DiscordAPIError(
          { code: 50013, message: 'Missing Permissions' },
          50013,
          403,
          'POST',
          '/channels/ch1/messages',
          { body: { content: '<@owner1> secret' } },
        ),
      );
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [payload] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload).toEqual({ ticketId: 1, code: 50013 });
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('owner1');
    });

    it('une erreur sans code connu : warn avec code undefined', async () => {
      const { run, add, logger } = setup();
      add(1).send.mockRejectedValue(new Error('boom <@owner1>'));
      database.findInactivityCandidates.mockResolvedValue([candidate(1)]);

      await run();

      expect(logger.warn).toHaveBeenCalledWith(
        { ticketId: 1, code: undefined },
        expect.any(String),
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('owner1');
    });

    it('une erreur de la liste elle-même remonte au worker (rien n’est à moitié fait)', async () => {
      const { run } = setup();
      database.findInactivityCandidates.mockRejectedValue(new Error('base HS'));

      await expect(run()).rejects.toThrow('base HS');
    });
  });
});
