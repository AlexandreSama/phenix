import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { createActivityHandler, latestMemberMessageAt } from './activity.js';

const database = vi.hoisted(() => ({ touchTicketActivity: vi.fn() }));
vi.mock('@phenix/database', () => database);

const MINUTE = 60_000;

const forbidden = (name: string): never => {
  throw new Error(`Le champ « ${name} » ne doit jamais être lu`);
};

/** Un faux message : lire son contenu ou son auteur (hors `bot`) fait échouer le test. */
function fakeMessage({
  channelId = 'ch1',
  bot = false,
  inGuild = true,
  system = false,
}: { channelId?: string; bot?: boolean; inGuild?: boolean; system?: boolean } = {}) {
  return {
    inGuild: () => inGuild,
    channelId,
    system,
    author: {
      bot,
      get id() {
        return forbidden('author.id');
      },
      get username() {
        return forbidden('author.username');
      },
    },
    get content() {
      return forbidden('content');
    },
    get cleanContent() {
      return forbidden('cleanContent');
    },
    get attachments() {
      return forbidden('attachments');
    },
    get member() {
      return forbidden('member');
    },
  } as unknown as Message;
}

function setup(start = 1_000_000) {
  let time = start;
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const context = { db: {}, logger } as unknown as BotContext;
  const writes = new Map<string, number>();
  const handler = createActivityHandler(context, { now: () => time, writes });
  return {
    handler,
    writes,
    logger,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.touchTicketActivity.mockResolvedValue(true);
});

describe('activité des tickets (MessageCreate)', () => {
  it('note l’activité du salon d’un message de membre, sans lire son contenu ni son auteur', async () => {
    const { handler } = setup();

    await handler(fakeMessage({ channelId: 'ch1' }));

    expect(database.touchTicketActivity).toHaveBeenCalledTimes(1);
    expect(database.touchTicketActivity).toHaveBeenCalledWith({}, 'ch1');
  });

  it('ignore les messages de bots, les messages système et ceux hors d’un serveur (MP)', async () => {
    const { handler } = setup();

    await handler(fakeMessage({ bot: true }));
    await handler(fakeMessage({ system: true }));
    await handler(fakeMessage({ inGuild: false }));

    expect(database.touchTicketActivity).not.toHaveBeenCalled();
  });

  describe('une écriture au plus par salon et par minute', () => {
    it('le deuxième message dans la minute ne réécrit pas', async () => {
      const { handler, advance } = setup();

      await handler(fakeMessage());
      advance(MINUTE - 1);
      await handler(fakeMessage());

      expect(database.touchTicketActivity).toHaveBeenCalledTimes(1);
    });

    it('à la minute pile, une nouvelle écriture', async () => {
      const { handler, advance } = setup();

      await handler(fakeMessage());
      advance(MINUTE);
      await handler(fakeMessage());

      expect(database.touchTicketActivity).toHaveBeenCalledTimes(2);
    });

    it('à la minute pile, une nouvelle écriture, même quand la purge a gardé l’entrée', async () => {
      const { handler, advance } = setup();
      advance(10_000);
      await handler(fakeMessage({ channelId: 'ch1' }));
      // Purge à +60 s : « ch1 » (50 s) est gardé
      advance(50_000);
      await handler(fakeMessage({ channelId: 'ch2' }));
      // +70 s : pas de nouvelle purge, « ch1 » a exactement une minute
      advance(10_000);
      await handler(fakeMessage({ channelId: 'ch1' }));

      expect(database.touchTicketActivity.mock.calls.map((call) => call[1])).toEqual([
        'ch1',
        'ch2',
        'ch1',
      ]);
    });

    it('la limite est par salon : un autre salon écrit tout de suite', async () => {
      const { handler } = setup();

      await handler(fakeMessage({ channelId: 'ch1' }));
      await handler(fakeMessage({ channelId: 'ch2' }));

      expect(database.touchTicketActivity.mock.calls.map((call) => call[1])).toEqual([
        'ch1',
        'ch2',
      ]);
    });

    it('les messages ignorés (bots) ne consomment pas la minute du salon', async () => {
      const { handler } = setup();

      await handler(fakeMessage({ bot: true }));
      await handler(fakeMessage());

      expect(database.touchTicketActivity).toHaveBeenCalledTimes(1);
    });

    it('deux messages simultanés : une seule écriture', async () => {
      const { handler } = setup();

      await Promise.all([handler(fakeMessage()), handler(fakeMessage())]);

      expect(database.touchTicketActivity).toHaveBeenCalledTimes(1);
    });

    it('les entrées anciennes sont purgées : la table ne grossit pas sans fin', async () => {
      const { handler, advance, writes } = setup();
      for (let index = 0; index < 500; index++)
        await handler(fakeMessage({ channelId: `c${index}` }));

      advance(2 * MINUTE);
      await handler(fakeMessage({ channelId: 'nouveau' }));

      expect([...writes.keys()]).toEqual(['nouveau']);
    });

    it('la purge garde une entrée récente : sa minute continue de limiter les écritures', async () => {
      const { handler, advance, writes } = setup();
      await handler(fakeMessage({ channelId: 'ancien' }));
      advance(MINUTE / 2);
      await handler(fakeMessage({ channelId: 'récent' }));
      advance(MINUTE / 2 + 1);

      // Purge déclenchée ici : « ancien » a plus d'une minute, « récent » moins
      await handler(fakeMessage({ channelId: 'autre' }));
      await handler(fakeMessage({ channelId: 'récent' }));

      expect([...writes.keys()].toSorted()).toEqual(['autre', 'récent']);
      expect(database.touchTicketActivity.mock.calls.map((call) => call[1])).toEqual([
        'ancien',
        'récent',
        'autre',
      ]);
    });
  });

  describe('latestMemberMessageAt (second signal de la fermeture automatique)', () => {
    const message = (iso: string, extra: { bot?: boolean; system?: boolean } = {}) => ({
      author: { bot: extra.bot ?? false },
      system: extra.system ?? false,
      createdAt: new Date(iso),
    });

    it('le plus récent des messages de membres, quel que soit l’ordre ; ni bot ni système', () => {
      expect(
        latestMemberMessageAt([
          message('2026-11-07T10:00:00Z'),
          message('2026-11-07T12:00:00Z', { bot: true }),
          message('2026-11-07T11:00:00Z'),
          message('2026-11-07T13:00:00Z', { system: true }),
          message('2026-11-07T09:00:00Z'),
        ] as never),
      ).toEqual(new Date('2026-11-07T11:00:00Z'));
    });

    it('null sans message de membre', () => {
      expect(latestMemberMessageAt([message('2026-11-07T12:00:00Z', { bot: true })] as never)).toBe(
        null,
      );
      expect(latestMemberMessageAt([])).toBe(null);
    });
  });

  describe('erreurs', () => {
    it('une erreur de base est journalisée (warn, sans contenu ni auteur) et jamais levée', async () => {
      const { handler, logger } = setup();
      database.touchTicketActivity.mockRejectedValue(
        Object.assign(new Error('connexion perdue <@secret>'), { code: 'P1001' }),
      );

      await expect(handler(fakeMessage())).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [payload, text] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload).toEqual({ code: 'P1001' });
      expect(text).toBe('Ticket activity not recorded');
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret');
    });

    it('après une erreur, la limite d’une minute tient : pas de rafale de requêtes en panne', async () => {
      const { handler } = setup();
      database.touchTicketActivity.mockRejectedValue(new Error('base HS'));

      await handler(fakeMessage());
      await handler(fakeMessage());

      expect(database.touchTicketActivity).toHaveBeenCalledTimes(1);
    });
  });
});
