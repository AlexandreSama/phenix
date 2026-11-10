import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTd2Processor, type Td2ProcessorDeps } from './processor.js';
import { raidEvent, signup } from './test-fixtures.js';

const database = vi.hoisted(() => ({
  findTd2Event: vi.fn(),
  markTd2EventPublished: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const START = Date.parse('2026-11-14T20:00:00Z');

function setup(nowMs: number) {
  const channel = {
    guildId: '100000000000000001',
    isSendable: () => true,
    send: vi.fn(async () => ({ id: '900000000000000009' })),
    messages: { edit: vi.fn(async () => ({})) },
  };
  const client = { channels: { fetch: vi.fn(async () => channel) } };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const deps = {
    client,
    db: {},
    logger,
    now: () => new Date(nowMs),
  } as unknown as Td2ProcessorDeps;
  return { channel, client, logger, process: createTd2Processor(deps) };
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
});

describe('rappel', () => {
  it('prévient les inscrits un quart d’heure avant', async () => {
    database.findTd2Event.mockResolvedValue(raidEvent({ signups: [signup('1', 'DPS')] }));
    const { channel, process } = setup(START - 15 * 60_000);

    await process({ name: 'remind', data: { eventId: 12 } });

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['1'] } }),
    );
  });

  it('ne dit rien pour une sortie vide, déplacée plus tard ou annulée', async () => {
    const { channel, process } = setup(START - 15 * 60_000);
    database.findTd2Event.mockResolvedValueOnce(raidEvent());
    database.findTd2Event.mockResolvedValueOnce(
      raidEvent({ signups: [signup('1', 'DPS')], scheduledAt: new Date(START + 3_600_000) }),
    );
    database.findTd2Event.mockResolvedValueOnce(raidEvent({ cancelledAt: new Date() }));

    for (let i = 0; i < 3; i++) await process({ name: 'remind', data: { eventId: 12 } });

    expect(channel.send).not.toHaveBeenCalled();
  });
});

describe('fermeture', () => {
  it('à l’heure du début, le message perd ses boutons', async () => {
    database.findTd2Event.mockResolvedValue(raidEvent());
    const { channel, process } = setup(START);

    await process({ name: 'close', data: { eventId: 12 } });

    expect(channel.messages.edit).toHaveBeenCalledWith(
      '900000000000000001',
      expect.objectContaining({ components: [] }),
    );
  });

  it('une fermeture périmée (sortie déplacée plus tard) ne touche à rien', async () => {
    database.findTd2Event.mockResolvedValue(
      raidEvent({ scheduledAt: new Date(START + 3_600_000) }),
    );
    const { channel, process } = setup(START);

    await process({ name: 'close', data: { eventId: 12 } });

    expect(channel.messages.edit).not.toHaveBeenCalled();
  });

  it('salon supprimé : noté dans les logs ; Discord indisponible : BullMQ réessaiera', async () => {
    database.findTd2Event.mockResolvedValue(raidEvent());
    const { client, logger, process } = setup(START);
    const unknownChannel = new DiscordAPIError(
      { code: RESTJSONErrorCodes.UnknownChannel, message: 'Unknown Channel' },
      RESTJSONErrorCodes.UnknownChannel,
      404,
      'GET',
      '/channels',
      {},
    );
    client.channels.fetch.mockRejectedValueOnce(unknownChannel);
    client.channels.fetch.mockRejectedValueOnce(new Error('Discord indisponible'));

    await expect(process({ name: 'close', data: { eventId: 12 } })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    await expect(process({ name: 'close', data: { eventId: 12 } })).rejects.toThrow(
      'Discord indisponible',
    );
  });
});
