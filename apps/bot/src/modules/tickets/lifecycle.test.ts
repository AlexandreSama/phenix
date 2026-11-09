import type { Client, NonThreadGuildBasedChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeOrphanTickets, createTicketChannelDeleteHandler } from './lifecycle.js';

const database = vi.hoisted(() => ({
  closeTicket: vi.fn(),
  findOpenTicketChannels: vi.fn(),
  findTicketByChannel: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const logger = { info: vi.fn(), error: vi.fn() };
const guildChannel = (id: string) =>
  ({ id, isDMBased: () => false }) as unknown as NonThreadGuildBasedChannel;

beforeEach(() => {
  database.closeTicket.mockReset();
});

describe('salon de ticket supprimé à la main', () => {
  it('ferme le ticket encore ouvert, sans transcript', async () => {
    database.findTicketByChannel.mockResolvedValue({ id: 3, status: 'OPEN' } as never);

    await createTicketChannelDeleteHandler({} as never, logger)(guildChannel('1'));

    expect(database.closeTicket).toHaveBeenCalledWith({}, 3, {
      closedById: null,
      closedByName: null,
      transcriptKey: null,
      messageCount: null,
    });
  });

  it('ne touche pas un ticket déjà fermé par le bouton', async () => {
    database.findTicketByChannel.mockResolvedValue({ id: 3, status: 'CLOSED' } as never);

    await createTicketChannelDeleteHandler({} as never, logger)(guildChannel('1'));

    expect(database.closeTicket).not.toHaveBeenCalled();
  });
});

describe('ménage au démarrage', () => {
  it('ferme seulement les tickets dont le salon n’existe plus', async () => {
    database.findOpenTicketChannels.mockResolvedValue([
      { id: 1, channelId: 'present' },
      { id: 2, channelId: 'disparu' },
    ]);
    const client = {
      guilds: { cache: new Map([['g', {}]]) },
      channels: { cache: new Map([['present', {}]]) },
    } as unknown as Client<true>;

    expect(await closeOrphanTickets(client, {} as never, logger)).toBe(1);
    expect(database.closeTicket).toHaveBeenCalledTimes(1);
    expect(database.closeTicket).toHaveBeenCalledWith(
      {},
      2,
      expect.objectContaining({ transcriptKey: null }),
    );
  });
});
