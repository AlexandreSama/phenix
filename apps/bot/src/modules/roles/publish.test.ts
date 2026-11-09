import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishRolePanel } from './publish.js';
import { describePublishError } from '../../core/publish.js';

const database = vi.hoisted(() => ({
  findRolePanel: vi.fn(),
  markRolePanelPublished: vi.fn(),
  markRolePanelFailed: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const discordError = (code: number) =>
  new DiscordAPIError({ code, message: 'erreur' }, code, 400, 'POST', '/channels', {});

const panel = {
  id: 7,
  guildId: '1',
  channelId: '2',
  messageId: '900000000000000001' as string | null,
  title: 'Tes jeux',
  description: null,
  mode: 'MULTIPLE' as const,
  publishedAt: null,
  publishError: null,
  createdAt: new Date(),
  options: [{ id: 1, panelId: 7, roleId: '3', label: 'Jeu', emoji: null, position: 0 }],
};

function fakeClient() {
  const channel = {
    guildId: '1',
    isSendable: () => true,
    send: vi.fn(async () => ({ id: '900000000000000002' })),
    messages: { edit: vi.fn(async () => ({})) },
  };
  const client = { channels: { fetch: vi.fn(async () => channel) } };
  return { client: client as unknown as Client, channel };
}

const logger = { info: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  database.findRolePanel.mockResolvedValue({ ...panel });
});

describe('publishRolePanel', () => {
  it('modifie le message existant au lieu d’en poster un autre', async () => {
    const { client, channel } = fakeClient();

    await publishRolePanel(client, {} as never, 7, logger);

    expect(channel.messages.edit).toHaveBeenCalledOnce();
    expect(channel.send).not.toHaveBeenCalled();
    expect(database.markRolePanelPublished).toHaveBeenCalledWith({}, 7, '900000000000000001');
  });

  it('poste un nouveau message si l’ancien a été supprimé sur Discord', async () => {
    const { client, channel } = fakeClient();
    channel.messages.edit.mockRejectedValue(discordError(RESTJSONErrorCodes.UnknownMessage));

    await publishRolePanel(client, {} as never, 7, logger);

    expect(database.markRolePanelPublished).toHaveBeenCalledWith({}, 7, '900000000000000002');
  });

  it('enregistre une erreur lisible quand le bot ne peut pas écrire', async () => {
    const { client, channel } = fakeClient();
    database.findRolePanel.mockResolvedValue({ ...panel, messageId: null });
    channel.send.mockRejectedValue(discordError(RESTJSONErrorCodes.MissingPermissions));

    await publishRolePanel(client, {} as never, 7, logger);

    expect(database.markRolePanelFailed).toHaveBeenCalledWith(
      {},
      7,
      "Le bot n'a pas le droit d'écrire ou d'intégrer des liens dans ce salon",
    );
  });

  it('ne fait rien pour un panel supprimé entre-temps', async () => {
    const { client } = fakeClient();
    database.findRolePanel.mockResolvedValue(null);

    await publishRolePanel(client, {} as never, 7, logger);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });
});

describe('describePublishError', () => {
  it('ne montre jamais une erreur technique brute', () => {
    expect(describePublishError(new Error('ECONNRESET'))).toBe(
      'Erreur inattendue : voir les logs du bot',
    );
  });
});
