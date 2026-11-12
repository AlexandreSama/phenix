import { describe, expect, it, vi } from 'vitest';
import type { GuildConfigCache } from '../core/guild-config-cache.js';
import { handleBotEvent } from './bot-events.js';

function deps() {
  const configs = { get: vi.fn(), invalidate: vi.fn(), clear: vi.fn() };
  const rolePanels = { publish: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const ticketPanels = { publish: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const removeTd2Report = vi.fn(async () => {});
  const logModeration = vi.fn(async (_event: { guildId: string; caseId: number }) => {});
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return {
    configs: configs as unknown as GuildConfigCache & typeof configs,
    rolePanels,
    ticketPanels,
    removeTd2Report,
    logModeration,
    logger,
  };
}

describe('handleBotEvent', () => {
  it('publie le log de modération d’une sanction levée depuis le site', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'moderation.logged', guildId: '1', caseId: 42 }), d);

    expect(d.logModeration).toHaveBeenCalledWith({
      type: 'moderation.logged',
      guildId: '1',
      caseId: 42,
    });
  });

  it('garde une erreur du log de modération dans les journaux, sans l’exposer', async () => {
    const d = deps();
    d.logModeration.mockRejectedValueOnce(new Error('Missing Access'));

    handleBotEvent(JSON.stringify({ type: 'moderation.logged', guildId: '1', caseId: 42 }), d);
    await new Promise((resolve) => setImmediate(resolve));

    expect(d.logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.logger.warn.mock.calls)).not.toContain('"42"');
  });

  it('oublie la config du serveur modifié sur le site', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'config.updated', guildId: '42' }), d);

    expect(d.configs.invalidate).toHaveBeenCalledWith('42');
  });

  it('publie ou retire un panel de rôles à la demande du site', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'rolePanel.publish', panelId: 7 }), d);
    handleBotEvent(
      JSON.stringify({ type: 'rolePanel.delete', guildId: '1', channelId: '2', messageId: '3' }),
      d,
    );

    expect(d.rolePanels.publish).toHaveBeenCalledWith(7);
    expect(d.rolePanels.remove).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '2', messageId: '3' }),
    );
  });

  it('publie le panel de tickets du serveur, ou retire son ancien message', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'ticketPanel.publish', guildId: '1' }), d);
    handleBotEvent(
      JSON.stringify({ type: 'ticketPanel.delete', guildId: '1', channelId: '2', messageId: '3' }),
      d,
    );

    expect(d.ticketPanels.publish).toHaveBeenCalledWith('1');
    expect(d.ticketPanels.remove).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '2', messageId: '3' }),
    );
    expect(d.rolePanels.publish).not.toHaveBeenCalled();
  });

  it('retire l’embed d’un signalement supprimé depuis l’administration', () => {
    const d = deps();

    handleBotEvent(JSON.stringify({ type: 'td2Report.deleted', guildId: '1', messageId: '3' }), d);

    expect(d.removeTd2Report).toHaveBeenCalledWith({
      type: 'td2Report.deleted',
      guildId: '1',
      messageId: '3',
    });
  });

  it('ignore un message mal formé sans planter', () => {
    const d = deps();

    handleBotEvent('pas du json', d);
    handleBotEvent(JSON.stringify({ type: 'inconnu' }), d);

    expect(d.configs.invalidate).not.toHaveBeenCalled();
    expect(d.logger.warn).toHaveBeenCalledTimes(2);
  });
});
