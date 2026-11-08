import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, totalXpForLevel, xpToNextLevel } from './levels.js';

describe('courbe des niveaux', () => {
  it('demande 100, 155 puis 220 XP pour les premiers niveaux', () => {
    expect([0, 1, 2].map(xpToNextLevel)).toEqual([100, 155, 220]);
  });

  it('donne le même total que la somme niveau par niveau', () => {
    let sum = 0;
    for (let level = 0; level <= 200; level++) {
      expect(totalXpForLevel(level)).toBe(sum);
      sum += xpToNextLevel(level);
    }
  });

  it('passe de niveau pile au seuil, pas une XP avant', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(99)).toBe(0);
    expect(levelForXp(100)).toBe(1);
    expect(levelForXp(254)).toBe(1);
    expect(levelForXp(255)).toBe(2);
  });

  it('retrouve le niveau de n’importe quel seuil', () => {
    for (const level of [5, 42, 100, 500]) {
      const threshold = totalXpForLevel(level);
      expect(levelForXp(threshold)).toBe(level);
      expect(levelForXp(threshold - 1)).toBe(level - 1);
    }
  });

  it('calcule la progression dans le niveau', () => {
    expect(levelProgress(355)).toEqual({ level: 2, current: 100, needed: 220, ratio: 100 / 220 });
  });
});
