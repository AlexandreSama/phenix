import { describe, expect, it } from 'vitest';
import {
  effectiveXp,
  resolveXpPercents,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
  type XpMultiplierRule,
} from './xp-multipliers.js';

const MAX = 300;

describe('bornes des pourcentages', () => {
  it('va de 10 % à 500 % par cible', () => {
    expect(XP_MULTIPLIER_MIN_PERCENT).toBe(10);
    expect(XP_MULTIPLIER_MAX_PERCENT).toBe(500);
  });
});

describe('effectiveXp', () => {
  it('rend la base quand il n’y a aucun bonus', () => {
    expect(effectiveXp(20, { rolePercents: [], maxPercent: MAX })).toBe(20);
    expect(effectiveXp(20, { rolePercents: [], placePercent: null, maxPercent: MAX })).toBe(20);
  });

  it('applique un rôle seul', () => {
    expect(effectiveXp(20, { rolePercents: [150], maxPercent: MAX })).toBe(30);
  });

  it('applique un bonus de lieu seul', () => {
    expect(effectiveXp(20, { rolePercents: [], placePercent: 200, maxPercent: MAX })).toBe(40);
  });

  it('multiplie les rôles entre eux et avec le lieu : 150 % × 200 % = 300 %', () => {
    expect(effectiveXp(10, { rolePercents: [150], placePercent: 200, maxPercent: MAX })).toBe(30);
    expect(effectiveXp(10, { rolePercents: [150, 200], maxPercent: MAX })).toBe(30);
  });

  it('ramène au plafond un produit trop grand : 150 % ³ = 337,5 % devient 300 %', () => {
    expect(effectiveXp(100, { rolePercents: [150, 150, 150], maxPercent: MAX })).toBe(300);
  });

  it('accepte un produit qui atteint exactement le plafond', () => {
    expect(effectiveXp(10, { rolePercents: [300], maxPercent: MAX })).toBe(30);
    expect(effectiveXp(10, { rolePercents: [150, 200], maxPercent: 300 })).toBe(30);
  });

  it('reste sous le plafond quand le produit lui est inférieur d’un cheveu', () => {
    // 299 % de 100 XP : pas ramené à 300 %
    expect(effectiveXp(100, { rolePercents: [299], maxPercent: MAX })).toBe(299);
  });

  it('applique un malus : 50 % de 20 XP = 10 XP', () => {
    expect(effectiveXp(20, { rolePercents: [50], maxPercent: MAX })).toBe(10);
  });

  it('ne descend jamais sous 10 % du gain de base', () => {
    // 50 % × 10 % × 10 % = 0,5 % : ramené à 10 %
    expect(effectiveXp(200, { rolePercents: [50, 10], placePercent: 10, maxPercent: MAX })).toBe(
      20,
    );
  });

  it('accepte un produit qui atteint exactement le plancher', () => {
    expect(effectiveXp(100, { rolePercents: [10], maxPercent: MAX })).toBe(10);
  });

  it('donne au moins 1 XP, même quand 10 % de la base ne fait pas 1', () => {
    expect(effectiveXp(3, { rolePercents: [10], maxPercent: MAX })).toBe(1);
    expect(effectiveXp(1, { rolePercents: [50], maxPercent: MAX })).toBe(1);
  });

  it('arrondit à l’entier le plus proche, la moitié vers le haut', () => {
    // 15 × 150 % = 22,5 → 23 ; 15 × 149 % = 22,35 → 22 ; 15 × 151 % = 22,65 → 23
    expect(effectiveXp(15, { rolePercents: [150], maxPercent: MAX })).toBe(23);
    expect(effectiveXp(15, { rolePercents: [149], maxPercent: MAX })).toBe(22);
    expect(effectiveXp(15, { rolePercents: [151], maxPercent: MAX })).toBe(23);
  });

  it('n’arrondit qu’une fois, à la fin, sans dérive de flottants', () => {
    // 110 % × 110 % × 110 % = 133,1 % ; 1000 XP → 1331. Arrondir à chaque étape donnerait autre chose.
    expect(effectiveXp(1000, { rolePercents: [110, 110, 110], maxPercent: 1000 })).toBe(1331);
    // 3 × 33 % : 100 × 0,33 × 0,33 × 0,33 = 3,5937 % → plancher 10 % → 10
    expect(effectiveXp(100, { rolePercents: [33, 33, 33], maxPercent: MAX })).toBe(10);
    // 0,1 + 0,2 style : 70 % × 30 % = 21 % exactement, 100 XP → 21
    expect(effectiveXp(100, { rolePercents: [70, 30], maxPercent: MAX })).toBe(21);
  });

  it('respecte un plafond de 100 % : aucun bonus possible, un malus reste possible', () => {
    expect(effectiveXp(20, { rolePercents: [300], placePercent: 200, maxPercent: 100 })).toBe(20);
    expect(effectiveXp(20, { rolePercents: [50], maxPercent: 100 })).toBe(10);
  });

  it('respecte un plafond de 1000 %', () => {
    expect(effectiveXp(10, { rolePercents: [500, 500], maxPercent: 1000 })).toBe(100);
    expect(effectiveXp(10, { rolePercents: [500, 500], maxPercent: 300 })).toBe(30);
  });

  it('ne déborde pas avec beaucoup de rôles', () => {
    const many = Array.from({ length: 50 }, () => 500);
    expect(effectiveXp(10, { rolePercents: many, placePercent: 500, maxPercent: 1000 })).toBe(100);
    const tiny = Array.from({ length: 50 }, () => 10);
    expect(effectiveXp(100, { rolePercents: tiny, maxPercent: 1000 })).toBe(10);
  });

  it('rend 0 pour une base de 0 : il n’y a rien à multiplier', () => {
    expect(effectiveXp(0, { rolePercents: [], maxPercent: MAX })).toBe(0);
    expect(effectiveXp(0, { rolePercents: [300], maxPercent: MAX })).toBe(0);
  });
});

