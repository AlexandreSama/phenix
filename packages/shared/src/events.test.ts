import { describe, expect, it } from 'vitest';
import { parseBotEvent } from './events.js';

describe('parseBotEvent', () => {
  it('lit un événement valide', () => {
    const raw = JSON.stringify({ type: 'config.updated', guildId: '123456789012345678' });
    expect(parseBotEvent(raw)).toEqual({ type: 'config.updated', guildId: '123456789012345678' });
  });

  it('ignore un type inconnu', () => {
    expect(parseBotEvent(JSON.stringify({ type: 'inconnu' }))).toBeNull();
  });

  it('ignore un message qui n’est pas du JSON', () => {
    expect(parseBotEvent('pas du json')).toBeNull();
  });
});
