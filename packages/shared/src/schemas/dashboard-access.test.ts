import { describe, expect, it } from 'vitest';
import { guildDelegateInputSchema, memberSearchQuerySchema } from './dashboard-access.js';

describe('guildDelegateInputSchema', () => {
  it('garde les onglets connus, une fois chacun', () => {
    expect(guildDelegateInputSchema.parse({ modules: ['TD2', 'TICKETS', 'TD2'] })).toEqual({
      modules: ['TD2', 'TICKETS'],
    });
  });

  it('refuse une liste vide ou un onglet inconnu', () => {
    expect(guildDelegateInputSchema.safeParse({ modules: [] }).error?.issues[0]?.message).toBe(
      'Coche au moins un onglet',
    );
    expect(guildDelegateInputSchema.safeParse({ modules: ['ACCES'] }).success).toBe(false);
  });
});

describe('memberSearchQuerySchema', () => {
  it('veut au moins deux lettres, espaces rognés', () => {
    expect(memberSearchQuerySchema.parse({ q: '  fa ' })).toEqual({ q: 'fa' });
    expect(memberSearchQuerySchema.safeParse({ q: ' f ' }).error?.issues[0]?.message).toBe(
      'Deux lettres au moins',
    );
  });
});
