import { DiscordAPIError, RESTJSONErrorCodes, type Message } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceLevelUp, type LevelUpCardData } from './announce.js';
import type { LevelCardDeps } from './level-card.js';

const LEVELS_CHANNEL = '300000000000000009';

/** Une erreur de l'API Discord portant ce code (ex. 50013 : Missing Permissions). */
const discordError = (code: number) =>
  new DiscordAPIError({ code, message: 'refusé' }, code, 403, 'POST', '/channels', {});

function fakeMessage(channels: Map<string, object>) {
  return {
    guildId: '100000000000000001',
    author: { id: '200000000000000001' },
    guild: { channels: { cache: channels } },
    channel: { id: '300000000000000001', send: vi.fn().mockResolvedValue(undefined) },
  };
}

/** Doubles du rendu : aucun accès réseau, aucun dessin réel. */
const fakeDeps = (): LevelCardDeps => ({
  loadAvatar: vi.fn().mockResolvedValue(null),
  render: vi.fn().mockResolvedValue(Buffer.from('png')),
});

const run = (
  message: ReturnType<typeof fakeMessage>,
  channelId: string | null,
  extra?: LevelUpCardData,
  deps: LevelCardDeps = fakeDeps(),
) => {
  const logger = { warn: vi.fn() };
  return {
    logger,
    done: announceLevelUp(message as unknown as Message<true>, 3, channelId, logger, extra, deps),
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('announceLevelUp', () => {
  it('écrit dans le salon choisi sur le site', async () => {
    const levels = { id: LEVELS_CHANNEL, isSendable: () => true, send: vi.fn() };
    const message = fakeMessage(new Map([[LEVELS_CHANNEL, levels]]));

    await run(message, LEVELS_CHANNEL).done;

    expect(levels.send).toHaveBeenCalledOnce();
    expect(message.channel.send).not.toHaveBeenCalled();
  });

  it('se rabat sur le salon du message si le salon choisi a disparu', async () => {
    const message = fakeMessage(new Map());

    await run(message, LEVELS_CHANNEL).done;

    expect(message.channel.send).toHaveBeenCalledOnce();
  });

  it('journalise un envoi refusé sans planter', async () => {
    const message = fakeMessage(new Map());
    message.channel.send.mockRejectedValue(new Error('Missing Permissions'));

    const { logger, done } = run(message, null);
    await done;

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  // --- Avec données carte ------------------------------------------------------

  const extraData = {
    displayName: 'Faye',
    avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.png',
  };

  it('envoie la carte de niveau avec mention quand les données sont fournies', async () => {
    const levels = { id: LEVELS_CHANNEL, isSendable: () => true, send: vi.fn() };
    const message = fakeMessage(new Map([[LEVELS_CHANNEL, levels]]));

    await run(message, LEVELS_CHANNEL, extraData).done;

    expect(levels.send).toHaveBeenCalledOnce();
    const callArgs = levels.send.mock.calls[0]?.[0];
    expect(callArgs?.content).toContain('🔥');
    expect(callArgs?.content).toContain('<@200000000000000001>');
    // La carte est envoyée en pièce jointe
    expect(callArgs?.files).toBeDefined();
    expect(callArgs?.allowedMentions?.users).toEqual(['200000000000000001']);
  });

  it('rejoue sur le salon du message avec la carte quand les données sont fournies', async () => {
    const message = fakeMessage(new Map());

    await run(message, null, extraData).done;

    expect(message.channel.send).toHaveBeenCalledOnce();
    const callArgs = message.channel.send.mock.calls[0]?.[0];
    expect(callArgs?.files).toBeDefined();
  });

  it('replie sur l’embed et le texte, sans pièce jointe, quand le rendu de la carte échoue', async () => {
    const message = fakeMessage(new Map());
    const deps: LevelCardDeps = {
      loadAvatar: vi.fn().mockResolvedValue(null),
      render: vi.fn().mockRejectedValue(new Error('canvas cassé')),
    };

    const { logger, done } = run(message, null, extraData, deps);
    await done;

    expect(message.channel.send).toHaveBeenCalledOnce();
    const callArgs = message.channel.send.mock.calls[0]?.[0];
    expect(callArgs?.embeds).toHaveLength(1);
    expect(callArgs?.content).toContain('<@200000000000000001>');
    expect(callArgs?.files).toBeUndefined();
    expect(callArgs?.allowedMentions?.users).toEqual(['200000000000000001']);
    // Le repli est signalé dans les logs
    expect(logger.warn).toHaveBeenCalled();
  });

  it('réessaie en texte seul quand l’envoi avec la carte est refusé (pas de permission de joindre des fichiers)', async () => {
    const message = fakeMessage(new Map());
    const refusal = discordError(RESTJSONErrorCodes.MissingPermissions);
    message.channel.send.mockRejectedValueOnce(refusal).mockResolvedValueOnce(undefined);

    const { logger, done } = run(message, null, extraData);
    await done;

    expect(message.channel.send).toHaveBeenCalledTimes(2);
    const first = message.channel.send.mock.calls[0]?.[0];
    const retry = message.channel.send.mock.calls[1]?.[0];
    expect(first?.files).toBeDefined();
    expect(retry?.content).toContain('<@200000000000000001>');
    expect(retry?.files).toBeUndefined();
    expect(retry?.embeds).toBeUndefined();
    expect(retry?.allowedMentions?.users).toEqual(['200000000000000001']);
    // L'échec du premier envoi est journalisé avec son erreur
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: refusal }),
      expect.any(String),
    );
  });

  it('ne laisse rien remonter quand l’envoi avec carte puis le repli texte échouent', async () => {
    const message = fakeMessage(new Map());
    message.channel.send.mockRejectedValue(discordError(RESTJSONErrorCodes.MissingPermissions));

    const { logger, done } = run(message, null, extraData);

    await expect(done).resolves.toBeUndefined();
    expect(message.channel.send).toHaveBeenCalledTimes(2);
    // Un journal pour le premier échec, un pour l’échec final
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['une erreur réseau', new Error('timeout')],
    ['une autre erreur Discord', discordError(RESTJSONErrorCodes.UnknownChannel)],
  ])(
    'ne renvoie pas de second message après %s (Discord a pu publier le premier : pas de double notification)',
    async (_label, failure) => {
      const message = fakeMessage(new Map());
      message.channel.send.mockRejectedValue(failure);

      const { logger, done } = run(message, null, extraData);

      await expect(done).resolves.toBeUndefined();
      expect(message.channel.send).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledOnce();
    },
  );

  it('sans données extra : comportement texte seul (rétrocompatibilité)', async () => {
    const message = fakeMessage(new Map());

    await run(message, null, undefined).done;

    expect(message.channel.send).toHaveBeenCalledOnce();
    const callArgs = message.channel.send.mock.calls[0]?.[0];
    // Pas de fichiers, juste du texte
    expect(callArgs?.content).toContain('🔥');
    expect(callArgs?.files).toBeUndefined();
  });

  it('mentionne uniquement le joueur levé-up', async () => {
    const levels = { id: LEVELS_CHANNEL, isSendable: () => true, send: vi.fn() };
    const message = fakeMessage(new Map([[LEVELS_CHANNEL, levels]]));

    await run(message, LEVELS_CHANNEL, extraData).done;

    const callArgs = levels.send.mock.calls[0]?.[0];
    expect(callArgs?.allowedMentions?.users).toEqual(['200000000000000001']);
  });
});
