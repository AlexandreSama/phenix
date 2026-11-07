import { describe, expect, it, vi } from 'vitest';
import type { GuildConfigCache } from '../core/guild-config-cache.js';
import { handleBotEvent } from './bot-events.js';

function deps() {
  const configs = { get: vi.fn(), invalidate: vi.fn(), clear: vi.fn() };
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return { configs: configs as unknown as GuildConfigCache & typeof configs, logger };
}

describe('handleBotEvent', () => {
  it('oublie la config du serveur modifié sur le site', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'config.updated', guildId: '42' }), d);

    expect(d.configs.invalidate).toHaveBeenCalledWith('42');
  });

  it('ignore un message mal formé sans planter', () => {
    const d = deps();

    handleBotEvent('pas du json', d);
    handleBotEvent(JSON.stringify({ type: 'inconnu' }), d);

    expect(d.configs.invalidate).not.toHaveBeenCalled();
    expect(d.logger.warn).toHaveBeenCalledTimes(2);
  });
});
