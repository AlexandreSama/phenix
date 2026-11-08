import { describe, expect, it } from 'vitest';
import { hasForbiddenPermissions } from './permissions.js';

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
