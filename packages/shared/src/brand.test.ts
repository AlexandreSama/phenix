import { describe, expect, it } from 'vitest';
import { BRAND } from './brand.js';

describe('BRAND', () => {
  it('ne contient que des couleurs hexadécimales à 6 chiffres', () => {
    for (const color of Object.values(BRAND)) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });
});
