import { describe, expect, it } from 'vitest';
import { generalConfigPatchSchema, generalConfigSchema } from './guild-config.js';

describe('generalConfigSchema', () => {
  const general = {
    timezone: 'Europe/Paris',
    modLogChannelId: null,
    announceChannelId: '123456789012345678',
    staffRoleIds: [],
  };

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
