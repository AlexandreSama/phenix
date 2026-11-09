import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGiveawayProcessor, type GiveawayProcessorDeps } from './processor.js';

const database = vi.hoisted(() => ({
  closeGiveaway: vi.fn(),
  findGiveaway: vi.fn(),
  markGiveawayAnnounced: vi.fn(),
  markGiveawayFailed: vi.fn(),
  markGiveawayPublished: vi.fn(),
  rerollGiveaway: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CHANNEL = '400000000000000001';

const giveaway = (overrides: object = {}) => ({
  id: 7,
  guildId: GUILD,
  channelId: CHANNEL,
  messageId: '900000000000000001',
  hostId: '200000000000000001',
  prize: 'Nitro',
  winnersCount: 1,
  requiredRoleId: null,
  endsAt: new Date('2026-11-10T20:00:00Z'),
  endedAt: null,
  winnerIds: [] as string[],
  announcedAt: null,
  publishedAt: null,
  publishError: null,
  _count: { entries: 3 },
  ...overrides,
});

const ended = (overrides: object = {}) =>
  giveaway({ endedAt: new Date('2026-11-10T20:00:01Z'), winnerIds: ['1'], ...overrides });

const discordError = (code: number) =>
  new DiscordAPIError({ code, message: 'refusé' }, code, 403, 'POST', '/channels', {});

function setup() {
  const channel = {
    guildId: GUILD,
    isSendable: () => true,
    isTextBased: () => true,
    isDMBased: () => false,
    send: vi.fn(async () => ({ id: '900000000000000002' })),
    messages: { edit: vi.fn(async () => ({})), delete: vi.fn(async () => {}) },
  };
  const client = { channels: { fetch: vi.fn(async () => channel) } };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const deps = { client, db: {}, logger } as unknown as GiveawayProcessorDeps;
  return { channel, client, logger, process: createGiveawayProcessor(deps) };
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
});

describe('publication', () => {
  it('poste le message d’un nouveau giveaway et note son ID', async () => {
    database.findGiveaway.mockResolvedValue(giveaway({ messageId: null }));
    const { channel, process } = setup();

    await process({ name: 'publish', data: { giveawayId: 7 } });

    expect(channel.send).toHaveBeenCalledOnce();
    expect(database.markGiveawayPublished).toHaveBeenCalledWith({}, 7, '900000000000000002');
  });

  it('met à jour le message existant (nouveau nombre de participants)', async () => {
    database.findGiveaway.mockResolvedValue(giveaway());
    const { channel, process } = setup();

    await process({ name: 'publish', data: { giveawayId: 7 } });

    expect(channel.messages.edit).toHaveBeenCalledWith('900000000000000001', expect.anything());
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('un échec durable est noté pour le site, sans réessai', async () => {
    database.findGiveaway.mockResolvedValue(giveaway({ messageId: null }));
    const { channel, process } = setup();
    channel.send.mockRejectedValue(discordError(RESTJSONErrorCodes.MissingPermissions));

    await expect(process({ name: 'publish', data: { giveawayId: 7 } })).resolves.toBeUndefined();

    expect(database.markGiveawayFailed).toHaveBeenCalledWith(
      {},
      7,
      "Le bot n'a pas le droit d'écrire ou d'intégrer des liens dans ce salon",
    );
  });

  it('un échec passager remonte : BullMQ réessaiera la tâche', async () => {
    database.findGiveaway.mockResolvedValue(giveaway({ messageId: null }));
    const { channel, process } = setup();
    channel.send.mockRejectedValue(new Error('Discord indisponible'));

    await expect(process({ name: 'publish', data: { giveawayId: 7 } })).rejects.toThrow(
      'Discord indisponible',
    );
    expect(database.markGiveawayFailed).toHaveBeenCalled();
  });

  it('un giveaway supprimé entre-temps ne fait rien', async () => {
    database.findGiveaway.mockResolvedValue(null);
    const { client, process } = setup();

    await process({ name: 'publish', data: { giveawayId: 7 } });

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });
});

describe('tirage', () => {
  it('passe le message en « terminé », annonce les gagnants en réponse, puis le note', async () => {
    database.closeGiveaway.mockResolvedValue(ended());
    database.findGiveaway.mockResolvedValue(ended());
    const { channel, process } = setup();

    await process({ name: 'end', data: { giveawayId: 7 } });

    expect(channel.messages.edit).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '🎉 Félicitations <@1> ! Tu remportes **Nitro**.',
        reply: { messageReference: '900000000000000001', failIfNotExists: false },
        allowedMentions: { users: ['1'] },
      }),
    );
    expect(database.markGiveawayAnnounced).toHaveBeenCalledWith({}, 7);
  });

  it('rejouée après une annonce ratée : annonce sans retirer au sort', async () => {
    database.closeGiveaway.mockResolvedValue(ended());
    database.findGiveaway.mockResolvedValue(ended());
    const { channel, process } = setup();
    channel.send.mockRejectedValueOnce(new Error('Discord indisponible'));

    await expect(process({ name: 'end', data: { giveawayId: 7 } })).rejects.toThrow(
      'Discord indisponible',
    );
    expect(database.markGiveawayAnnounced).not.toHaveBeenCalled();

    await process({ name: 'end', data: { giveawayId: 7 } });

    // closeGiveaway renvoie le tirage déjà fait : les mêmes gagnants sont annoncés
    expect(channel.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['1'] } }),
    );
    expect(database.markGiveawayAnnounced).toHaveBeenCalledOnce();
  });

  it('déjà annoncé ou supprimé : rien à faire', async () => {
    const { client, process } = setup();
    database.closeGiveaway.mockResolvedValueOnce(ended({ announcedAt: new Date() }));
    database.closeGiveaway.mockResolvedValueOnce(null);

    await process({ name: 'end', data: { giveawayId: 7 } });
    await process({ name: 'end', data: { giveawayId: 7 } });

    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(database.markGiveawayAnnounced).not.toHaveBeenCalled();
  });

  it('salon supprimé : l’erreur est notée, le giveaway reste « à annoncer »', async () => {
    database.closeGiveaway.mockResolvedValue(ended());
    database.findGiveaway.mockResolvedValue(ended());
    const { client, process } = setup();
    client.channels.fetch.mockRejectedValue(discordError(RESTJSONErrorCodes.UnknownChannel));

    await process({ name: 'end', data: { giveawayId: 7 } });

    expect(database.markGiveawayFailed).toHaveBeenCalledWith({}, 7, "Ce salon n'existe plus");
    expect(database.markGiveawayAnnounced).not.toHaveBeenCalled();
  });
});

describe('relance et retrait', () => {
  it('annonce le nouveau tirage', async () => {
    database.rerollGiveaway.mockResolvedValue(ended({ winnerIds: ['2'] }));
    database.findGiveaway.mockResolvedValue(ended({ winnerIds: ['2'] }));
    const { channel, process } = setup();

    await process({ name: 'reroll', data: { giveawayId: 7 } });

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Nouveau tirage ! 🎉 Félicitations <@2> ! Tu remportes **Nitro**.',
      }),
    );
    expect(database.markGiveawayAnnounced).toHaveBeenCalledWith({}, 7);
  });

  it('ignore une relance avant le premier tirage', async () => {
    database.rerollGiveaway.mockResolvedValue('not-ended');
    const { logger, process } = setup();

    await process({ name: 'reroll', data: { giveawayId: 7 } });

    expect(logger.warn).toHaveBeenCalled();
    expect(database.findGiveaway).not.toHaveBeenCalled();
  });

  it('retire le message d’un giveaway supprimé sur le site', async () => {
    const { channel, process } = setup();

    await process({ name: 'remove', data: { channelId: CHANNEL, messageId: '900' } });

    expect(channel.messages.delete).toHaveBeenCalledWith('900');
  });
});
