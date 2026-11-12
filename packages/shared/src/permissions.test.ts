import { describe, expect, it } from 'vitest';
import { hasForbiddenPermissions, ROLE_PANEL_FORBIDDEN_PERMISSIONS } from './permissions.js';

/**
 * Bits attendus, d'après la documentation des permissions de Discord.
 * Le bot vérifie en plus, nom pour nom, qu'ils collent à PermissionFlagsBits de discord.js.
 */
const EXPECTED_FORBIDDEN = {
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  ViewAuditLog: 1n << 7n,
  ManageMessages: 1n << 13n,
  MentionEveryone: 1n << 17n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  ModerateMembers: 1n << 40n,
  PinMessages: 1n << 51n,
  BypassSlowmode: 1n << 52n,
};

describe('ROLE_PANEL_FORBIDDEN_PERMISSIONS', () => {
  it('contient toutes les permissions de modération ou d’administration, avec leurs bits Discord', () => {
    expect(ROLE_PANEL_FORBIDDEN_PERMISSIONS).toEqual(EXPECTED_FORBIDDEN);
  });

  it.each(Object.entries(EXPECTED_FORBIDDEN))(
    'refuse %s seule, en bigint ou en texte',
    (_, bit) => {
      expect(hasForbiddenPermissions(bit)).toBe(true);
      expect(hasForbiddenPermissions(String(bit))).toBe(true);
    },
  );
});

describe('hasForbiddenPermissions', () => {
  it('laisse passer un rôle sans pouvoir', () => {
    // Voir les salons (1 << 10) + Envoyer des messages (1 << 11)
    expect(hasForbiddenPermissions(String((1n << 10n) | (1n << 11n)))).toBe(false);
    expect(hasForbiddenPermissions('0')).toBe(false);
  });

  it('repère une permission de modération ou d’administration, même parmi d’autres', () => {
    expect(hasForbiddenPermissions(String(1n << 3n))).toBe(true); // Administrateur
    expect(hasForbiddenPermissions((1n << 10n) | (1n << 40n))).toBe(true); // + Exclure temporairement
  });
});
