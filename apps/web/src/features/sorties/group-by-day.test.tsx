import { describe, expect, it } from 'vitest';
import { groupByDay } from './group-by-day';

const at = (scheduledAt: string, id = scheduledAt) => ({ id, scheduledAt });
const NOW = new Date('2026-11-14T10:00:00Z'); // samedi, 11 h à Paris

describe('groupByDay', () => {
  it('range par jour du visiteur : aujourd’hui, demain, puis la date en toutes lettres', () => {
    const groups = groupByDay(
      [
        at('2026-11-14T20:00:00Z'),
        at('2026-11-14T22:30:00Z'), // 23 h 30 à Paris : encore samedi
        at('2026-11-14T23:30:00Z'), // 0 h 30 à Paris : dimanche
        at('2026-11-17T19:00:00Z'),
      ],
      NOW,
      'Europe/Paris',
    );

    expect(groups.map((group) => [group.label, group.events.length])).toEqual([
      ['Aujourd’hui', 2],
      ['Demain', 1],
      ['Mardi 17 novembre', 1],
    ]);
  });

  it('suit le fuseau donné : la même sortie tombe un autre jour à Montréal', () => {
    const [group] = groupByDay([at('2026-11-15T03:00:00Z')], NOW, 'America/Montreal');

    expect(group?.label).toBe('Aujourd’hui');
  });

  it('« demain » se compte sur le calendrier, même la veille du changement d’heure', () => {
    // Samedi 28 mars 2026 à 23 h 59 à Paris ; la nuit suivante ne dure que 23 heures
    const night = new Date('2026-03-28T22:59:00Z');
    const groups = groupByDay([at('2026-03-29T21:00:00Z')], night, 'Europe/Paris');

    expect(groups[0]?.label).toBe('Demain');
  });
});
