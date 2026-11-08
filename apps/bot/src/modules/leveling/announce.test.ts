import type { Message } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { announceLevelUp } from './announce.js';

const LEVELS_CHANNEL = '300000000000000009';

function fakeMessage(channels: Map<string, object>) {
  return {
    guildId: '100000000000000001',
    author: { id: '200000000000000001' },
    guild: { channels: { cache: channels } },
    channel: { id: '300000000000000001', send: vi.fn().mockResolvedValue(undefined) },
  };
}

const run = (message: ReturnType<typeof fakeMessage>, channelId: string | null) => {
  const logger = { warn: vi.fn() };
  return {
    logger,
    done: announceLevelUp(message as unknown as Message<true>, 3, channelId, logger),
  };
};

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
});
