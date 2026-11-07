import { describe, expect, it } from 'vitest';
import { guildConfigSchema } from './guild-config.js';

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
});
