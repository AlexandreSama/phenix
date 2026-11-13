import { describe, expect, it } from 'vitest';
import { caseRetentionCutoff } from './case-retention.js';

describe('caseRetentionCutoff', () => {
  it('recule de mois calendaires en UTC et garde l’heure', () => {
    expect(caseRetentionCutoff(12, new Date('2026-11-13T12:34:56.789Z'))).toEqual(
      new Date('2025-11-13T12:34:56.789Z'),
    );
  });

  it('traverse plusieurs années', () => {
    expect(caseRetentionCutoff(24, new Date('2026-01-15T00:00:00Z'))).toEqual(
      new Date('2024-01-15T00:00:00Z'),
    );
  });

  it('31 mai − 6 mois → 30 novembre : le jour est borné au dernier jour du mois d’arrivée', () => {
    expect(caseRetentionCutoff(6, new Date('2026-05-31T10:00:00Z'))).toEqual(
      new Date('2025-11-30T10:00:00Z'),
    );
  });

  it('29 février 2028 − 12 mois → 28 février 2027', () => {
    expect(caseRetentionCutoff(12, new Date('2028-02-29T08:00:00Z'))).toEqual(
      new Date('2027-02-28T08:00:00Z'),
    );
  });

  it('31 mars − 1 mois → 28 février, ou 29 une année bissextile', () => {
    expect(caseRetentionCutoff(1, new Date('2027-03-31T00:00:00Z'))).toEqual(
      new Date('2027-02-28T00:00:00Z'),
    );
    expect(caseRetentionCutoff(1, new Date('2028-03-31T00:00:00Z'))).toEqual(
      new Date('2028-02-29T00:00:00Z'),
    );
  });

  it('ne modifie pas la date reçue', () => {
    const now = new Date('2026-11-13T12:00:00Z');

    caseRetentionCutoff(6, now);

    expect(now).toEqual(new Date('2026-11-13T12:00:00Z'));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse %d mois : une purge ne doit jamais viser des sanctions closes à l’instant',
    (months) => {
      expect(() => caseRetentionCutoff(months, new Date())).toThrow(RangeError);
    },
  );

  it('refuse une date `now` invalide : une limite « Invalid Date » ne doit jamais atteindre la base', () => {
    expect(() => caseRetentionCutoff(12, new Date('invalide'))).toThrow(RangeError);
  });
});
