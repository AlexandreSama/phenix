import { describe, expect, it } from 'vitest';
import { guildInitials } from './guild-icon';

describe('guildInitials', () => {
  it('prend la première lettre des trois premiers mots, comme Discord', () => {
    expect(guildInitials('Les Agents')).toBe('LA');
    expect(guildInitials('raid du jeudi soir')).toBe('RDJ');
    expect(guildInitials('  Phenix  ')).toBe('P');
  });
});
