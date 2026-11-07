import { describe, expect, it } from 'vitest';
import { formatDuration, formatMegabytes } from './format.js';

describe('formatDuration', () => {
  it('affiche jours, heures et minutes', () => {
    const ms = ((2 * 24 + 3) * 60 + 4) * 60_000;
    expect(formatDuration(ms)).toBe('2 j 3 h 4 min');
  });

  it('omet les unités à zéro', () => {
    expect(formatDuration(90 * 60_000)).toBe('1 h 30 min');
  });

  it('gère les durées de moins d’une minute', () => {
    expect(formatDuration(30_000)).toBe("moins d'une minute");
  });
});

describe('formatMegabytes', () => {
  it('convertit en mégaoctets arrondis', () => {
    expect(formatMegabytes(150 * 1024 * 1024)).toBe('150 Mo');
  });
});
