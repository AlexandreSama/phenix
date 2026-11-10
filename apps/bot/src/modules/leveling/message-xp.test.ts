import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import type { GuildSettings } from '../../core/guild-config-cache.js';
import { createMessageXpHandler } from './message-xp.js';
import { createCooldowns } from './xp.js';

const database = vi.hoisted(() => ({ awardXp: vi.fn() }));
vi.mock('@phenix/database', () => database);
const award = database.awardXp;

const settings: GuildSettings = {
  timezone: 'Europe/Paris',
  modLogChannelId: null,
  announceChannelId: null,
  staffRoleIds: [],
  xpEnabled: true,
  xpMin: 10,
  xpMax: 20,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
  ticketCategoryId: null,
  ticketStaffRoleIds: [],
  ticketLogChannelId: null,
  td2ChannelId: null,
};

/** Faux message : seulement ce que le handler lit. */
function fakeMessage({ bot = false, system = false } = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  return {
    inGuild: () => true,
    guildId: '100000000000000001',
    system,
    author: { id: '200000000000000001', bot, displayName: 'Agent' },
    member: { displayName: 'Agent Phénix', displayAvatarURL: () => 'https://cdn/avatar.png' },
    guild: { channels: { cache: new Map() } },
    channel: { id: '300000000000000001', send },
    send,
  };
}

function setup(config: GuildSettings | null = settings) {
  const context = {
    db: {},
    logger: { error: vi.fn(), warn: vi.fn() },
    configs: { get: vi.fn().mockResolvedValue(config) },
  } as unknown as BotContext;
  const handle = createMessageXpHandler(context, createCooldowns(), () => 0);
  return { context, handle: (message: object) => handle(message as unknown as Message) };
}

beforeEach(() => {
  award.mockReset();
});

describe('gain d’XP sur les messages', () => {
  it('ignore les bots et les messages système', async () => {
    const { handle } = setup();

    await handle(fakeMessage({ bot: true }));
    await handle(fakeMessage({ system: true }));

    expect(award).not.toHaveBeenCalled();
  });

  it('ne donne rien quand l’XP est désactivée sur le serveur', async () => {
    const { handle } = setup({ ...settings, xpEnabled: false });

    await handle(fakeMessage());

    expect(award).not.toHaveBeenCalled();
  });

  it('donne l’XP avec le pseudo du serveur, une seule fois par délai', async () => {
    award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
    const { handle } = setup();

    await handle(fakeMessage());
    await handle(fakeMessage());

    expect(award).toHaveBeenCalledTimes(1);
    expect(award).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        amount: 10,
        cooldownMs: 60_000,
        displayName: 'Agent Phénix',
        avatarUrl: 'https://cdn/avatar.png',
      }),
    );
  });

  it('annonce le niveau dans le salon du message, sans mentionner personne d’autre', async () => {
    award.mockResolvedValue({ xp: 120, level: 1, leveledUp: true });
    const { handle } = setup();
    const message = fakeMessage();

    await handle(message);

    expect(message.send).toHaveBeenCalledWith({
      content: '🔥 <@200000000000000001> passe au **niveau 1** !',
      allowedMentions: { users: ['200000000000000001'] },
    });
  });

  it('journalise une erreur de base sans la laisser remonter', async () => {
    award.mockRejectedValue(new Error('base indisponible'));
    const { context, handle } = setup();

    await expect(handle(fakeMessage())).resolves.toBeUndefined();
    expect(context.logger.error).toHaveBeenCalled();
  });
});
