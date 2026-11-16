import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import type { GuildSettings } from '../../core/guild-config-cache.js';
import type { XpMultiplierEntry } from '@phenix/shared';
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
  xpMultiplierMaxPercent: 300,
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
  { bot = false, system = false, roleIds = [] as string[] } = {},
  where: FakeChannel = { id: CHANNEL, parentId: null },
) {
  const send = vi.fn().mockResolvedValue(undefined);
  const displayAvatarURL = vi.fn(() => 'https://cdn/avatar.png');
  return {
    inGuild: () => true,
    guildId: '100000000000000001',
    system,
    author: { id: '200000000000000001', bot, displayName: 'Agent' },
    member: {
      displayName: 'Agent Phénix',
      displayAvatarURL,
      roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
    },
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

function setup(
  config: GuildSettings | null = settings,
  multipliers: readonly XpMultiplierEntry[] = [],
) {
  const getMultipliers = vi.fn().mockResolvedValue(multipliers);
  const context = {
    db: {},
    logger: { error: vi.fn(), warn: vi.fn() },
    configs: { get: vi.fn().mockResolvedValue(config) },
    xpRules: { getMultipliers },
  } as unknown as BotContext;
  const handle = createMessageXpHandler(context, createCooldowns(), () => 0);
  return {
    context,
    getMultipliers,
    handle: (message: object) => handle(message as unknown as Message),
  };
}

beforeEach(() => {
  award.mockReset();
});

const ROLE_A = '600000000000000001';
const ROLE_B = '600000000000000002';
const ROLE_C = '600000000000000003';
const role = (targetId: string, percent: number): XpMultiplierEntry => ({
  kind: 'ROLE',
  targetId,
  percent,
});
const channel = (targetId: string, percent: number): XpMultiplierEntry => ({
  kind: 'CHANNEL',
  targetId,
  percent,
});
const category = (targetId: string, percent: number): XpMultiplierEntry => ({
  kind: 'CATEGORY',
  targetId,
  percent,
});
/** Le tirage vaut toujours 10 XP (xpMin du faux serveur, random = 0). */
const amount = () => award.mock.calls[0]?.[1].amount;

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

  describe('bonus d’XP', () => {
    it('ne change rien sans bonus (non-régression)', async () => {
      award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
      const { handle } = setup();

      await handle(fakeMessage({ roleIds: [ROLE_A] }));

      expect(amount()).toBe(10);
    });

    it('ne change rien quand aucun bonus ne concerne le membre ni le salon', async () => {
      award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
      const { handle } = setup(settings, [role(ROLE_B, 200), channel(OTHER_CHANNEL, 300)]);

      await handle(fakeMessage({ roleIds: [ROLE_A] }));

      expect(amount()).toBe(10);
    });

    it('multiplie l’XP d’un membre qui a un rôle à bonus', async () => {
      award.mockResolvedValue({ xp: 15, level: 0, leveledUp: false });
      const { handle } = setup(settings, [role(ROLE_A, 150)]);

      await handle(fakeMessage({ roleIds: [ROLE_A] }));

      expect(amount()).toBe(15);
    });

    it('multiplie les bonus de tous les rôles du membre', async () => {
      award.mockResolvedValue({ xp: 30, level: 0, leveledUp: false });
      const { handle } = setup(settings, [role(ROLE_A, 150), role(ROLE_B, 200)]);

      await handle(fakeMessage({ roleIds: [ROLE_A, ROLE_B] }));

      expect(amount()).toBe(30);
    });

    it('applique le plafond du serveur', async () => {
      award.mockResolvedValue({ xp: 30, level: 0, leveledUp: false });
      const { handle } = setup(settings, [role(ROLE_A, 150), role(ROLE_B, 150), role(ROLE_C, 150)]);

      await handle(fakeMessage({ roleIds: [ROLE_A, ROLE_B, ROLE_C] }));

      expect(amount()).toBe(30);
    });

    it('lit le plafond réglé sur le serveur, pas une valeur fixe', async () => {
      award.mockResolvedValue({ xp: 20, level: 0, leveledUp: false });
      const { handle } = setup({ ...settings, xpMultiplierMaxPercent: 200 }, [role(ROLE_A, 500)]);

      await handle(fakeMessage({ roleIds: [ROLE_A] }));

      expect(amount()).toBe(20);
    });

    it('applique le bonus du salon', async () => {
      award.mockResolvedValue({ xp: 20, level: 0, leveledUp: false });
      const { handle } = setup(settings, [channel(CHANNEL, 200)]);

      await handle(fakeMessage());

      expect(amount()).toBe(20);
    });

    it('applique le bonus de la catégorie quand le salon n’en a pas', async () => {
      award.mockResolvedValue({ xp: 30, level: 0, leveledUp: false });
      const { handle } = setup(settings, [category(CATEGORY, 300)]);

      await handle(fakeMessage({}, { id: CHANNEL, parentId: CATEGORY }));

      expect(amount()).toBe(30);
    });

    it('le bonus du salon passe avant celui de la catégorie, sans les multiplier', async () => {
      award.mockResolvedValue({ xp: 20, level: 0, leveledUp: false });
      const { handle } = setup(settings, [channel(CHANNEL, 200), category(CATEGORY, 50)]);

      await handle(fakeMessage({}, { id: CHANNEL, parentId: CATEGORY }));

      expect(amount()).toBe(20);
    });

    it('un fil hérite du bonus de son salon parent', async () => {
      award.mockResolvedValue({ xp: 20, level: 0, leveledUp: false });
      const { handle } = setup(settings, [channel(PARENT, 200), category(CATEGORY, 50)]);

      await handle(
        fakeMessage(
          {},
          { id: CHANNEL, parentId: PARENT, thread: true, parentCategoryId: CATEGORY },
        ),
      );

      expect(amount()).toBe(20);
    });

    it('un fil hérite de la catégorie de son salon parent à défaut', async () => {
      award.mockResolvedValue({ xp: 5, level: 0, leveledUp: false });
      const { handle } = setup(settings, [category(CATEGORY, 50)]);

      await handle(
        fakeMessage(
          {},
          { id: CHANNEL, parentId: PARENT, thread: true, parentCategoryId: CATEGORY },
        ),
      );

      expect(amount()).toBe(5);
    });

    it('combine le bonus d’un rôle et celui du lieu', async () => {
      award.mockResolvedValue({ xp: 30, level: 0, leveledUp: false });
      const { handle } = setup(settings, [role(ROLE_A, 150), channel(CHANNEL, 200)]);

      await handle(fakeMessage({ roleIds: [ROLE_A] }));

      expect(amount()).toBe(30);
    });

    it('ne lit pas les bonus pour un message exclu, et ne donne rien', async () => {
      const { handle, getMultipliers } = setup({ ...settings, xpExcludedChannelIds: [CHANNEL] }, [
        channel(CHANNEL, 500),
      ]);

      await handle(fakeMessage());

      expect(award).not.toHaveBeenCalled();
      expect(getMultipliers).not.toHaveBeenCalled();
    });

    it('ne lit pas les bonus pour un message arrêté par le délai', async () => {
      award.mockResolvedValue({ xp: 10, level: 0, leveledUp: false });
      const { handle, getMultipliers } = setup();

      await handle(fakeMessage());
      await handle(fakeMessage());

      expect(getMultipliers).toHaveBeenCalledTimes(1);
    });
  });

  it('journalise une erreur de base sans la laisser remonter', async () => {
    award.mockRejectedValue(new Error('base indisponible'));
    const { context, handle } = setup();

    await expect(handle(fakeMessage())).resolves.toBeUndefined();
    expect(context.logger.error).toHaveBeenCalled();
  });
});
