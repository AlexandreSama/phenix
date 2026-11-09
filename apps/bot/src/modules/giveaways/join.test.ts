import { REFRESH_DELAY_MS } from '@phenix/jobs';
import type { MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { JOIN_REPLIES, joinGiveawayButton, leaveGiveawayButton } from './join.js';

const database = vi.hoisted(() => ({
  findGiveaway: vi.fn(),
  joinGiveaway: vi.fn(),
  leaveGiveaway: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const ROLE = '300000000000000001';

const giveaway = (overrides: object = {}) => ({
  id: 7,
  guildId: GUILD,
  prize: 'Nitro',
  endedAt: null,
  requiredRoleId: null,
  ...overrides,
});

function fakeClick({ roles = [] as string[] } = {}) {
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    user: { id: '200000000000000001' },
    member: { displayName: 'Agent', roles: { cache: new Set(roles) } },
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
  };
}

function setup() {
  const giveaways = { publish: vi.fn(async () => {}) };
  const context = { db: {}, giveaways } as unknown as BotContext;
  const run = (handler: typeof joinGiveawayButton) => (interaction: ReturnType<typeof fakeClick>) =>
    handler.execute(interaction as unknown as MessageComponentInteraction, '7', context);
  return { giveaways, join: run(joinGiveawayButton), leave: run(leaveGiveawayButton) };
}

const replied = (interaction: ReturnType<typeof fakeClick>) =>
  (
    interaction.reply.mock.calls.at(-1) as unknown as [{ content: string; components?: unknown[] }]
  )[0];

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
});

describe('bouton Participer', () => {
  it('inscrit le membre et programme la mise à jour du compteur', async () => {
    database.findGiveaway.mockResolvedValue(giveaway());
    database.joinGiveaway.mockResolvedValue('joined');
    const { giveaways, join } = setup();
    const interaction = fakeClick();

    await join(interaction);

    expect(database.joinGiveaway).toHaveBeenCalledWith({}, 7, {
      userId: '200000000000000001',
      displayName: 'Agent',
    });
    expect(replied(interaction).content).toBe(JOIN_REPLIES.joined('Nitro'));
    expect(giveaways.publish).toHaveBeenCalledWith(7, { delayMs: REFRESH_DELAY_MS });
  });

  it('propose de se retirer à celui qui participe déjà', async () => {
    database.findGiveaway.mockResolvedValue(giveaway());
    database.joinGiveaway.mockResolvedValue('already');
    const { giveaways, join } = setup();
    const interaction = fakeClick();

    await join(interaction);

    expect(replied(interaction).content).toBe('Tu participes déjà à ce giveaway.');
    expect(replied(interaction).components).toHaveLength(1);
    expect(giveaways.publish).not.toHaveBeenCalled();
  });

  it('refuse sans le rôle requis, et l’accepte avec', async () => {
    database.findGiveaway.mockResolvedValue(giveaway({ requiredRoleId: ROLE }));
    database.joinGiveaway.mockResolvedValue('joined');
    const { join } = setup();
    const without = fakeClick();
    const withRole = fakeClick({ roles: [ROLE] });

    await join(without);
    await join(withRole);

    expect(replied(without).content).toBe(JOIN_REPLIES.missingRole(ROLE));
    expect(database.joinGiveaway).toHaveBeenCalledOnce();
  });

  it('terminé, supprimé, ou d’un autre serveur : refuse sans inscrire', async () => {
    const { join } = setup();
    for (const [found, expected] of [
      [giveaway({ endedAt: new Date() }), JOIN_REPLIES.ended],
      [null, JOIN_REPLIES.missing],
      [giveaway({ guildId: '100000000000000999' }), JOIN_REPLIES.missing],
    ] as const) {
      database.findGiveaway.mockResolvedValueOnce(found);
      const interaction = fakeClick();
      await join(interaction);
      expect(replied(interaction).content).toBe(expected);
    }
    expect(database.joinGiveaway).not.toHaveBeenCalled();
  });

  it('tirage fait entre la lecture et l’inscription : la base répond « terminé »', async () => {
    database.findGiveaway.mockResolvedValue(giveaway());
    database.joinGiveaway.mockResolvedValue('ended');
    const { giveaways, join } = setup();
    const interaction = fakeClick();

    await join(interaction);

    expect(replied(interaction).content).toBe(JOIN_REPLIES.ended);
    expect(giveaways.publish).not.toHaveBeenCalled();
  });
});

describe('bouton Me retirer', () => {
  it('retire le membre, remplace la réponse et met le compteur à jour', async () => {
    database.leaveGiveaway.mockResolvedValue('left');
    const { giveaways, leave } = setup();
    const interaction = fakeClick();

    await leave(interaction);

    expect(interaction.update).toHaveBeenCalledWith({ content: JOIN_REPLIES.left, components: [] });
    expect(giveaways.publish).toHaveBeenCalledWith(7, { delayMs: REFRESH_DELAY_MS });
  });

  it('trop tard : le dit sans toucher au compteur', async () => {
    database.leaveGiveaway.mockResolvedValue('ended');
    const { giveaways, leave } = setup();
    const interaction = fakeClick();

    await leave(interaction);

    expect(interaction.update).toHaveBeenCalledWith({
      content: JOIN_REPLIES.ended,
      components: [],
    });
    expect(giveaways.publish).not.toHaveBeenCalled();
  });
});
