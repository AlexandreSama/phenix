import { describe, expect, it } from 'vitest';
import { parseBotEvent } from './events.js';

describe('parseBotEvent', () => {
  it('lit un événement valide', () => {
    const raw = JSON.stringify({ type: 'config.updated', guildId: '123456789012345678' });
    expect(parseBotEvent(raw)).toEqual({ type: 'config.updated', guildId: '123456789012345678' });
  });

  it('lit la levée d’une sanction depuis le site : seulement le serveur et la sanction', () => {
    const raw = JSON.stringify({
      type: 'moderation.logged',
      guildId: '123456789012345678',
      caseId: 42,
      reason: 'ne doit pas passer',
    });
    expect(parseBotEvent(raw)).toEqual({
      type: 'moderation.logged',
      guildId: '123456789012345678',
      caseId: 42,
    });
    expect(
      parseBotEvent(JSON.stringify({ type: 'moderation.logged', guildId: '1', caseId: 'x' })),
    ).toBeNull();
  });

  it('ignore un type inconnu', () => {
    expect(parseBotEvent(JSON.stringify({ type: 'inconnu' }))).toBeNull();
  });

  it('ignore un message qui n’est pas du JSON', () => {
    expect(parseBotEvent('pas du json')).toBeNull();
  });
});
