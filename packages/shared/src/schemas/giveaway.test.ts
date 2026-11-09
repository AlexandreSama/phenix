import { describe, expect, it } from 'vitest';
import { giveawayEndProblem, giveawayInputSchema, giveawayListQuerySchema } from './giveaways.js';

const valid = {
  channelId: '100000000000000001',
  prize: 'Nitro 1 mois',
  winnersCount: 2,
  endsAt: '2026-11-10T20:00:00.000Z',
  requiredRoleId: null,
};

describe('giveawayInputSchema', () => {
  it('accepte un giveaway valide, avec ou sans rôle requis', () => {
    expect(giveawayInputSchema.safeParse(valid).success).toBe(true);
    expect(
      giveawayInputSchema.safeParse({ ...valid, requiredRoleId: '200000000000000001' }).success,
    ).toBe(true);
  });

  it('explique chaque champ refusé', () => {
    const result = giveawayInputSchema.safeParse({
      ...valid,
      channelId: '',
      prize: '  ',
      winnersCount: 0,
      endsAt: 'demain',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Choisis un salon',
      'Le lot est obligatoire',
      'Un gagnant au moins',
      'Date de fin invalide',
    ]);
  });
});

describe('giveawayEndProblem', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('accepte une fin entre une minute et trente jours', () => {
    expect(giveawayEndProblem(new Date('2026-11-09T12:01:00Z'), now)).toBe(null);
    expect(giveawayEndProblem(new Date('2026-12-09T12:00:00Z'), now)).toBe(null);
  });

  it('refuse une fin passée, trop proche ou trop lointaine', () => {
    expect(giveawayEndProblem(new Date('2026-11-09T11:00:00Z'), now)).toBe(
      'La fin doit être dans une minute au moins',
    );
    expect(giveawayEndProblem(new Date('2026-11-09T12:00:30Z'), now)).toBe(
      'La fin doit être dans une minute au moins',
    );
    expect(giveawayEndProblem(new Date('2026-12-10T12:00:00Z'), now)).toBe('Trente jours au plus');
    expect(giveawayEndProblem(new Date('nimporte'), now)).toBe('Date de fin invalide');
  });
});

describe('giveawayListQuerySchema', () => {
  it('montre les giveaways en cours, page 1, par défaut', () => {
    expect(giveawayListQuerySchema.parse({})).toEqual({ status: 'active', page: 1 });
  });
});
