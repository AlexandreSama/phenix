import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { CHANNEL, GUILD, ORGANIZER, raidEvent } from '../test-fixtures.js';
import { compositionText, td2, TD2_COMMAND_REPLIES } from './td2.js';

const database = vi.hoisted(() => ({
  createTd2Event: vi.fn(),
  deleteTd2Event: vi.fn(),
  listTd2Activities: vi.fn(),
  markTd2EventPublished: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const TD2_CHANNEL = '400000000000000009';
const NOW = new Date('2026-11-09T12:00:00Z');

const slots = (dps: number, heal: number, tank: number) =>
  [
    { modeId: 0, role: 'DPS', count: dps },
    { modeId: 0, role: 'HEAL', count: heal },
    { modeId: 0, role: 'TANK', count: tank },
  ] as const;

const DARK_HOURS = {
  id: 1,
  kind: 'RAID',
  name: 'Dark Hours',
  active: true,
  modes: [
    { id: 3, activityId: 1, name: 'Normal', slots: slots(6, 1, 1) },
    { id: 4, activityId: 1, name: 'Semi-Speed', slots: slots(5, 1, 2) },
  ],
};
const PARADIS_PERDU = {
  id: 3,
  kind: 'INCURSION',
  name: 'Paradis Perdu',
  active: true,
  modes: [
    {
      id: 9,
      activityId: 3,
      name: 'Standard',
      slots: [
        { modeId: 9, role: 'DPS', count: 3 },
        { modeId: 9, role: 'HEAL_TANK', count: 1 },
      ],
    },
  ],
};

function setup({
  subcommand = 'raid',
  strings = {} as Record<string, string>,
  writable = true,
  send = vi.fn(async () => ({ id: '900000000000000001' })),
} = {}) {
  const channel = {
    id: TD2_CHANNEL,
    isSendable: () => true,
    permissionsFor: () => ({ has: () => writable }),
    send,
  };
  const interaction = {
    inCachedGuild: () => true,
    guildId: GUILD,
    channelId: CHANNEL,
    user: { id: ORGANIZER },
    guild: {
      members: { me: {} },
      channels: { cache: new Map([[TD2_CHANNEL, channel]]), fetch: vi.fn(async () => null) },
    },
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => strings[name] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
  const td2Scheduler = { schedule: vi.fn(async () => {}) };
  const context = {
    db: {},
    td2: td2Scheduler,
    logger: { info: vi.fn() },
    configs: {
      get: vi.fn(async () => ({ timezone: 'Europe/Paris', td2ChannelId: TD2_CHANNEL })),
    },
  } as unknown as BotContext;
  const run = async () => {
    await td2.execute(interaction as unknown as ChatInputCommandInteraction, context);
    return (interaction.reply.mock.calls[0] as unknown as [{ content: string }] | undefined)?.[0]
      .content;
  };
  return { channel, td2Scheduler, run, context };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  for (const mock of Object.values(database)) mock.mockReset();
  database.listTd2Activities.mockImplementation(async (_db: unknown, kind: string) =>
    kind === 'RAID' ? [DARK_HOURS] : [PARADIS_PERDU],
  );
});
afterEach(() => vi.useRealTimers());

describe('/td2 raid', () => {
  it('crée la sortie, la poste dans le salon des sorties et planifie ses tâches', async () => {
    const event = raidEvent();
    database.createTd2Event.mockResolvedValue(event);
    const { channel, td2Scheduler, run } = setup({
      strings: { activité: '1', mode: '4', date: 'samedi 21h' },
    });

    const reply = await run();

    // Samedi 14 novembre, 21 h à Paris = 20 h UTC
    expect(database.createTd2Event).toHaveBeenCalledWith(
      {},
      {
        guildId: GUILD,
        modeId: 4,
        scheduledAt: new Date('2026-11-14T20:00:00Z'),
        channelId: TD2_CHANNEL,
        organizerId: ORGANIZER,
      },
    );
    expect(channel.send).toHaveBeenCalledOnce();
    expect(database.markTd2EventPublished).toHaveBeenCalledWith({}, 12, '900000000000000001');
    expect(td2Scheduler.schedule).toHaveBeenCalledWith(12, event.scheduledAt);
    expect(reply).toContain(`Sortie #12 postée dans <#${TD2_CHANNEL}>`);
  });

  it('accepte un nom tapé à la main, sans accents ni majuscules', async () => {
    database.createTd2Event.mockResolvedValue(raidEvent());
    const { run } = setup({
      strings: { activité: 'dark hours', mode: 'semi-speed', date: 'demain 21h' },
    });

    await run();

    expect(database.createTd2Event).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ modeId: 4 }),
    );
  });

  it('refuse une activité, un mode ou une date qu’il ne comprend pas', async () => {
    expect(
      await setup({ strings: { activité: 'Raid inventé', mode: '3', date: 'samedi 21h' } }).run(),
    ).toBe(TD2_COMMAND_REPLIES.unknownActivity('RAID'));
    expect(
      await setup({ strings: { activité: '1', mode: 'Turbo', date: 'samedi 21h' } }).run(),
    ).toBe(TD2_COMMAND_REPLIES.unknownMode);
    expect(
      await setup({ strings: { activité: '1', mode: '3', date: 'bientôt 21h' } }).run(),
    ).toContain('Je ne comprends pas');
    expect(database.createTd2Event).not.toHaveBeenCalled();
  });

  it('refuse un salon où le bot ne peut pas poster', async () => {
    const { run } = setup({
      strings: { activité: '1', mode: '3', date: 'samedi 21h' },
      writable: false,
    });

    expect(await run()).toBe(TD2_COMMAND_REPLIES.notWritable(TD2_CHANNEL));
    expect(database.createTd2Event).not.toHaveBeenCalled();
  });

  it('message impossible à poster : la sortie est retirée de la base', async () => {
    database.createTd2Event.mockResolvedValue(raidEvent());
    const { td2Scheduler, run } = setup({
      strings: { activité: '1', mode: '3', date: 'samedi 21h' },
      send: vi.fn(async () => {
        throw new Error('panne');
      }),
    });

    const reply = await run();

    expect(database.deleteTd2Event).toHaveBeenCalledWith({}, 12);
    expect(td2Scheduler.schedule).not.toHaveBeenCalled();
    expect(reply).toContain("La sortie n'a pas pu être postée");
  });
});

