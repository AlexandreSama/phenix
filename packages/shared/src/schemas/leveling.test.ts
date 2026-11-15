import { describe, expect, it } from 'vitest';
import {
  MAX_XP_EXCLUDED_CHANNELS,
  leaderboardQuerySchema,
  levelingConfigPatchSchema,
  levelingConfigSchema,
} from './leveling.js';

const valid = {
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
  xpExcludedChannelIds: [],
};

/** Un identifiant Discord factice mais valide (18 chiffres). */
const id = (n: number) => `1000000000000000${String(n).padStart(2, '0')}`;

describe('levelingConfigSchema', () => {
  it('accepte une config valide', () => {
    expect(levelingConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('refuse un minimum d’XP supérieur au maximum, sur le champ minimum', () => {
    const result = levelingConfigSchema.safeParse({ ...valid, xpMin: 30, xpMax: 20 });
    expect(result.error?.issues[0]?.path).toEqual(['xpMin']);
  });

  it('refuse un délai de plus d’une heure', () => {
    const result = levelingConfigSchema.safeParse({ ...valid, xpCooldownSec: 7200 });
    expect(result.error?.issues[0]?.message).toBe('Une heure au plus');
  });
});

describe('levelingConfigSchema : salons exclus du gain d’XP', () => {
  it('limite à 50 salons, valeur exportée pour l’API et le tableau de bord', () => {
    expect(MAX_XP_EXCLUDED_CHANNELS).toBe(50);
  });

  it('accepte de 0 à 50 identifiants', () => {
    const fifty = Array.from({ length: MAX_XP_EXCLUDED_CHANNELS }, (_, n) => id(n));
    for (const xpExcludedChannelIds of [[], [id(1)], fifty]) {
      expect(levelingConfigSchema.safeParse({ ...valid, xpExcludedChannelIds }).success).toBe(true);
    }
  });

  it('refuse un identifiant invalide', () => {
    const result = levelingConfigSchema.safeParse({ ...valid, xpExcludedChannelIds: ['abc'] });
    expect(result.error?.issues[0]?.message).toBe('ID Discord invalide');
  });

  it('refuse un doublon', () => {
    const result = levelingConfigSchema.safeParse({
      ...valid,
      xpExcludedChannelIds: [id(1), id(2), id(1)],
    });
    expect(result.error?.issues[0]?.message).toBe('Un salon ne peut figurer qu’une fois');
  });

  it('refuse 51 entrées', () => {
    const result = levelingConfigSchema.safeParse({
      ...valid,
      xpExcludedChannelIds: Array.from({ length: MAX_XP_EXCLUDED_CHANNELS + 1 }, (_, n) => id(n)),
    });
    expect(result.error?.issues[0]?.message).toBe('50 salons au plus');
  });

  it('reste facultatif dans une modification partielle', () => {
    expect(levelingConfigPatchSchema.safeParse({ xpMin: 90 }).success).toBe(true);
    expect(levelingConfigPatchSchema.safeParse({ xpExcludedChannelIds: [id(1)] }).success).toBe(
      true,
    );
  });
});

describe('levelingConfigPatchSchema', () => {
  it('accepte un seul champ', () => {
    expect(levelingConfigPatchSchema.safeParse({ xpMin: 90 }).success).toBe(true);
  });

  it('vérifie min ≤ max quand les deux sont envoyés', () => {
    expect(levelingConfigPatchSchema.safeParse({ xpMin: 30, xpMax: 20 }).success).toBe(false);
  });
});

describe('leaderboardQuerySchema', () => {
  it('lit la page depuis la chaîne de l’URL, 1 par défaut', () => {
    expect(leaderboardQuerySchema.parse({ page: '3' })).toEqual({ page: 3 });
    expect(leaderboardQuerySchema.parse({})).toEqual({ page: 1 });
    expect(leaderboardQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});
