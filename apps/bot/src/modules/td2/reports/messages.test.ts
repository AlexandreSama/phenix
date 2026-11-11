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
  it('non vérifié : le pseudo en titre, le statut en en-tête, les trois décisions, les captures jointes', () => {
    const message = reportStaffMessage(td2Report(), [
      { key: 'k', fileName: 'preuve-1.png', bytes: Uint8Array.from([1, 2]) },
    ]);
    const embed = message.embeds[0]?.toJSON();

    expect(embed?.author?.name).toBe('⏳ NON VÉRIFIÉ · SIGNALEMENT #7');
    expect(embed?.title).toBe('Agent47');
    expect(embed?.description).toContain('-# PlayStation');
    expect(embed?.fields?.map((field) => field.name)).toEqual([
      'Motif',
      'Preuves',
      'Signalé par',
      'Détails',
    ]);
    expect(embed?.fields?.slice(0, 3).map((field) => field.inline)).toEqual([true, true, true]);
    expect(embed?.fields?.[0]?.value).toBe('🎯 Triche');
    expect(embed?.fields?.[1]?.value).toBe('📎 1 capture');
    expect(embed?.footer?.text).toBe('Captures jointes sous ce message');
    expect(buttons(message)).toEqual([
      ['Examiner', false],
      ['Confirmer', false],
      ['Rejeter', false],
    ]);
    expect(message.files?.map((file) => file.name)).toEqual(['preuve-1.png']);
  });

  it('le signalant : la mention, puis la date relative en sous-texte', () => {
    const value = reportStaffMessage(td2Report()).embeds[0]?.toJSON().fields?.[2]?.value;

    expect(value).toMatch(/^<@500000000000000001>\n-# <t:\d+:R>$/);
  });

  it('les détails du membre sont en citation, une par ligne', () => {
    const fields = reportStaffMessage(
      td2Report({ details: 'Première ligne\nSeconde ligne' }),
    ).embeds[0]?.toJSON().fields;

    expect(fields?.[3]?.value).toBe('> Première ligne\n> Seconde ligne');
  });

  it.each([
    ['PENDING', '**⏳ Reçu** ─ 🔎 Examen ─ ⚖️ Décision'],
    ['IN_REVIEW', '⏳ Reçu ─ **🔎 Examen** ─ ⚖️ Décision'],
    ['CONFIRMED', '⏳ Reçu ─ 🔎 Examen ─ **⚖️ Décision**'],
    ['REJECTED', '⏳ Reçu ─ 🔎 Examen ─ **⚖️ Décision**'],
  ] as const)('la frise %s met en gras l’étape que le statut stocké atteint', (status, frise) => {
    const embed = reportStaffMessage(td2Report({ status })).embeds[0]?.toJSON();

    expect(embed?.description).toContain(frise);
  });

  it('sans capture : le dit exactement, et « Confirmer » est bien grisé', () => {
    const message = reportStaffMessage(td2Report({ evidenceKeys: [] }));
    const embed = message.embeds[0]?.toJSON();

    expect(embed?.fields?.[1]?.value).toBe('📎 Aucune, confirmation impossible');
    expect(embed?.footer?.text).toBeUndefined();
    expect(buttons(message)).toContainEqual(['Confirmer', true]);
  });

  it('rejeté : on peut le rouvrir', () => {
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
  it('annonce le joueur et le serveur en une phrase, jamais l’auteur', () => {
    const embed = reportFeedMessage(td2Report({ status: 'CONFIRMED' })).embeds[0]?.toJSON();
    const text = JSON.stringify(embed);

    expect(embed?.author?.name).toBe('⚠️ ALERTE RÉSEAU · CONFIRMÉ');
    expect(embed?.title).toBe('Agent47');
    expect(embed?.description).toContain('Signalé pour **Triche** sur **PlayStation**.');
    expect(embed?.description).toContain('-# Confirmé par le staff de Phenix · <t:');
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['Détails', '> Tir à travers les murs'],
    ]);
    expect(embed?.footer?.text).toBe("Signalement #7 · preuves vérifiées par le staff d'origine");
    expect(text).not.toContain('500000000000000001');
  });

  it('sans détails : pas de champ', () => {
    const embed = reportFeedMessage(td2Report({ details: null })).embeds[0]?.toJSON();

    expect(embed?.fields ?? []).toEqual([]);
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
  const player = { playerName: 'Agent47', platform: 'PSN' } as const;

  it('au moins un confirmé : 🔴 À surveiller, rouge, confirmés d’abord', () => {
    const embed = playerReportsMessage(player, [
      { ...entry, id: 8, own: true, reporterId: '5', status: 'PENDING', guildName: 'Ici' },
      { ...entry, details: 'Aimbot\névident' },
    ]).embeds[0]?.toJSON();

    expect(embed?.author?.name).toBe('🔍 HISTORIQUE RÉSEAU');
    expect(embed?.title).toBe('Agent47 · PlayStation');
    expect(embed?.color).toBe(0xed4245);
    expect(embed?.description).toContain('### 🔴 À surveiller');
    expect(embed?.description).toContain('`1 confirmé` `1 non vérifié`');
    expect(embed?.fields?.[0]?.name).toBe('✅ Confirmé · Triche');
    expect(embed?.fields?.[0]?.value).toMatch(/^-# Phenix · <t:\d+:d> · #7\n> Aimbot\n> évident$/);
    expect(embed?.fields?.[1]?.name).toBe('⏳ Non vérifié · Triche');
    expect(embed?.fields?.[1]?.value).toMatch(/^-# Ce serveur · <@5> · <t:\d+:d> · #8$/);
  });

  it('que du non vérifié : 🟡 À vérifier, jaune, et la mise en garde', () => {
    const embed = playerReportsMessage(player, [
      { ...entry, status: 'PENDING' },
      { ...entry, id: 9, status: 'IN_REVIEW', own: true },
    ]).embeds[0]?.toJSON();

    expect(embed?.color).toBe(0xffc500);
    expect(embed?.description).toContain('### 🟡 À vérifier');
    expect(embed?.description).toContain('`2 non vérifiés`');
    expect(embed?.description).toContain(
      '-# Un signalement non vérifié n’a pas encore été examiné',
    );
  });

  it('aucun signalement : 🟢 Rien à signaler, vert', () => {
    const embed = playerReportsMessage(
      { playerName: 'Inconnu', platform: 'XBL' },
      [],
    ).embeds[0]?.toJSON();

    expect(embed?.color).toBe(0x57f287);
    expect(embed?.description).toContain('### 🟢 Rien à signaler');
    expect(embed?.description).toContain('Aucun signalement pour ce joueur sur le réseau.');
  });

  it('que des rejetés de ce serveur : 🟢, et ils restent listés', () => {
    const embed = playerReportsMessage(player, [
      { ...entry, status: 'REJECTED', own: true, reporterId: '5' },
    ]).embeds[0]?.toJSON();

    expect(embed?.description).toContain('### 🟢 Rien à signaler');
    expect(embed?.description).toContain('`1 rejeté`');
    expect(embed?.fields).toHaveLength(1);
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
