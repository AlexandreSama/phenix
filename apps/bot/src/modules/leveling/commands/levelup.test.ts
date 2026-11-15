import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { levelup } from './levelup.js';

const card = vi.hoisted(() => ({ levelUpReply: vi.fn() }));
vi.mock('../level-card.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../level-card.js')>()),
  ...card,
}));

beforeEach(() => {
  card.levelUpReply.mockReset();
  card.levelUpReply.mockResolvedValue(CARD_REPLY);
});

const CARD_REPLY = { files: ['carte'] };

const context = { logger: { warn: vi.fn() } } as unknown as BotContext;

describe('/passage-de-niveau : réservée aux gestionnaires du serveur', () => {
  it('se nomme passage-de-niveau (nom français, comme /classement)', () => {
    expect(levelup.data.name).toBe('passage-de-niveau');
  });

  it('exige la permission Gérer le serveur, la même que celle proposée à Discord', () => {
    expect(levelup.requiredPermissions).toBe(PermissionFlagsBits.ManageGuild);
    expect(BigInt(levelup.data.toJSON().default_member_permissions ?? '0')).toBe(
      PermissionFlagsBits.ManageGuild,
    );
  });
});

interface FakeOptions {
  level?: number | null;
  target?: object | null;
  targetMember?: object | null;
}

/** Fausse interaction : seulement ce que /passage-de-niveau lit. */
function fakeInteraction({ level = null, target = null, targetMember = null }: FakeOptions = {}) {
  return {
    inCachedGuild: () => true,
    guild: { name: 'Les Agents' },
    user: { id: '200000000000000001' },
    member: {
      displayName: 'Moi (serveur)',
      displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/self-${size}.png`),
    },
    options: {
      getInteger: () => level,
      getUser: () => target,
      getMember: () => targetMember,
    },
    reply: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

async function execute(interaction: ReturnType<typeof fakeInteraction>) {
  await levelup.execute(interaction as unknown as ChatInputCommandInteraction, context);
}

describe('/passage-de-niveau : la carte', () => {
  it('hors d’une guilde en cache : ne fait rien', async () => {
    const interaction = { ...fakeInteraction(), inCachedGuild: () => false };

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(card.levelUpReply).not.toHaveBeenCalled();
  });

  it('par défaut : la carte de l’auteur au niveau 5, réponse éphémère via levelUpReply', async () => {
    const interaction = fakeInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(card.levelUpReply).toHaveBeenCalledTimes(1);
    expect(card.levelUpReply).toHaveBeenCalledWith(
      {
        displayName: 'Moi (serveur)',
        level: 5,
        avatarUrl: 'https://cdn/self-256.png',
      },
      expect.objectContaining({ logger: context.logger }),
    );
    expect(interaction.member.displayAvatarURL).toHaveBeenCalledWith({
      size: 256,
      forceStatic: true,
    });
    expect(interaction.editReply).toHaveBeenCalledWith(CARD_REPLY);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('un membre et un niveau donnés : sa carte, avec son pseudo et son avatar', async () => {
    const targetMember = {
      displayName: 'Cible (serveur)',
      displayAvatarURL: vi.fn(({ size }: { size: number }) => `https://cdn/cible-${size}.png`),
    };
    const interaction = fakeInteraction({
      level: 42,
      target: { id: '300000000000000009' },
      targetMember,
    });

    await execute(interaction);

    expect(card.levelUpReply).toHaveBeenCalledWith(
      {
        displayName: 'Cible (serveur)',
        level: 42,
        avatarUrl: 'https://cdn/cible-256.png',
      },
      expect.objectContaining({ logger: context.logger }),
    );
    expect(targetMember.displayAvatarURL).toHaveBeenCalledWith({ size: 256, forceStatic: true });
    expect(interaction.member.displayAvatarURL).not.toHaveBeenCalled();
  });

  it('renvoie telle quelle la réponse de repli (embed) quand le dessin échoue', async () => {
    const fallback = { embeds: ['repli'] };
    card.levelUpReply.mockResolvedValue(fallback);
    const interaction = fakeInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(fallback);
  });

  it('un membre hors du serveur : message éphémère clair, sans carte ni repli sur l’auteur', async () => {
    const interaction = fakeInteraction({
      target: { id: '300000000000000009' },
      targetMember: null,
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Ce membre n'est pas sur le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(card.levelUpReply).not.toHaveBeenCalled();
  });
});
