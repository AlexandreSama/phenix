import { describe, expect, it } from 'vitest';
import { CASE_STATUS_LABELS, DASHBOARD_MODULE_LABELS, DASHBOARD_MODULES } from '../constants.js';
import { CASE_PAGE_SIZE, caseListQuerySchema, caseRevokeSchema } from './moderation.js';

const ID = '222222222222222222';

describe('onglet Modération', () => {
  it('est un onglet délégable', () => {
    expect(DASHBOARD_MODULES).toContain('MODERATION');
    expect(DASHBOARD_MODULE_LABELS).toMatchObject({ MODERATION: 'Modération' });
  });

  it('a un libellé pour chaque statut (« levée », comme le bot)', () => {
    expect(CASE_STATUS_LABELS).toEqual({ active: 'Active', revoked: 'Levée', ended: 'Terminée' });
  });
});

describe('caseListQuerySchema', () => {
  it('commence à la page 1, sans aucun filtre', () => {
    expect(caseListQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it('lit les filtres de l’URL, la période couvrant les journées entières (UTC)', () => {
    const query = caseListQuerySchema.parse({
      page: '3',
      type: 'BAN',
      status: 'active',
      moderatorId: ID,
      targetId: ID,
      q: '  spam ',
      from: '2026-11-01',
      to: '2026-11-09',
    });

    expect(query).toEqual({
      page: 3,
      type: 'BAN',
      status: 'active',
      moderatorId: ID,
      targetId: ID,
      q: 'spam',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-09T23:59:59.999Z'),
    });
  });

  it('traite un texte vide comme l’absence de recherche', () => {
    expect(caseListQuerySchema.parse({ q: '   ' })).toEqual({ page: 1 });
  });

  it.each([
    ['une page 0', { page: '0' }],
    ['une page 1001', { page: '1001' }],
    ['une page décimale', { page: '1.5' }],
    ['un type inconnu', { type: 'MUTEX' }],
    ['un statut inconnu', { status: 'pending' }],
    ['un modérateur qui n’est pas un identifiant', { moderatorId: 'abc' }],
    ['une cible qui n’est pas un identifiant', { targetId: '12' }],
    ['une recherche de plus de 100 caractères', { q: 'a'.repeat(101) }],
    ['une date impossible', { from: '2026-02-30' }],
    ['une date mal écrite', { to: '09/11/2026' }],
    ['une période à l’envers', { from: '2026-11-09', to: '2026-11-01' }],
  ])('refuse %s', (_nom, query) => {
    expect(caseListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepte une période d’un seul jour', () => {
    expect(caseListQuerySchema.safeParse({ from: '2026-11-09', to: '2026-11-09' }).success).toBe(
      true,
    );
  });

  it('ignore la taille de page : c’est le serveur qui la fixe', () => {
    expect(CASE_PAGE_SIZE).toBe(20);
    expect(caseListQuerySchema.parse({ pageSize: '100000' })).toEqual({ page: 1 });
  });
});

describe('caseRevokeSchema', () => {
  it('accepte une levée sans raison, ou avec une raison rognée', () => {
    expect(caseRevokeSchema.parse({})).toEqual({ reason: null });
    expect(caseRevokeSchema.parse({ reason: '  Erreur de modération ' })).toEqual({
      reason: 'Erreur de modération',
    });
  });

  it('accepte une raison nulle, refuse un autre type', () => {
    expect(caseRevokeSchema.parse({ reason: null })).toEqual({ reason: null });
    expect(caseRevokeSchema.safeParse({ reason: 123 }).success).toBe(false);
  });

  it('compte les 512 caractères après avoir rogné les espaces', () => {
    expect(caseRevokeSchema.safeParse({ reason: `  ${'x'.repeat(512)}  ` }).success).toBe(true);
  });

  it('remplace une demi-paire isolée : ni le journal d’audit ni la base ne la supportent', () => {
    expect(caseRevokeSchema.parse({ reason: 'a\ud800b' })).toEqual({ reason: 'a\ufffdb' });
  });

  it('traite une raison vide comme l’absence de raison', () => {
    expect(caseRevokeSchema.parse({ reason: '   ' })).toEqual({ reason: null });
  });

  it('refuse une raison de plus de 512 caractères (limite du journal d’audit de Discord)', () => {
    expect(caseRevokeSchema.safeParse({ reason: 'x'.repeat(512) }).success).toBe(true);
    expect(caseRevokeSchema.safeParse({ reason: 'x'.repeat(513) }).success).toBe(false);
  });

  it('ignore le reste : la cible vient de la sanction, jamais du client', () => {
    expect(caseRevokeSchema.parse({ targetId: '1', type: 'BAN', number: 3 })).toEqual({
      reason: null,
    });
  });
});
