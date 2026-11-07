import { describe, expect, it } from 'vitest';
import { DAY_MS, parseDuration } from './duration.js';

describe('parseDuration', () => {
  it.each([
    ['30s', 30_000],
    ['10m', 600_000],
    ['2h', 7_200_000],
    ['7j', 7 * DAY_MS],
    ['7d', 7 * DAY_MS],
    ['1j12h', 1.5 * DAY_MS],
    [' 1H 30M ', 5_400_000],
  ])('lit « %s »', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', 'demain', '10', 'm10', '0m', '2 semaines', '1x'])('refuse « %s »', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});
