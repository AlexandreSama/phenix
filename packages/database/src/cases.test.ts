import { describe, expect, it } from 'vitest';
import { activeCaseWhere, caseSearchWhere, caseStatus, caseStatusWhere } from './cases.js';

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

describe('caseStatusWhere', () => {
  const now = new Date('2026-11-07T12:00:00Z');

  it('« active » : ni levée, ni mute échu (avertissement, ban et mute en cours)', () => {
    expect(caseStatusWhere('active', now)).toEqual({
      revokedAt: null,
      OR: [{ type: 'WARN' }, { type: 'BAN' }, { type: 'MUTE', expiresAt: { gt: now } }],
    });
  });

  it('« revoked » : toute sanction levée', () => {
    expect(caseStatusWhere('revoked', now)).toEqual({ revokedAt: { not: null } });
  });

  it('« ended » : un mute non levé dont la date de fin est passée', () => {
    expect(caseStatusWhere('ended', now)).toEqual({
      revokedAt: null,
      type: 'MUTE',
      expiresAt: { lte: now },
    });
  });
});

describe('caseSearchWhere', () => {
  it('ne filtre rien sans texte ou avec des espaces seuls', () => {
    expect(caseSearchWhere(undefined)).toBeUndefined();
    expect(caseSearchWhere('   ')).toBeUndefined();
  });

  it('un nombre court, avec ou sans #, est un numéro de sanction', () => {
    expect(caseSearchWhere('12')).toEqual({ number: 12 });
    expect(caseSearchWhere(' #12 ')).toEqual({ number: 12 });
  });

  it('un identifiant Discord (17 à 20 chiffres) cherche la cible ou le modérateur', () => {
    const id = '222222222222222222';
    expect(caseSearchWhere(id)).toEqual({ OR: [{ targetId: id }, { moderatorId: id }] });
  });

  it('tout autre texte cherche dans la raison, sans tenir compte de la casse', () => {
    expect(caseSearchWhere('Spam')).toEqual({ reason: { contains: 'Spam', mode: 'insensitive' } });
  });

  it('échappe %, _ et \\ : ils ne sont pas des jokers du LIKE de PostgreSQL', () => {
    expect(caseSearchWhere('100%_a\\b')).toEqual({
      reason: { contains: '100\\%\\_a\\\\b', mode: 'insensitive' },
    });
  });

  it('un nombre de 10 à 16 chiffres n’est ni un numéro ni un identifiant : c’est du texte', () => {
    expect(caseSearchWhere('1234567890')).toEqual({
      reason: { contains: '1234567890', mode: 'insensitive' },
    });
  });
});

describe('caseSearchWhere avec des identifiants (pseudos trouvés)', () => {
  const A = '111111111111111111';
  const B = '222222222222222222';

  it('cherche dans la raison OU parmi les cibles et les modérateurs trouvés', () => {
    expect(caseSearchWhere('ali', [A, B])).toEqual({
      OR: [
        { reason: { contains: 'ali', mode: 'insensitive' } },
        { targetId: { in: [A, B] } },
        { moderatorId: { in: [A, B] } },
      ],
    });
  });

  it('sans identifiant (liste vide ou absente), garde la recherche dans la raison seule', () => {
    const reasonOnly = { reason: { contains: 'ali', mode: 'insensitive' } };
    expect(caseSearchWhere('ali', [])).toEqual(reasonOnly);
    expect(caseSearchWhere('ali', undefined)).toEqual(reasonOnly);
  });

  it('ignore les identifiants quand le texte est un numéro ou un identifiant Discord', () => {
    expect(caseSearchWhere('#12', [A])).toEqual({ number: 12 });
    expect(caseSearchWhere(B, [A])).toEqual({ OR: [{ targetId: B }, { moderatorId: B }] });
  });

  it('ne filtre rien sans texte, même avec des identifiants', () => {
    expect(caseSearchWhere('  ', [A])).toBeUndefined();
  });

  it('dédoublonne les identifiants et en garde 50 au plus', () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(10n ** 17n + BigInt(i)));

    const where = caseSearchWhere('ali', [A, A, ...ids]);

    const expected = [A, ...ids].slice(0, 50);
    expect(where).toEqual({
      OR: [
        { reason: { contains: 'ali', mode: 'insensitive' } },
        { targetId: { in: expected } },
        { moderatorId: { in: expected } },
      ],
    });
  });
});

describe('caseStatus', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  const past = new Date('2026-11-07T11:00:00Z');
  const future = new Date('2026-11-07T13:00:00Z');
  const base = { revokedAt: null, expiresAt: null };

  it.each([
    ['un avertissement', { type: 'WARN' as const, ...base }, 'active'],
    ['un ban, même échu', { type: 'BAN' as const, revokedAt: null, expiresAt: past }, 'active'],
    ['un mute en cours', { type: 'MUTE' as const, revokedAt: null, expiresAt: future }, 'active'],
    ['un mute échu', { type: 'MUTE' as const, revokedAt: null, expiresAt: past }, 'ended'],
    ['une sanction levée', { type: 'WARN' as const, revokedAt: past, expiresAt: null }, 'revoked'],
    [
      'un mute levé avant son terme',
      { type: 'MUTE' as const, revokedAt: past, expiresAt: future },
      'revoked',
    ],
    [
      'une sourdine sans échéance (jamais créée) : dans aucun statut, comme caseStatusWhere',
      { type: 'MUTE' as const, ...base },
      null,
    ],
    [
      'un mute qui se termine pile maintenant, comme caseStatusWhere (lte)',
      { type: 'MUTE' as const, revokedAt: null, expiresAt: now },
      'ended',
    ],
    ['une expulsion', { type: 'KICK' as const, ...base }, null],
    ['une fin de sourdine', { type: 'UNMUTE' as const, ...base }, null],
    ['un débannissement', { type: 'UNBAN' as const, ...base }, null],
  ])('%s', (_nom, sanction, expected) => {
    expect(caseStatus(sanction, now)).toBe(expected);
  });
});
