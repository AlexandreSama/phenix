import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { rank } from './rank.js';

const database = vi.hoisted(() => ({ getMemberRank: vi.fn() }));
vi.mock('@phenix/database', () => database);

const card = vi.hoisted(() => ({ rankReply: vi.fn() }));
vi.mock('../rank-card.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rank-card.js')>()),
  ...card,
}));

beforeEach(() => {
  database.getMemberRank.mockReset();
  card.rankReply.mockReset();
});

const me = { id: '200000000000000001', bot: false, displayName: 'Moi' };

/** Fausse interaction : seulement ce que /rank lit. */
function fakeInteraction(target: object | null) {
  return {
    inCachedGuild: () => true,
    guildId: '100000000000000001',
    user: me,
    member: null,
    options: { getUser: () => target, getMember: () => null },
    reply: vi.fn(),
  };
}

/** Le contexte du bot : la base, et le logger que la commande doit transmettre à rankReply. */
const context = { db: {}, logger: { warn: vi.fn() } } as unknown as BotContext;

async function run(target: object | null) {
  const interaction = fakeInteraction(target);
  await rank.execute(interaction as unknown as ChatInputCommandInteraction, context);
  return interaction.reply.mock.calls[0]?.[0] as { content?: string; embeds?: unknown[] };
}

describe('/rank', () => {
  it('rappelle que les bots ne gagnent pas d’XP', async () => {
    expect((await run({ id: '9', bot: true })).content).toBe("Les bots ne gagnent pas d'XP.");
    expect(database.getMemberRank).not.toHaveBeenCalled();
  });

  it('prévient un membre qui n’a encore rien gagné', async () => {
    database.getMemberRank.mockResolvedValue(null);
    expect((await run(null)).content).toContain("Tu n'as pas encore gagné d'XP");
  });
});

const memberRank = { xp: 18240, messages: 2431, rank: 3, total: 412 };
const CARD_REPLY = { files: ['carte'] };

/** Fausse interaction complète : serveur, membre ciblé ou soi-même, avatar à la demande. */
function fakeRankInteraction({
  target = null,
  targetMember = null,
}: { target?: object | null; targetMember?: object | null } = {}) {
  const self = {
    id: '200000000000000001',
    bot: false,
    displayName: 'Moi (compte)',
    displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/self-${size}.png`),
  };
  const member = {
    displayName: 'Moi (serveur)',
    displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/self-member-${size}.png`),
  };
  return {
    inCachedGuild: () => true,
    guildId: '100000000000000001',
    guild: { name: 'Les Agents' },
    user: self,
    member,
    options: { getUser: () => target, getMember: () => targetMember },
    reply: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

async function execute(interaction: ReturnType<typeof fakeRankInteraction>) {
  await rank.execute(interaction as unknown as ChatInputCommandInteraction, context);
}

describe('/rank : la carte dessinée', () => {
  beforeEach(() => {
    database.getMemberRank.mockResolvedValue(memberRank);
    card.rankReply.mockResolvedValue(CARD_REPLY);
  });

  it('répond avec ce que renvoie rankReply, après avoir différé la réponse', async () => {
    const interaction = fakeRankInteraction();

    await execute(interaction);

    expect(database.getMemberRank).toHaveBeenCalledWith(
      context.db,
      '100000000000000001',
      '200000000000000001',
    );
    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(interaction.editReply).toHaveBeenCalledWith(CARD_REPLY);
    expect(interaction.reply).not.toHaveBeenCalled();
    // le téléchargement d'avatar et le dessin peuvent dépasser les 3 s : on défère avant
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      card.rankReply.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
    expect(card.rankReply.mock.invocationCallOrder[0]).toBeLessThan(
      interaction.editReply.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('passe le serveur, le pseudo du membre et son avatar statique en 256 px', async () => {
    const interaction = fakeRankInteraction();

    await execute(interaction);

    expect(card.rankReply).toHaveBeenCalledTimes(1);
    expect(card.rankReply).toHaveBeenCalledWith(
      {
        rank: memberRank,
        displayName: 'Moi (serveur)',
        guildName: 'Les Agents',
        avatarUrl: 'https://cdn/self-member-256.png',
      },
      expect.objectContaining({ logger: context.logger }),
    );
    // statique : un avatar animé servi en .gif dépasserait vite AVATAR_MAX_BYTES (la carte ne
    // dessine de toute façon que la première image)
    expect(interaction.member.displayAvatarURL).toHaveBeenCalledWith({
      size: 256,
      forceStatic: true,
    });
  });

  it('un membre ciblé : sa carte, avec son pseudo et son avatar', async () => {
    const target = { id: '300000000000000009', bot: false, displayName: 'Cible (compte)' };
    const targetMember = {
      displayName: 'Cible (serveur)',
      displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/cible-${size}.png`),
    };
    const interaction = fakeRankInteraction({ target, targetMember });

    await execute(interaction);

    expect(database.getMemberRank).toHaveBeenCalledWith(
      context.db,
      '100000000000000001',
      '300000000000000009',
    );
    expect(card.rankReply).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Cible (serveur)',
        avatarUrl: 'https://cdn/cible-256.png',
        guildName: 'Les Agents',
      }),
      expect.objectContaining({ logger: context.logger }),
    );
    expect(targetMember.displayAvatarURL).toHaveBeenCalledWith({ size: 256, forceStatic: true });
  });

  it('un membre ciblé qui a quitté le serveur : sa carte, jamais le visage de l’auteur', async () => {
    const target = {
      id: '300000000000000009',
      bot: false,
      displayName: 'Cible (compte)',
      displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/cible-user-${size}.png`),
    };
    // getMember renvoie null : la cible n'est plus dans le serveur, seul son compte reste
    const interaction = fakeRankInteraction({ target, targetMember: null });

    await execute(interaction);

    expect(database.getMemberRank).toHaveBeenCalledWith(
      context.db,
      '100000000000000001',
      '300000000000000009',
    );
    expect(card.rankReply).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Cible (compte)',
        avatarUrl: 'https://cdn/cible-user-256.png',
      }),
      expect.objectContaining({ logger: context.logger }),
    );
    expect(target.displayAvatarURL).toHaveBeenCalledWith({ size: 256, forceStatic: true });
    expect(interaction.member.displayAvatarURL).not.toHaveBeenCalled();
  });
});

describe('/rank : réponses privées (inchangées)', () => {
  it('hors d’une guilde en cache : ne fait rien (ni réponse, ni différé, ni base, ni carte)', async () => {
    const interaction = { ...fakeRankInteraction(), inCachedGuild: () => false };

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(database.getMemberRank).not.toHaveBeenCalled();
    expect(card.rankReply).not.toHaveBeenCalled();
  });

  it('un bot ciblé : réponse éphémère, sans XP, sans différer', async () => {
    const interaction = fakeRankInteraction({ target: { id: '9', bot: true } });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Les bots ne gagnent pas d'XP.",
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(card.rankReply).not.toHaveBeenCalled();
    expect(database.getMemberRank).not.toHaveBeenCalled();
  });

  it('un membre sans XP : réponse éphémère, sans carte ni différer', async () => {
    database.getMemberRank.mockResolvedValue(null);
    const interaction = fakeRankInteraction();

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Tu n'as pas encore gagné d'XP"),
        flags: MessageFlags.Ephemeral,
      }),
    );
    // une réponse différée publique ne peut plus devenir éphémère : on ne diffère qu'après ce contrôle
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(card.rankReply).not.toHaveBeenCalled();
  });
});
