import { describe, expect, it } from 'vitest';
import { canManageGuild } from './permissions.js';

describe('canManageGuild', () => {
  it('accepte le propriétaire, un administrateur et « Gérer le serveur »', () => {
    expect(canManageGuild({ owner: true, permissions: '0' })).toBe(true);
    expect(canManageGuild({ permissions: String(1n << 3n) })).toBe(true); // Administrator
    expect(canManageGuild({ permissions: String(1n << 5n) })).toBe(true); // ManageGuild
  });

  it('refuse un simple membre, même avec beaucoup d’autres permissions', () => {
    expect(canManageGuild({ permissions: String((1n << 10n) | (1n << 11n) | (1n << 40n)) })).toBe(
      false,
    );
    expect(canManageGuild({})).toBe(false);
  });
});
