import type { PrismaClient } from '@phenix/database';
import { describe, expect, it, vi } from 'vitest';
import { createXpRulesCache } from './xp-rules-cache.js';

const rows = [
  { kind: 'ROLE', targetId: '1001', percent: 150 },
  { kind: 'CHANNEL', targetId: '1002', percent: 50 },
];

function setup() {
  const findMany = vi.fn().mockResolvedValue(rows);
  const db = { xpMultiplier: { findMany } } as unknown as Pick<PrismaClient, 'xpMultiplier'>;
  let clock = 0;
  const cache = createXpRulesCache(db, 1_000, () => clock);
  return { cache, findMany, advance: (ms: number) => (clock += ms) };
}

describe('createXpRulesCache', () => {
  it('lit les bonus du serveur dans la base', async () => {
    const { cache, findMany } = setup();

    expect(await cache.getMultipliers('1')).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { guildId: '1' } }));
  });

  it('ne lit la base qu’une fois tant que la liste est fraîche', async () => {
    const { cache, findMany } = setup();

    await cache.getMultipliers('1');
    await cache.getMultipliers('1');

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('garde une liste par serveur', async () => {
    const { cache, findMany } = setup();

    await cache.getMultipliers('1');
    await cache.getMultipliers('2');

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('relit la base après invalidate, clear ou expiration', async () => {
    const { cache, findMany, advance } = setup();

    await cache.getMultipliers('1');
    cache.invalidate('1');
    await cache.getMultipliers('1');
    cache.clear();
    await cache.getMultipliers('1');
    advance(1_001);
    await cache.getMultipliers('1');

    expect(findMany).toHaveBeenCalledTimes(4);
  });

  it('n’oublie pas les autres serveurs quand l’un est invalidé', async () => {
    const { cache, findMany } = setup();
    await cache.getMultipliers('1');
    await cache.getMultipliers('2');

    cache.invalidate('1');
    await cache.getMultipliers('2');

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('ne garde pas une lecture ratée : la suivante réessaie', async () => {
    const { cache, findMany } = setup();
    findMany.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(cache.getMultipliers('1')).rejects.toThrow('base indisponible');
    await expect(cache.getMultipliers('1')).resolves.toEqual(rows);
  });

  it('une lecture A qui échoue après invalidate ne chasse pas la lecture B déjà en cache', async () => {
    const { cache, findMany } = setup();
    const failureA = Promise.withResolvers<never>();
    findMany.mockImplementationOnce(() => failureA.promise);

    const readA = cache.getMultipliers('1');
    cache.invalidate('1');
    await expect(cache.getMultipliers('1')).resolves.toEqual(rows);
    failureA.reject(new Error('base indisponible'));
    await expect(readA).rejects.toThrow('base indisponible');
    await cache.getMultipliers('1');

    // A (échec) puis B (succès) : une troisième lecture reste servie par le cache
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
