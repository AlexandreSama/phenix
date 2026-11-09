import { describe, expect, it } from 'vitest';
import { ticketListQuerySchema, ticketSettingsSchema } from './tickets.js';

const valid = {
  categoryId: '100000000000000001',
  staffRoleIds: ['200000000000000001'],
  logChannelId: null,
  panel: {
    channelId: '300000000000000001',
    title: 'Besoin d’aide ?',
    description: null,
    buttonLabel: 'Ouvrir un ticket',
  },
};

describe('ticketSettingsSchema', () => {
  it('accepte des réglages valides', () => {
    expect(ticketSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('exige au moins un rôle du staff', () => {
    const result = ticketSettingsSchema.safeParse({ ...valid, staffRoleIds: [] });
    expect(result.error?.issues[0]?.message).toContain('personne ne verrait les tickets');
  });

  it('dit en clair qu’une catégorie manque, au lieu de « ID Discord invalide »', () => {
    const empty = ticketSettingsSchema.safeParse({ ...valid, categoryId: '' });
    expect(empty.error?.issues[0]?.message).toBe('Choisis une catégorie');

    const malformed = ticketSettingsSchema.safeParse({ ...valid, categoryId: 'abc' });
    expect(malformed.error?.issues[0]?.message).toBe('ID Discord invalide');
  });

  it('refuse un bouton sans texte', () => {
    const panel = { ...valid.panel, buttonLabel: '   ' };
    expect(ticketSettingsSchema.safeParse({ ...valid, panel }).success).toBe(false);
  });
});

describe('ticketListQuerySchema', () => {
  it('montre les tickets ouverts, page 1, par défaut', () => {
    expect(ticketListQuerySchema.parse({})).toEqual({ status: 'open', page: 1 });
    expect(ticketListQuerySchema.safeParse({ status: 'tous' }).success).toBe(false);
  });
});
