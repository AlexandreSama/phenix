import { describe, expect, it } from 'vitest';
import { activeCaseWhere } from './cases.js';

describe('activeCaseWhere', () => {
  const now = new Date('2026-11-07T12:00:00Z');

  it('considère un mute actif seulement avant sa date de fin', () => {
    expect(activeCaseWhere('MUTE', now)).toEqual({
      type: 'MUTE',
      revokedAt: null,
      expiresAt: { gt: now },
    });
  });

  it('garde un ban actif tant qu’il n’est pas levé, même échu', () => {
    expect(activeCaseWhere('BAN', now)).toEqual({ type: 'BAN', revokedAt: null });
  });
});