describe('/td2 incursion', () => {
  it('saute le choix du mode : l’incursion n’en a qu’un', async () => {
    database.createTd2Event.mockResolvedValue(raidEvent());
    const { run } = setup({
      subcommand: 'incursion',
      strings: { activité: '3', date: 'vendredi 20h30' },
    });

    await run();

    expect(database.listTd2Activities).toHaveBeenCalledWith({}, 'INCURSION');
    expect(database.createTd2Event).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ modeId: 9 }),
    );
  });
});

describe('autocomplétion', () => {
  it('propose les modes de l’activité choisie, avec leur composition', async () => {
    const { context } = setup();
    const respond = vi.fn(async () => {});
    const interaction = {
      options: {
        getSubcommand: () => 'raid',
        getFocused: () => ({ name: 'mode', value: 'semi' }),
        getString: () => '1',
      },
      respond,
    };

    await td2.autocomplete?.(interaction as unknown as AutocompleteInteraction, context);

    expect(respond).toHaveBeenCalledWith([
      { name: 'Semi-Speed — 5 DPS · 1 Heal · 2 Tank', value: '4' },
    ]);
  });

  it('écrit la composition dans l’ordre des boutons', () => {
    expect(compositionText(PARADIS_PERDU.modes[0] as never)).toBe('3 DPS · 1 Heal/Tank');
  });
});
