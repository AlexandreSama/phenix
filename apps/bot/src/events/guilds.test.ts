import type { PrismaClient } from '@phenix/database';
import { describe, expect, it, vi } from 'vitest';
import { markGuildLeft, syncGuilds, upsertGuild } from './guilds.js';

function fakeDb() {
  const guild = { upsert: vi.fn(), updateMany: vi.fn() };
  return { db: { guild } as unknown as Pick<PrismaClient, 'guild'>, guild };
}

describe('synchronisation des serveurs', () => {
  it('crée un serveur avec sa config par défaut', async () => {
    const { db, guild } = fakeDb();

    await upsertGuild(db, { id: '111111111111111111', name: 'Les Agents', icon: 'a1b2' });

    expect(guild.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '111111111111111111' },
        update: { name: 'Les Agents', icon: 'a1b2', leftAt: null },
        create: expect.objectContaining({ config: expect.anything() }),
      }),
    );
  });

  it('marque un serveur quitté sans le supprimer', async () => {
    const { db, guild } = fakeDb();

    await markGuildLeft(db, '111111111111111111');

    expect(guild.updateMany).toHaveBeenCalledWith({
      where: { id: '111111111111111111', leftAt: null },
      data: { leftAt: expect.any(Date) },
    });
  });

  it('au démarrage, marque comme quittés les serveurs absents', async () => {
    const { db, guild } = fakeDb();

    await syncGuilds(db, [
      { id: '1', name: 'A', icon: null },
      { id: '2', name: 'B', icon: null },
    ]);

    expect(guild.upsert).toHaveBeenCalledTimes(2);
    expect(guild.updateMany).toHaveBeenCalledWith({
      where: { leftAt: null, id: { notIn: ['1', '2'] } },
      data: { leftAt: expect.any(Date) },
    });
  });
});
