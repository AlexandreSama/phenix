import { describe, expect, it } from 'vitest';
import { drawWinners } from './giveaways.js';

/** Un faux hasard qui rejoue une suite de valeurs. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

describe('drawWinners', () => {
  it('tire le nombre demandé, sans doublon, parmi les candidats', () => {
    const winners = drawWinners(['a', 'b', 'c', 'd', 'e'], 3);

    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3);
    for (const winner of winners) expect(['a', 'b', 'c', 'd', 'e']).toContain(winner);
  });

  it('suit le hasard fourni : mélange de Fisher-Yates', () => {
    // i=0 : échange avec 0+2 → c b a d ; i=1 : échange avec 1+0 → c b a d
    expect(drawWinners(['a', 'b', 'c', 'd'], 2, sequence(2, 0))).toEqual(['c', 'b']);
  });

  it('se contente de ce qu’il y a quand les candidats manquent', () => {
    expect(drawWinners(['a', 'a', 'b'], 5).toSorted()).toEqual(['a', 'b']);
    expect(drawWinners([], 3)).toEqual([]);
  });

  it('donne la même chance à chacun', () => {
    const wins = new Map<string, number>();
    for (let round = 0; round < 6000; round++) {
      const [winner] = drawWinners(['a', 'b', 'c'], 1);
      wins.set(winner!, (wins.get(winner!) ?? 0) + 1);
    }
    // 2000 attendus chacun ; l'écart réel dépasse rarement 150
    for (const count of wins.values()) expect(Math.abs(count - 2000)).toBeLessThan(250);
  });
});
