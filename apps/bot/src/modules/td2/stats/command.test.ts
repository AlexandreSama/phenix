import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import {
  autocompletePlayer,
  linkAccount,
  showStats,
  STATS_REPLIES,
  unlinkAccount,
} from './command.js';
import type { Td2CareerResult } from './provider.js';

const database = vi.hoisted(() => ({
  findTd2Profile: vi.fn(),
  linkTd2Profile: vi.fn(),
  unlinkTd2Profile: vi.fn(),
}));
vi.mock('@projet/database', () => database);

const USER = '500000000000000001';
const MEMBER = '500000000000000002';
const OK: Td2CareerResult = {
  status: 'ok',
  career: {
    platform: 'PSN',
    handle: 'Agent47',
    avatarUrl: null,
    stats: { level: { kind: 'number', value: 40 } },
  },
};

interface Options {
  strings?: Record<string, string>;
  member?: { id: string } | null;
  career?: Td2CareerResult;
  enabled?: boolean;
}

function setup({ strings = {}, member = null, career = OK, enabled = true }: Options = {}) {
  const interaction = {
    user: { id: USER },
    options: {
      getString: (name: string, required?: boolean) => {
        const value = strings[name] ?? null;
        if (required && value === null) throw new Error(`option ${name} manquante`);
        return value;
      },
      getUser: () => member,
    },
    reply: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
  const stats = {
    enabled,
    credit: 'Powered by Tracker Network',
    career: vi.fn(async () => career),
    search: vi.fn(async () => ['Agent47', 'Agent470']),
  };
  const context = { db: {}, stats, logger: { warn: vi.fn() } } as unknown as BotContext;
  const run = (handler: typeof showStats) =>
    handler(interaction as unknown as ChatInputCommandInteraction, context);
  const said = (mock: typeof interaction.reply) =>
    (mock.mock.calls.at(-1) as unknown as [{ content?: string } | string] | undefined)?.[0];
  return { interaction, stats, context, run, said };
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
});

describe('/td2 lier', () => {
  const strings = { plateforme: 'PSN', pseudo: ' agent47 ' };

  it('vérifie le joueur et enregistre son pseudo exact', async () => {
    const { interaction, stats, run, said } = setup({ strings });

    await run(linkAccount);

    expect(stats.career).toHaveBeenCalledWith('PSN', 'agent47');
    expect(database.linkTd2Profile).toHaveBeenCalledWith(
      {},
      { userId: USER, platform: 'PSN', playerName: 'Agent47' },
    );
    expect(said(interaction.editReply)).toBe(STATS_REPLIES.linked('Agent47', 'PSN'));
  });

  it('refuse un joueur que le service ne connaît pas', async () => {
    const { interaction, run, said } = setup({ strings, career: { status: 'not-found' } });

    await run(linkAccount);

    expect(database.linkTd2Profile).not.toHaveBeenCalled();
    expect(said(interaction.editReply)).toBe(STATS_REPLIES.notFound('agent47', 'PSN'));
  });

  it('service indisponible : lie quand même, avec un avertissement', async () => {
    const { interaction, run, said } = setup({
      strings,
      career: { status: 'unavailable', reason: 'refused' },
    });

    await run(linkAccount);

    expect(database.linkTd2Profile).toHaveBeenCalledWith(
      {},
      { userId: USER, platform: 'PSN', playerName: 'agent47' },
    );
    expect(said(interaction.editReply)).toBe(
      STATS_REPLIES.linked('agent47', 'PSN') + STATS_REPLIES.unverified,
    );
  });
});

describe('/td2 délier', () => {
  it('délie, ou dit qu’il n’y avait rien à délier', async () => {
    const { interaction, run, said } = setup();

    database.unlinkTd2Profile.mockResolvedValueOnce(true);
    await run(unlinkAccount);
    expect(said(interaction.reply)).toMatchObject({ content: STATS_REPLIES.unlinked });

    database.unlinkTd2Profile.mockResolvedValueOnce(false);
    await run(unlinkAccount);
    expect(said(interaction.reply)).toMatchObject({ content: STATS_REPLIES.noLink });
  });
});

