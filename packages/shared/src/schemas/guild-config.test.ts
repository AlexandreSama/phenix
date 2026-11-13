import { describe, expect, it } from 'vitest';
import { generalConfigPatchSchema, generalConfigSchema } from './guild-config.js';

describe('generalConfigSchema', () => {
  const general = {
    timezone: 'Europe/Paris',
    modLogChannelId: null,
    announceChannelId: '123456789012345678',
    staffRoleIds: [],
    caseRetentionMonths: 12,
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

  it('accepte 6, 12, 24 mois ou null (jamais) pour la rétention des sanctions', () => {
    for (const months of [6, 12, 24, null]) {
      expect(
        generalConfigSchema.safeParse({ ...general, caseRetentionMonths: months }).success,
      ).toBe(true);
    }
  });

  it('refuse toute autre durée de rétention', () => {
    for (const months of [0, 1, 18, 36, -12, 12.5, '12']) {
      expect(
        generalConfigSchema.safeParse({ ...general, caseRetentionMonths: months }).success,
      ).toBe(false);
    }
  });

  it('accepte une modification sans caseRetentionMonths', () => {
    expect(generalConfigPatchSchema.safeParse({ timezone: 'Europe/Paris' }).success).toBe(true);
    expect(generalConfigPatchSchema.safeParse({ caseRetentionMonths: 18 }).success).toBe(false);
  });
});