describe('resolveXpPercents', () => {
  const rules: XpMultiplierRule[] = [
    { kind: 'ROLE', targetId: 'r1', percent: 150 },
    { kind: 'ROLE', targetId: 'r2', percent: 200 },
    { kind: 'ROLE', targetId: 'r3', percent: 50 },
    { kind: 'CHANNEL', targetId: 'c1', percent: 120 },
    { kind: 'CHANNEL', targetId: 'p1', percent: 130 },
    { kind: 'CATEGORY', targetId: 'k1', percent: 110 },
  ];

  it('garde les rôles du membre qui ont un bonus, les autres sont ignorés', () => {
    const result = resolveXpPercents(rules, { roleIds: ['r1', 'r3', 'autre'], channelId: 'x' });
    expect(result.rolePercents).toEqual([150, 50]);
    expect(result.placePercent).toBeNull();
  });

  it('rend des listes vides sans aucun multiplicateur', () => {
    expect(resolveXpPercents([], { roleIds: ['r1'], channelId: 'c1', categoryId: 'k1' })).toEqual({
      rolePercents: [],
      placePercent: null,
    });
  });

  it('prend le bonus du salon avant celui de la catégorie', () => {
    const result = resolveXpPercents(rules, { roleIds: [], channelId: 'c1', categoryId: 'k1' });
    expect(result.placePercent).toBe(120);
  });

  it('prend le bonus de la catégorie quand le salon n’en a pas', () => {
    const result = resolveXpPercents(rules, { roleIds: [], channelId: 'x', categoryId: 'k1' });
    expect(result.placePercent).toBe(110);
  });

  it('un fil hérite du salon parent, puis de la catégorie du parent', () => {
    expect(
      resolveXpPercents(rules, {
        roleIds: [],
        channelId: 'fil',
        parentChannelId: 'p1',
        categoryId: 'k1',
      }).placePercent,
    ).toBe(130);
    expect(
      resolveXpPercents(rules, {
        roleIds: [],
        channelId: 'fil',
        parentChannelId: 'inconnu',
        categoryId: 'k1',
      }).placePercent,
    ).toBe(110);
  });

  it('n’applique qu’un seul pourcentage de lieu, jamais salon × catégorie', () => {
    const result = resolveXpPercents(rules, {
      roleIds: [],
      channelId: 'fil',
      parentChannelId: 'p1',
      categoryId: 'k1',
    });
    expect(result.placePercent).toBe(130);
  });

  it('ne confond pas les genres : un identifiant de rôle ne vaut pas un salon', () => {
    const result = resolveXpPercents(rules, { roleIds: [], channelId: 'r1', categoryId: 'r2' });
    expect(result.placePercent).toBeNull();
    const asRole = resolveXpPercents(rules, { roleIds: ['c1', 'k1'], channelId: 'x' });
    expect(asRole.rolePercents).toEqual([]);
  });
});
