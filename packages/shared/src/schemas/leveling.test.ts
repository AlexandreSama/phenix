import { describe, expect, it } from 'vitest';
import {
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
};

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
