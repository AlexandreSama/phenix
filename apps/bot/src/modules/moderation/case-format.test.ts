import { CaseType, type Case } from '@phenix/database';
import { describe, expect, it } from 'vitest';
import { CASE_COLORS, caseEmbed, caseLabel, caseLine, caseStatus } from './case-format.js';

const now = new Date('2026-11-07T12:00:00Z');
const hourAgo = new Date(now.getTime() - 3_600_000);
const inAnHour = new Date(now.getTime() + 3_600_000);

function sanction(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    guildId: '111111111111111111',
    number: 12,
    type: 'WARN',
    targetId: '222222222222222222',
    moderatorId: '333333333333333333',
    reason: 'Spam',
    expiresAt: null,
    revokedAt: null,
    revokedById: null,
    revokedVia: null,
    createdAt: hourAgo,
    ...overrides,
  };
}

describe('libellés et couleurs', () => {
  it('couvrent chaque type de sanction de la base', () => {
    for (const type of Object.values(CaseType)) {
      expect(caseLabel(type)).not.toBe('');
      expect(CASE_COLORS[type]).toBeDefined();
    }
  });
});

describe('caseStatus', () => {
  it('distingue active, levée, définitive et terminée', () => {
    expect(caseStatus(sanction(), now)).toBe('active');
    expect(caseStatus(sanction({ revokedAt: now }), now)).toBe('levée');
    expect(caseStatus(sanction({ type: 'BAN' }), now)).toBe('définitive');
    expect(caseStatus(sanction({ type: 'MUTE', expiresAt: hourAgo }), now)).toBe('terminée');
    expect(caseStatus(sanction({ type: 'KICK' }), now)).toBe('appliquée');
  });

  it('donne la date de fin d’une sanction en cours', () => {
    expect(caseStatus(sanction({ type: 'BAN', expiresAt: inAnHour }), now)).toMatch(
      /^jusqu'au <t:\d+:f>$/,
    );
  });
});

describe('caseLine et caseEmbed', () => {
  it('raccourcit une longue raison', () => {
    const line = caseLine(sanction({ reason: 'x'.repeat(200) }), now);
    expect(line).toContain('**#12** · Avertissement');
    expect(line.endsWith('…')).toBe(true);
  });

  it('ajoute la date de fin seulement si la sanction en a une', () => {
    expect(caseEmbed(sanction()).data.fields?.map((f) => f.name)).toEqual([
      'Membre',
      'Modérateur',
      'Raison',
    ]);
    expect(
      caseEmbed(sanction({ type: 'MUTE', expiresAt: inAnHour })).data.fields?.at(-1)?.name,
    ).toBe('Fin');
  });

  it('remplace une raison absente', () => {
    expect(caseEmbed(sanction({ reason: null })).data.fields?.[2]?.value).toBe(
      'Aucune raison fournie',
    );
  });
});