describe('/td2 stats', () => {
  it('sans argument : le compte lié, en public', async () => {
    database.findTd2Profile.mockResolvedValue({ platform: 'XBL', playerName: 'Rogue' });
    const { interaction, stats, run } = setup();

    await run(showStats);

    expect(database.findTd2Profile).toHaveBeenCalledWith({}, USER);
    expect(stats.career).toHaveBeenCalledWith('XBL', 'Rogue');
    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [expect.anything()] }),
    );
  });

  it('un pseudo tapé passe avant tout compte lié, mais exige sa plateforme', async () => {
    const typed = setup({ strings: { plateforme: 'UBI', pseudo: 'Hunter' } });
    await typed.run(showStats);
    expect(typed.stats.career).toHaveBeenCalledWith('UBI', 'Hunter');
    expect(database.findTd2Profile).not.toHaveBeenCalled();

    const noPlatform = setup({ strings: { pseudo: 'Hunter' } });
    await noPlatform.run(showStats);
    expect(noPlatform.said(noPlatform.interaction.reply)).toMatchObject({
      content: STATS_REPLIES.needPlatform,
    });
  });

  it('le compte d’un membre, ou pourquoi il n’y en a pas', async () => {
    database.findTd2Profile.mockResolvedValue(null);
    const other = setup({ member: { id: MEMBER } });
    await other.run(showStats);
    expect(database.findTd2Profile).toHaveBeenCalledWith({}, MEMBER);
    expect(other.said(other.interaction.reply)).toMatchObject({
      content: STATS_REPLIES.memberNotLinked(MEMBER),
    });

    const self = setup();
    await self.run(showStats);
    expect(self.said(self.interaction.reply)).toMatchObject({ content: STATS_REPLIES.needPlayer });
  });

  it('sans clé : un refus privé, sans appel au service', async () => {
    const { interaction, stats, run, said } = setup({ enabled: false });

    await run(showStats);

    expect(said(interaction.reply)).toMatchObject({
      content: STATS_REPLIES.unavailable['no-key'],
    });
    expect(stats.career).not.toHaveBeenCalled();
  });

  it('introuvable ou indisponible : le dit, et note la panne dans les logs', async () => {
    const strings = { plateforme: 'PSN', pseudo: 'Agent47' };
    const missing = setup({ strings, career: { status: 'not-found' } });
    await missing.run(showStats);
    expect(missing.said(missing.interaction.editReply)).toBe(
      STATS_REPLIES.notFound('Agent47', 'PSN'),
    );

    const limited = setup({ strings, career: { status: 'unavailable', reason: 'rate-limited' } });
    await limited.run(showStats);
    expect(limited.said(limited.interaction.editReply)).toBe(
      STATS_REPLIES.unavailable['rate-limited'],
    );
    expect(limited.context.logger.warn).toHaveBeenCalled();
  });
});

function autocomplete(platform: string | null, typed: string) {
  const { context, stats } = setup();
  const respond = vi.fn(async () => {});
  const interaction = { options: { getString: () => platform }, respond };
  const done = autocompletePlayer(
    interaction as unknown as AutocompleteInteraction,
    context,
    typed,
  );
  return { done, respond, stats };
}

describe('autocomplétion du pseudo', () => {
  it('propose les pseudos de la plateforme choisie', async () => {
    const { done, respond, stats } = autocomplete('PSN', 'agent');
    await done;

    expect(stats.search).toHaveBeenCalledWith('PSN', 'agent');
    expect(respond).toHaveBeenCalledWith([
      { name: 'Agent47', value: 'Agent47' },
      { name: 'Agent470', value: 'Agent470' },
    ]);
  });

  it('rien tant que la plateforme manque ou que la saisie est trop courte', async () => {
    for (const [platform, typed] of [
      [null, 'agent'],
      ['PSN', 'a'],
    ] as const) {
      const { done, respond, stats } = autocomplete(platform, typed);
      await done;
      expect(respond).toHaveBeenCalledWith([]);
      expect(stats.search).not.toHaveBeenCalled();
    }
  });
});
