import { describe, expect, it } from 'vitest';
import { buildCustomId, parseCustomId } from './custom-id.js';

describe('customId', () => {
  it('construit puis relit un customId avec id', () => {
    const customId = buildCustomId('giveaway', 'join', 42);
    expect(customId).toBe('giveaway:join:42');
    expect(parseCustomId(customId)).toEqual({ prefix: 'giveaway:join', id: '42' });
  });

  it('accepte un customId sans id', () => {
    expect(parseCustomId('ticket:open')).toEqual({ prefix: 'ticket:open', id: undefined });
  });

  it('garde les « : » contenus dans l’id', () => {
    expect(parseCustomId('raid:signup:7:DPS').id).toBe('7:DPS');
  });
});
