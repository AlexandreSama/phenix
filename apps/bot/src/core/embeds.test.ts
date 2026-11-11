import { BRAND } from '@phenix/shared';
import { describe, expect, it } from 'vitest';
import { COLORS } from './embeds.js';

describe('COLORS', () => {
  it('chaque couleur d’état est un hexadécimal à 6 chiffres', () => {
    for (const color of Object.values(COLORS)) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('garde les couleurs existantes et ajoute « bientôt » (or) et « neutre » (gris, rejeté)', () => {
    expect(COLORS.primary).toBe(BRAND.flame);
    expect(COLORS.warning).toBe(BRAND.yellow);
    expect(COLORS.success).toBe('#57F287');
    expect(COLORS.danger).toBe('#ED4245');
    expect(COLORS.soon).toBe(BRAND.gold);
    expect(COLORS.neutral).toBe('#80848E');
  });
});
