import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { nextRaid, RaidPreview, raidWhen } from './raid-preview';

// Mercredi 11 novembre 2026, 3 h 15, heure locale
const WEDNESDAY = new Date(2026, 10, 11, 3, 15);

describe('nextRaid', () => {
  it('choisit le samedi qui vient, à 21 h', () => {
    expect(nextRaid(WEDNESDAY)).toEqual({ date: new Date(2026, 10, 14, 21, 0), days: 3 });
  });

  it('passe au samedi suivant le jour même, et annonce demain le vendredi', () => {
    expect(nextRaid(new Date(2026, 10, 14, 10, 0))).toEqual({
      date: new Date(2026, 10, 21, 21, 0),
      days: 7,
    });
    expect(nextRaid(new Date(2026, 10, 13, 23, 59)).days).toBe(1);
  });

  it('change de mois et d’année sans se tromper de jour', () => {
    expect(nextRaid(new Date(2026, 11, 30, 12, 0)).date).toEqual(new Date(2027, 0, 2, 21, 0));
  });
});

describe('raidWhen', () => {
  it('écrit la date en toutes lettres, suivie du délai', () => {
    expect(raidWhen(WEDNESDAY)).toBe('samedi 14 novembre 2026 à 21:00 · dans 3 jours');
    expect(raidWhen(new Date(2026, 10, 13, 9, 0))).toMatch(/ · demain$/);
  });
});

describe('RaidPreview', () => {
  it('compte les inscrits et grise les rôles complets, comme le message du bot', () => {
    render(<RaidPreview now={WEDNESDAY} />);

    expect(screen.getByText('6/8 joueurs')).toBeTruthy();
    expect(screen.getByText('1 en réserve')).toBeTruthy();
    expect(screen.getByText('DPS 4/6').className).toContain('bg-flame');
    expect(screen.getByText('Tank 1/1').className).not.toContain('bg-flame');
    expect(screen.getByText(/^samedi 14 novembre 2026 à 21:00/)).toBeTruthy();
  });
});
