import { BRAND } from '@phenix/shared';
import { describe, expect, it } from 'vitest';
import css from './index.css?raw';

describe('thème du site', () => {
  it('reprend chaque couleur du logo définie dans @phenix/shared', () => {
    for (const color of Object.values(BRAND)) {
      expect(css.toLowerCase()).toContain(color.toLowerCase());
    }
  });
});
