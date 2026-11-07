import { describe, expect, it } from 'vitest';
import {
  generalConfigPatchSchema,
  generalConfigSchema,
  guildConfigSchema,
} from './guild-config.js';

const valid = {
  timezone: 'Europe/Paris',
  modLogChannelId: '123456789012345678',
  staffRoleIds: ['223456789012345678'],
  announceChannelId: null,
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
};

describe('guildConfigSchema', () => {
  const general = {
    timezone: 'Europe/Paris',
    modLogChannelId: null,
    announceChannelId: '123456789012345678',
    staffRoleIds: [],
  };

  it('accepte une config valide', () => {
    expect(guildConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('refuse un ID Discord mal formé', () => {
    const result = guildConfigSchema.safeParse({ ...valid, modLogChannelId: 'abc' });
    expect(result.success).toBe(false);
  });

  it('refuse un minimum d’XP supérieur au maximum', () => {
    const result = guildConfigSchema.safeParse({ ...valid, xpMin: 30, xpMax: 20 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['xpMin']);
  });

  it('refuse un fuseau horaire inconnu', () => {
    expect(generalConfigSchema.safeParse(general).success).toBe(true);
    expect(generalConfigSchema.safeParse({ ...general, timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('accepte une modification partielle, mais pas un champ mal formé', () => {
    expect(generalConfigPatchSchema.safeParse({ modLogChannelId: null }).success).toBe(true);
    expect(generalConfigPatchSchema.safeParse({ staffRoleIds: ['abc'] }).success).toBe(false);
  });
});
