import { describe, expect, it } from 'vitest';
import { parseEventDate, zonedParts, zonedTimeToUtc, type ParseOptions } from './event-date.js';

/** Lundi 9 novembre 2026, midi à Paris (11:00 UTC, heure d'hiver). */
const NOW = new Date('2026-11-09T11:00:00Z');
const paris: ParseOptions = { now: NOW, timeZone: 'Europe/Paris' };

const iso = (input: string, options: ParseOptions = paris) => {
  const result = parseEventDate(input, options);
  return result.ok ? result.date.toISOString() : result.error;
};

describe('zonedParts et zonedTimeToUtc', () => {
  it('lisent l’heure murale d’un fuseau, heure d’été comprise', () => {
    expect(zonedParts(NOW, 'Europe/Paris')).toEqual({
      year: 2026,
      month: 11,
      day: 9,
      hour: 12,
      minute: 0,
      weekday: 1,
    });
    const at21 = { year: 2026, month: 11, day: 14, hour: 21, minute: 0 };
    expect(zonedTimeToUtc(at21, 'Europe/Paris').toISOString()).toBe('2026-11-14T20:00:00.000Z');
    expect(zonedTimeToUtc({ ...at21, month: 7 }, 'Europe/Paris').toISOString()).toBe(
      '2026-07-14T19:00:00.000Z',
    );
    expect(zonedTimeToUtc(at21, 'America/New_York').toISOString()).toBe('2026-11-15T02:00:00.000Z');
  });
});

describe('parseEventDate', () => {
  it('un jour de la semaine : le prochain, aujourd’hui compris si l’heure est à venir', () => {
    expect(iso('samedi 21h')).toBe('2026-11-14T20:00:00.000Z');
    expect(iso('Samedi à 21h30')).toBe('2026-11-14T20:30:00.000Z');
    expect(iso('sam. 21:30')).toBe('2026-11-14T20:30:00.000Z');
    expect(iso('lundi 13h')).toBe('2026-11-09T12:00:00.000Z');
    expect(iso('lundi 10h')).toBe('2026-11-16T09:00:00.000Z');
    expect(iso('samedi après-midi 15h')).toBe('2026-11-14T14:00:00.000Z');
  });

  it('aujourd’hui, demain, après-demain, ou seulement une heure', () => {
    expect(iso('demain 20h30')).toBe('2026-11-10T19:30:00.000Z');
    expect(iso('après-demain 18h')).toBe('2026-11-11T17:00:00.000Z');
    expect(iso('apres demain 18h')).toBe('2026-11-11T17:00:00.000Z');
    expect(iso("aujourd'hui 21h")).toBe('2026-11-09T20:00:00.000Z');
    expect(iso('ce soir vers 21h')).toBe('2026-11-09T20:00:00.000Z');
    expect(iso('21h')).toBe('2026-11-09T20:00:00.000Z');
    // 9h est passé aujourd'hui : c'est demain
    expect(iso('9h')).toBe('2026-11-10T08:00:00.000Z');
    expect(iso('demain midi')).toBe('2026-11-10T11:00:00.000Z');
  });

  it('une date explicite, en chiffres ou en lettres', () => {
    expect(iso('14/11 21h')).toBe('2026-11-14T20:00:00.000Z');
    expect(iso('samedi 14/11/2026 21:00')).toBe('2026-11-14T20:00:00.000Z');
    expect(iso('14 novembre 21h')).toBe('2026-11-14T20:00:00.000Z');
    expect(iso('1er décembre à 20h')).toBe('2026-12-01T19:00:00.000Z');
    // Le 5 novembre est passé : c'est l'année prochaine
    expect(iso('5/11 21h', { ...paris, maxAheadMs: Infinity })).toBe('2027-11-05T20:00:00.000Z');
  });

  it('dans un délai', () => {
    expect(iso('dans 2h')).toBe('2026-11-09T13:00:00.000Z');
    expect(iso('dans 1h30')).toBe('2026-11-09T12:30:00.000Z');
    expect(iso('dans 45 min')).toBe('2026-11-09T11:45:00.000Z');
  });

  it('suit le fuseau du serveur et les changements d’heure', () => {
    expect(iso('samedi 21h', { ...paris, timeZone: 'America/New_York' })).toBe(
      '2026-11-15T02:00:00.000Z',
    );
    // Samedi 27 mars 2027 en heure d'hiver ; dimanche 28, la France passe à l'heure d'été
    const beforeSwitch = { ...paris, now: new Date('2027-03-27T11:00:00Z') };
    expect(iso('dimanche 12h', beforeSwitch)).toBe('2027-03-28T10:00:00.000Z');
  });

  it('explique ce qui ne va pas', () => {
    expect(iso('')).toContain('Indique une date');
    expect(iso('samedi')).toContain('Précise l’heure');
    expect(iso('samedi 25h')).toBe('Cette heure n’existe pas.');
    expect(iso('31/02 21h')).toBe('Ce jour n’existe pas.');
    expect(iso('bientôt 21h')).toContain('Je ne comprends pas « bientôt 21h »');
    expect(iso('dans 2 min')).toContain('au moins 5 minutes');
    expect(iso('5/11 21h')).toBe('Pas plus de 60 jours à l’avance.');
  });
});
