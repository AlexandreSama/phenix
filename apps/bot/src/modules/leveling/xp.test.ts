import { describe, expect, it } from 'vitest';
import { createCooldowns, levelingSettings, randomXp } from './xp.js';

describe('randomXp', () => {
  it('reste entre min et max, bornes comprises', () => {
    expect(randomXp(15, 25, () => 0)).toBe(15);
    expect(randomXp(15, 25, () => 0.999_999)).toBe(25);
    expect(randomXp(10, 10, () => 0.5)).toBe(10);
  });
});

describe('createCooldowns', () => {
  it('bloque le même membre pendant le délai, pas les autres', () => {
    let clock = 0;
    const cooldowns = createCooldowns(() => clock);

    expect(cooldowns.take('g:1', 60_000)).toBe(true);
    expect(cooldowns.take('g:1', 60_000)).toBe(false);
    expect(cooldowns.take('g:2', 60_000)).toBe(true);

    clock = 60_000;
    expect(cooldowns.take('g:1', 60_000)).toBe(true);
  });

  it('oublie les délais échus quand la liste grossit', () => {
    let clock = 0;
    const cooldowns = createCooldowns(() => clock, 3);
    for (const key of ['a', 'b', 'c']) cooldowns.take(key, 1_000);

    clock = 2_000;
    cooldowns.take('d', 1_000);

    expect(cooldowns.size).toBe(1);
  });
});

describe('levelingSettings', () => {
  it('prend les valeurs par défaut pour un serveur sans config', () => {
    expect(levelingSettings(null)).toMatchObject({ xpEnabled: true, xpMin: 15, xpMax: 25 });
  });
});
