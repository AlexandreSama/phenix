import { describe, expect, it } from 'vitest';
import { TD2_CATALOGUE } from './td2-catalogue.js';

const players = (composition: Record<string, number | undefined>): number =>
  Object.values(composition).reduce<number>((sum, count) => sum + (count ?? 0), 0);

describe('TD2_CATALOGUE', () => {
  it.each(TD2_CATALOGUE.filter((activity) => activity.kind === 'RAID'))(
    '$name : chaque mode compte 8 joueurs',
    (activity) => {
      for (const composition of Object.values(activity.modes)) {
        expect(players(composition)).toBe(8);
      }
    },
  );

  it.each(TD2_CATALOGUE.filter((activity) => activity.kind === 'INCURSION'))(
    '$name : chaque mode compte 4 joueurs',
    (activity) => {
      for (const composition of Object.values(activity.modes)) {
        expect(players(composition)).toBe(4);
      }
    },
  );
});
