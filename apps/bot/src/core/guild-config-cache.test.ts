import type { PrismaClient } from '@phenix/database';
import { describe, expect, it, vi } from 'vitest';
import { createGuildConfigCache } from './guild-config-cache.js';

const settings = {
  timezone: 'Europe/Paris',
  modLogChannelId: '400000000000000001',
  announceChannelId: null,
  staffRoleIds: [],
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
  ticketCategoryId: null,
  ticketStaffRoleIds: [],
  ticketLogChannelId: null,
  td2ChannelId: null,
};

function setup() {
  const findUnique = vi.fn().mockResolvedValue(settings);
  const db = { guildConfig: { findUnique } } as unknown as Pick<PrismaClient, 'guildConfig'>;
  let clock = 0;
  const cache = createGuildConfigCache(db, 1_000, () => clock);
  return { cache, findUnique, advance: (ms: number) => (clock += ms) };
}

describe('createGuildConfigCache', () => {
  it('ne lit la base qu’une fois tant que la config est fraîche', async () => {
    const { cache, findUnique } = setup();

    await cache.get('1');
    await cache.get('1');

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('relit la base après invalidate, clear ou expiration', async () => {
    const { cache, findUnique, advance } = setup();

    await cache.get('1');
    cache.invalidate('1');
    await cache.get('1');
    cache.clear();
    await cache.get('1');
    advance(1_001);
    await cache.get('1');

    expect(findUnique).toHaveBeenCalledTimes(4);
  });

  it('ne garde pas une lecture qui a échoué', async () => {
    const { cache, findUnique } = setup();
    findUnique.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(cache.get('1')).rejects.toThrow('base indisponible');
    await expect(cache.get('1')).resolves.toEqual(settings);
  });
});
