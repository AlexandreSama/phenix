import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { canCloseTicket } from './access.js';

const member = (id: string, roles: string[] = [], permissions = 0n) =>
  ({
    id,
    roles: { cache: new Map(roles.map((role) => [role, {}])) },
    permissions: new PermissionsBitField(permissions),
  }) as unknown as Parameters<typeof canCloseTicket>[0];

describe('qui peut fermer un ticket', () => {
  const ticket = { ownerId: 'auteur' };

  it('l’auteur, l’équipe et ceux qui gèrent les salons', () => {
    expect(canCloseTicket(member('auteur'), ticket, ['staff'])).toBe(true);
    expect(canCloseTicket(member('modo', ['staff']), ticket, ['staff'])).toBe(true);
    expect(
      canCloseTicket(member('admin', [], PermissionFlagsBits.ManageChannels), ticket, ['staff']),
    ).toBe(true);
  });

  it('pas un autre membre', () => {
    expect(canCloseTicket(member('curieux', ['autre']), ticket, ['staff'])).toBe(false);
  });
});
