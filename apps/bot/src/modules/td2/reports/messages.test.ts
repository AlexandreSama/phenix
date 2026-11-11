import { describe, expect, it } from 'vitest';
import { td2Report } from '../test-fixtures.js';
import { canReviewReports, canViewReports } from './access.js';
import { playerReportsMessage, reportFeedMessage, reportStaffMessage } from './messages.js';

const buttons = (message: ReturnType<typeof reportStaffMessage>) =>
  message.components.flatMap((row) =>
    row.components.map((button) => {
      const json = button.toJSON() as { label: string; disabled?: boolean };
      return [json.label, json.disabled ?? false];
    }),
  );

describe('le message du staff', () => {
  it('non vérifié : les trois décisions, et les captures jointes', () => {
    const message = reportStaffMessage(td2Report(), [
      { key: 'k', fileName: 'preuve-1.png', bytes: Uint8Array.from([1, 2]) },
    ]);
    const embed = message.embeds[0]?.toJSON();

    expect(embed?.title).toBe('⏳ Signalement #7 · Non vérifié');
    expect(embed?.description).toContain('**Agent47** · PlayStation');
    expect(embed?.fields?.map((field) => field.name)).toEqual([
      'Motif',
      'Signalé par',
      'Preuves',
      'Détails',
    ]);
    expect(buttons(message)).toEqual([
      ['Examiner', false],
      ['Confirmer', false],
      ['Rejeter', false],
    ]);
    expect(message.files?.map((file) => file.name)).toEqual(['preuve-1.png']);
  });

  it('sans capture, « Confirmer » est grisé ; rejeté, on peut le rouvrir', () => {
    expect(buttons(reportStaffMessage(td2Report({ evidenceKeys: [] })))).toContainEqual([
      'Confirmer',
      true,
    ]);
    expect(buttons(reportStaffMessage(td2Report({ status: 'REJECTED' })))).toEqual([
      ['Rouvrir', false],
      ['Confirmer', false],
      ['Rejeter', true],
    ]);
  });

  it('confirmé : plus de boutons, et le nom de qui a tranché', () => {
    const message = reportStaffMessage(
      td2Report({ status: 'CONFIRMED', reviewedById: '8', reviewedAt: new Date() }),
    );

    expect(message.components).toEqual([]);
    expect(message.embeds[0]?.toJSON().description).toContain('Examiné par <@8>');
  });
});

describe('le fil du réseau', () => {
  it('annonce le joueur et le serveur, jamais l’auteur', () => {
    const embed = reportFeedMessage(td2Report({ status: 'CONFIRMED' })).embeds[0]?.toJSON();
    const text = JSON.stringify(embed);

    expect(embed?.title).toBe('⚠️ Joueur signalé : Agent47');
    expect(text).toContain('le staff de Phenix');
    expect(text).not.toContain('500000000000000001');
  });
});

describe('/td2 signalements', () => {
  const entry = {
    id: 7,
    guildName: 'Phenix',
    own: false,
    reporterId: null,
    reason: 'CHEAT',
    details: null,
    status: 'CONFIRMED' as const,
    evidenceCount: 1,
    createdAt: new Date('2026-11-10T12:00:00Z'),
  };

  it('résume, puis détaille chaque signalement avec son serveur', () => {
    const embed = playerReportsMessage({ playerName: 'Agent47', platform: 'PSN' }, [
      entry,
      { ...entry, id: 8, own: true, reporterId: '5', status: 'PENDING', guildName: 'Ici' },
    ]).embeds[0]?.toJSON();

    expect(embed?.description).toContain('2 signalements, dont 1 confirmé');
    expect(embed?.fields?.[0]?.name).toBe('✅ Confirmé · Triche');
    expect(embed?.fields?.[0]?.value).toContain('Sur Phenix');
    expect(embed?.fields?.[1]?.value).toContain('Sur ce serveur, par <@5>');
  });

  it('aucun signalement : le dit', () => {
    expect(
      playerReportsMessage({ playerName: 'Inconnu', platform: 'XBL' }, []).embeds[0]?.toJSON()
        .description,
    ).toBe('Aucun signalement pour ce joueur sur le réseau.');
  });
});

const member = ({ admin = false, roles = [] as string[] } = {}) => ({
  permissions: { has: () => admin },
  roles: { cache: new Set(roles) },
});

describe('qui examine, qui consulte', () => {
  const settings = { staffRoleIds: ['1'], td2ReportViewerRoleIds: ['2'] };

  it('examinent : les admins et l’équipe ; consultent : eux, plus les rôles du site', () => {
    expect(canReviewReports(member({ admin: true }), settings)).toBe(true);
    expect(canReviewReports(member({ roles: ['1'] }), settings)).toBe(true);
    expect(canReviewReports(member({ roles: ['2'] }), settings)).toBe(false);
    expect(canViewReports(member({ roles: ['2'] }), settings)).toBe(true);
    expect(canViewReports(member(), null)).toBe(false);
  });
});
