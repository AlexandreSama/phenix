import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import type { GuildSettings } from '../../core/guild-config-cache.js';
import { createMessageXpHandler } from './message-xp.js';
import { createCooldowns } from './xp.js';

const database = vi.hoisted(() => ({ awardXp: vi.fn() }));
vi.mock('@phenix/database', () => database);
// Pas de dessin ni d'accès réseau dans ces tests : la carte est testée dans level-card.test.ts
vi.mock('./level-card.js', () => ({
  levelUpReply: vi.fn().mockResolvedValue({ files: [] }),
}));
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
  xpExcludedChannelIds: [],
  ticketLogChannelId: null,
  td2ChannelId: null,
  td2ReportChannelId: null,
  td2ReportViewerRoleIds: [],
  td2ReportFeedChannelId: null,
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: null,
  welcomeRoleId: null,
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: null,
};

const CHANNEL = '300000000000000001';
const CATEGORY = '400000000000000001';
const PARENT = '500000000000000001';
const OTHER_CHANNEL = '300000000000000002';

/** Faux salon : normal (parentId = catégorie) ou fil (parentId = salon parent, parent.parentId = catégorie). */
type FakeChannel =
  | { id: string; parentId: string | null; thread?: false }
  | { id: string; parentId: string; thread: true; parentCategoryId: string | null };

/** Faux message : seulement ce que le handler lit. */
function fakeMessage(
  { bot = false, system = false } = {},
  where: FakeChannel = { id: CHANNEL, parentId: null },
) {
  const send = vi.fn().mockResolvedValue(undefined);
  const displayAvatarURL = vi.fn(() => 'https://cdn/avatar.png');
  return {
    inGuild: () => true,
    guildId: '100000000000000001',
    system,
    author: { id: '200000000000000001', bot, displayName: 'Agent' },
    member: { displayName: 'Agent Phénix', displayAvatarURL },
    displayAvatarURL,
    guild: { channels: { cache: new Map() } },
    channel: {
      id: where.id,
      parentId: where.parentId,
      parent: where.thread ? { parentId: where.parentCategoryId } : null,
      isThread: () => where.thread === true,
      send,
    },
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

    expect(message.send).toHaveBeenCalledOnce();
    const callArgs = message.send.mock.calls[0]?.[0];
    // Le contenu texte est toujours présent
    expect(callArgs?.content).toContain('🔥');
    expect(callArgs?.content).toContain('<@200000000000000001>');
    // La mention notifie le membre, et lui seul
    expect(callArgs?.allowedMentions?.users).toEqual(['200000000000000001']);
  });

  it('calcule l’avatar une seule fois par message, même en cas de passage de niveau', async () => {
    award.mockResolvedValue({ xp: 120, level: 1, leveledUp: true });
    const { handle } = setup();
    const message = fakeMessage();

    await handle(message);

    expect(message.displayAvatarURL).toHaveBeenCalledOnce();
  });

  it('demande un avatar statique (même URL que /rank et /passage-de-niveau), jamais un GIF animé', async () => {
    award.mockResolvedValue({ xp: 120, level: 1, leveledUp: true });
    const { handle } = setup();
    const message = fakeMessage();

    await handle(message);

    expect(message.displayAvatarURL).toHaveBeenCalledWith({
      extension: 'png',
      size: 128,
      forceStatic: true,
    });
  });

  describe('salons exclus', () => {
    const excluded = { ...settings, xpExcludedChannelIds: [CHANNEL] };

    it('ne donne rien dans un salon exclu', async () => {
      const { handle } = setup(excluded);

      await handle(fakeMessage());

      expect(award).not.toHaveBeenCalled();
    });

    it('ne donne rien dans un salon dont la catégorie est exclue', async () => {
      const { handle } = setup({ ...settings, xpExcludedChannelIds: [CATEGORY] });

      await handle(fakeMessage({}, { id: CHANNEL, parentId: CATEGORY }));

      expect(award).not.toHaveBeenCalled();
    });

    it('ne donne rien dans un fil dont le salon parent est exclu', async () => {
      const { handle } = setup({ ...settings, xpExcludedChannelIds: [PARENT] });

      await handle(
        fakeMessage({}, { id: CHANNEL, parentId: PARENT, thread: true, parentCategoryId: null }),
      );

      expect(award).not.toHaveBeenCalled();
    });

    it('ne donne rien dans un fil dont la catégorie du salon parent est exclue', async () => {
      const { handle } = setup({ ...settings, xpExcludedChannelIds: [CATEGORY] });

      await handle(
        fakeMessage(
          {},
          { id: CHANNEL, parentId: PARENT, thread: true, parentCategoryId: CATEGORY },
        ),
      );

      expect(award).not.toHaveBeenCalled();
    });

    it('donne l’XP dans un salon non exclu quand la liste n’est pas vide', async () => {
      award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
      const { handle } = setup(excluded);

      await handle(fakeMessage({}, { id: OTHER_CHANNEL, parentId: null }));

      expect(award).toHaveBeenCalledTimes(1);
    });

    it('ne consomme pas le délai : un message exclu n’empêche pas le suivant, ailleurs, de rapporter', async () => {
      award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
      const { handle } = setup(excluded);

      await handle(fakeMessage());
      await handle(fakeMessage({}, { id: OTHER_CHANNEL, parentId: null }));

      expect(award).toHaveBeenCalledTimes(1);
    });
  });

  it('journalise une erreur de base sans la laisser remonter', async () => {
    award.mockRejectedValue(new Error('base indisponible'));
    const { context, handle } = setup();

    await expect(handle(fakeMessage())).resolves.toBeUndefined();
    expect(context.logger.error).toHaveBeenCalled();
  });
});
