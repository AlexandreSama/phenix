import { describe, expect, it } from 'vitest';
import { LEVELING_DEFAULTS } from '../levels.js';
import { XP_MULTIPLIER_MAX_PERCENT, XP_MULTIPLIER_MIN_PERCENT } from '../xp-multipliers.js';
import {
  MAX_XP_EXCLUDED_CHANNELS,
  MAX_XP_MULTIPLIERS,
  leaderboardQuerySchema,
  levelingConfigPatchSchema,
  levelingConfigSchema,
  xpMultiplierSchema,
  xpMultipliersSchema,
} from './leveling.js';

const valid = {
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
  xpExcludedChannelIds: [],
  xpMultiplierMaxPercent: 300,
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

describe('xpMultiplierSchema', () => {
  const entry = { kind: 'ROLE', targetId: id(1), percent: 150 };

  it('accepte un rôle, un salon ou une catégorie', () => {
    for (const kind of ['ROLE', 'CHANNEL', 'CATEGORY']) {
      expect(xpMultiplierSchema.safeParse({ ...entry, kind }).success).toBe(true);
    }
  });

  it('refuse un genre inconnu', () => {
    const result = xpMultiplierSchema.safeParse({ ...entry, kind: 'USER' });
    expect(result.error?.issues[0]?.message).toBe('Type de bonus inconnu');
  });

  it('refuse un identifiant qui n’est pas un snowflake', () => {
    const result = xpMultiplierSchema.safeParse({ ...entry, targetId: 'abc' });
    expect(result.error?.issues[0]?.message).toBe('ID Discord invalide');
  });

  it('exporte les bornes : 10 à 500 %', () => {
    expect(XP_MULTIPLIER_MIN_PERCENT).toBe(10);
    expect(XP_MULTIPLIER_MAX_PERCENT).toBe(500);
  });

  it('accepte les bornes 10 et 500, refuse 9 et 501', () => {
    expect(xpMultiplierSchema.safeParse({ ...entry, percent: 10 }).success).toBe(true);
    expect(xpMultiplierSchema.safeParse({ ...entry, percent: 500 }).success).toBe(true);
    expect(xpMultiplierSchema.safeParse({ ...entry, percent: 9 }).error?.issues[0]?.message).toBe(
      '10 % au moins',
    );
    expect(xpMultiplierSchema.safeParse({ ...entry, percent: 501 }).error?.issues[0]?.message).toBe(
      '500 % au plus',
    );
  });

  it('refuse un pourcentage décimal ou non numérique', () => {
    expect(
      xpMultiplierSchema.safeParse({ ...entry, percent: 150.5 }).error?.issues[0]?.message,
    ).toBe('Nombre entier attendu');
    expect(xpMultiplierSchema.safeParse({ ...entry, percent: 'x' }).error?.issues[0]?.message).toBe(
      'Entre un nombre',
    );
  });
});

const entry = (n: number) => ({ kind: 'CHANNEL', targetId: id(n), percent: 120 });

describe('xpMultipliersSchema', () => {
  it('limite à 50 bonus, valeur exportée pour l’API et le tableau de bord', () => {
    expect(MAX_XP_MULTIPLIERS).toBe(50);
  });

  it('accepte de 0 à 50 bonus', () => {
    const fifty = Array.from({ length: MAX_XP_MULTIPLIERS }, (_, n) => entry(n));
    for (const list of [[], [entry(1)], fifty]) {
      expect(xpMultipliersSchema.safeParse(list).success).toBe(true);
    }
  });

  it('refuse 51 bonus', () => {
    const result = xpMultipliersSchema.safeParse(
      Array.from({ length: MAX_XP_MULTIPLIERS + 1 }, (_, n) => entry(n)),
    );
    expect(result.error?.issues[0]?.message).toBe('50 bonus au plus');
  });

  it('refuse deux bonus sur le même rôle, salon ou catégorie', () => {
    const result = xpMultipliersSchema.safeParse([entry(1), entry(2), entry(1)]);
    expect(result.error?.issues[0]?.message).toBe(
      'Un rôle, un salon ou une catégorie ne peut avoir qu’un seul bonus',
    );
  });
});

describe('levelingConfigSchema : plafond du bonus d’XP', () => {
  it('vaut 300 % par défaut', () => {
    expect(LEVELING_DEFAULTS.xpMultiplierMaxPercent).toBe(300);
  });

  it('accepte de 100 à 1000', () => {
    for (const xpMultiplierMaxPercent of [100, 300, 1000]) {
      expect(levelingConfigSchema.safeParse({ ...valid, xpMultiplierMaxPercent }).success).toBe(
        true,
      );
    }
  });

  it('refuse 99, 1001 et un décimal', () => {
    const messages = [99, 1001, 250.5].map(
      (xpMultiplierMaxPercent) =>
        levelingConfigSchema.safeParse({ ...valid, xpMultiplierMaxPercent }).error?.issues[0]
          ?.message,
    );
    expect(messages).toEqual(['100 % au moins', '1000 % au plus', 'Nombre entier attendu']);
  });

  it('est obligatoire dans la config complète', () => {
    const { xpMultiplierMaxPercent: _omitted, ...without } = valid;
    expect(levelingConfigSchema.safeParse(without).success).toBe(false);
  });

  it('reste facultatif dans une modification partielle', () => {
    expect(levelingConfigPatchSchema.safeParse({ xpMin: 90 }).success).toBe(true);
    expect(levelingConfigPatchSchema.safeParse({ xpMultiplierMaxPercent: 500 }).success).toBe(true);
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
