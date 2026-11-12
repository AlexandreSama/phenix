import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { giveaway, GIVEAWAY_REPLIES } from './giveaway.js';

const database = vi.hoisted(() => ({
  advanceGiveawayEnd: vi.fn(),
  createGiveaway: vi.fn(),
  findGiveaway: vi.fn(),
  listGiveaways: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CHANNEL = '400000000000000001';
const NOW = new Date('2026-11-09T12:00:00Z');

interface Options {
  subcommand: 'créer' | 'terminer' | 'relancer';
  strings?: Record<string, string>;
  integers?: Record<string, number>;
  writable?: boolean;
  /** L'utilisateur peut-il écrire dans le salon ? (le bot, lui, selon `writable`) */
  userCanWrite?: boolean;
}

function fakeInteraction({
  subcommand,
  strings = {},
  integers = {},
  writable = true,
  userCanWrite = true,
}: Options) {
  const me = {};
  const member = {};
  const channel = {
    id: CHANNEL,
    isSendable: () => true,
    permissionsFor: (who: object) => ({ has: () => (who === me ? writable : userCanWrite) }),
    toString: () => `<#${CHANNEL}>`,
  };
  return {
    inCachedGuild: () => true,
    guildId: GUILD,
    channelId: CHANNEL,
    channel,
    member,
    guild: { members: { me } },
    user: { id: '200000000000000001' },
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => strings[name] ?? null,
      getInteger: (name: string) => integers[name] ?? null,
      getChannel: () => null,
      getRole: () => null,
    },
    reply: vi.fn(async () => {}),
  };
}

function setup() {
  const giveaways = {
    publish: vi.fn(async () => {}),
    scheduleEnd: vi.fn(async () => {}),
    endNow: vi.fn(async () => {}),
    reroll: vi.fn(async () => {}),
  };
  const context = { db: {}, giveaways, logger: { info: vi.fn() } } as unknown as BotContext;
  const run = async (interaction: ReturnType<typeof fakeInteraction>) => {
    await giveaway.execute(interaction as unknown as ChatInputCommandInteraction, context);
    return (interaction.reply.mock.calls[0] as unknown as [{ content: string }] | undefined)?.[0]
      .content;
  };
  return { giveaways, run, context };
}

const create = (strings: Record<string, string>, extra: Partial<Options> = {}) =>
  fakeInteraction({ subcommand: 'créer', strings, ...extra });

const found = (overrides: object) => ({
  id: 12,
  guildId: GUILD,
  endedAt: null,
  announcedAt: null,
  ...overrides,
});

const byId = (subcommand: 'terminer' | 'relancer') =>
  fakeInteraction({ subcommand, integers: { id: 12 } });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  for (const mock of Object.values(database)) mock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('/giveaway créer', () => {
  it('enregistre le giveaway, puis demande sa publication et son tirage à la file', async () => {
    database.createGiveaway.mockResolvedValue({ id: 12 });
    const { giveaways, run } = setup();

    const reply = await run(
      create({ lot: ' Nitro ', durée: '1j12h' }, { integers: { gagnants: 3 } }),
    );

    const endsAt = new Date('2026-11-11T00:00:00Z');
    expect(database.createGiveaway).toHaveBeenCalledWith(
      {},
      {
        guildId: GUILD,
        channelId: CHANNEL,
        hostId: '200000000000000001',
        prize: 'Nitro',
        winnersCount: 3,
        requiredRoleId: null,
        endsAt,
      },
    );
    expect(giveaways.publish).toHaveBeenCalledWith(12);
    expect(giveaways.scheduleEnd).toHaveBeenCalledWith(12, endsAt);
    expect(reply).toContain('Giveaway #12 lancé');
  });

  it('refuse une durée illisible, trop courte ou trop longue', async () => {
    const { run } = setup();

    expect(await run(create({ lot: 'Nitro', durée: 'demain' }))).toBe(GIVEAWAY_REPLIES.badDuration);
    expect(await run(create({ lot: 'Nitro', durée: '30s' }))).toBe(
      'La fin doit être dans une minute au moins.',
    );
    expect(await run(create({ lot: 'Nitro', durée: '31j' }))).toBe('Trente jours au plus.');
    expect(database.createGiveaway).not.toHaveBeenCalled();
  });

  it('refuse un salon où le bot ne peut pas poster', async () => {
    const { run } = setup();

    const reply = await run(create({ lot: 'Nitro', durée: '1h' }, { writable: false }));

    expect(reply).toBe(GIVEAWAY_REPLIES.notWritable(CHANNEL));
    expect(database.createGiveaway).not.toHaveBeenCalled();
  });

  it('refuse un salon où l’utilisateur lui-même ne peut pas écrire (le bot ne poste pas à sa place)', async () => {
    const { run } = setup();

    const reply = await run(create({ lot: 'Nitro', durée: '1h' }, { userCanWrite: false }));

    expect(reply).toBe(GIVEAWAY_REPLIES.userCannotWrite(CHANNEL));
    expect(database.createGiveaway).not.toHaveBeenCalled();
  });
});

describe('/giveaway terminer et relancer', () => {
  it('terminer avance le tirage d’un giveaway en cours', async () => {
    database.findGiveaway.mockResolvedValue(found({}));
    const { giveaways, run } = setup();

    expect(await run(byId('terminer'))).toContain('Tirage du giveaway #12 lancé');
    expect(database.advanceGiveawayEnd).toHaveBeenCalledWith({}, 12);
    expect(giveaways.endNow).toHaveBeenCalledWith(12);
  });

  it('terminer refuse un giveaway annoncé ou d’un autre serveur', async () => {
    const { giveaways, run } = setup();
    database.findGiveaway.mockResolvedValueOnce(found({ endedAt: NOW, announcedAt: NOW }));
    database.findGiveaway.mockResolvedValueOnce(found({ guildId: '100000000000000999' }));

    expect(await run(byId('terminer'))).toBe(GIVEAWAY_REPLIES.alreadyEnded(12));
    expect(await run(byId('terminer'))).toBe(GIVEAWAY_REPLIES.unknown(12));
    expect(giveaways.endNow).not.toHaveBeenCalled();
  });

  it('relancer attend un tirage fait et annoncé', async () => {
    const { giveaways, run } = setup();
    database.findGiveaway.mockResolvedValueOnce(found({}));
    database.findGiveaway.mockResolvedValueOnce(found({ endedAt: NOW }));
    database.findGiveaway.mockResolvedValueOnce(found({ endedAt: NOW, announcedAt: NOW }));

    expect(await run(byId('relancer'))).toBe(GIVEAWAY_REPLIES.notEnded(12));
    expect(await run(byId('relancer'))).toBe(GIVEAWAY_REPLIES.notAnnounced(12));
    expect(await run(byId('relancer'))).toBe('Nouveau tirage du giveaway #12 lancé.');
    expect(giveaways.reroll).toHaveBeenCalledOnce();
  });
});

describe('autocomplétion de l’ID', () => {
  it('propose les giveaways en cours pour « terminer », filtrés par ce qui est tapé', async () => {
    database.listGiveaways.mockResolvedValue({
      giveaways: [
        { id: 12, prize: 'Nitro' },
        { id: 3, prize: 'Jeu Steam' },
      ],
    });
    const { context } = setup();
    const respond = vi.fn(async () => {});
    const interaction = {
      inCachedGuild: () => true,
      guildId: GUILD,
      options: { getSubcommand: () => 'terminer', getFocused: () => '1' },
      respond,
    };

    await giveaway.autocomplete?.(interaction as unknown as AutocompleteInteraction, context);

    expect(database.listGiveaways).toHaveBeenCalledWith({}, GUILD, 'active', 1, 25);
    expect(respond).toHaveBeenCalledWith([{ name: '#12 · Nitro', value: 12 }]);
  });
});
