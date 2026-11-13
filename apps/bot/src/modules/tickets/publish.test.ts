import type { Client } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_TYPE_ERROR, publishTicketPanel } from './publish.js';

const database = vi.hoisted(() => ({
  findPendingTicketPanels: vi.fn(),
  findTicketPanel: vi.fn(),
  listTicketTypes: vi.fn(),
  markTicketPanelFailed: vi.fn(),
  markTicketPanelPublished: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const core = vi.hoisted(() => ({ postOrEditMessage: vi.fn() }));
vi.mock('../../core/publish.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/publish.js')>()),
  ...core,
}));

const GUILD = '100000000000000001';
const panel = {
  guildId: GUILD,
  channelId: '400000000000000001',
  messageId: null,
  title: 'Support',
  description: null,
  buttonLabel: 'Ouvrir un ticket',
};

const client = {} as Client;
const db = {} as never;
const logger = { info: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  database.findTicketPanel.mockResolvedValue(panel);
  database.listTicketTypes.mockResolvedValue([
    { id: 1, name: 'Support', description: null, emoji: null },
  ]);
  core.postOrEditMessage.mockResolvedValue('500000000000000001');
});

describe('publier le panneau des tickets', () => {
  it('publie le panneau avec les types du serveur', async () => {
    await publishTicketPanel(client, db, GUILD, logger);

    expect(database.listTicketTypes).toHaveBeenCalledWith(db, GUILD);
    const message = core.postOrEditMessage.mock.calls[0]?.[2] as {
      components: { toJSON(): { components: { custom_id: string }[] } }[];
    };
    expect(message.components[0]?.toJSON().components[0]?.custom_id).toBe('ticket:open:1');
    expect(database.markTicketPanelPublished).toHaveBeenCalledWith(db, GUILD, '500000000000000001');
    expect(database.markTicketPanelFailed).not.toHaveBeenCalled();
  });

  it('refuse de publier un panneau sans type, avec une phrase pour l’admin', async () => {
    database.listTicketTypes.mockResolvedValue([]);

    await publishTicketPanel(client, db, GUILD, logger);

    expect(NO_TYPE_ERROR).toMatch(/type de ticket/);
    // Affiché sur le site : le mot du glossaire est « Panel »
    expect(NO_TYPE_ERROR).toContain('Panel');
    expect(NO_TYPE_ERROR).not.toMatch(/panneau/i);
    expect(database.markTicketPanelFailed).toHaveBeenCalledWith(db, GUILD, NO_TYPE_ERROR);
    expect(core.postOrEditMessage).not.toHaveBeenCalled();
    expect(database.markTicketPanelPublished).not.toHaveBeenCalled();
  });

  it('ne fait rien tant que le panneau n’est pas enregistré', async () => {
    database.findTicketPanel.mockResolvedValue(null);

    await publishTicketPanel(client, db, GUILD, logger);

    expect(core.postOrEditMessage).not.toHaveBeenCalled();
    expect(database.markTicketPanelFailed).not.toHaveBeenCalled();
  });
});
