import {
  ChannelType,
  DiscordAPIError,
  RESTJSONErrorCodes,
  type MessageComponentInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { createOpenTicketButton, OPEN_REPLIES } from './open.js';

const database = vi.hoisted(() => ({
  closeTicket: vi.fn(),
  createTicket: vi.fn(),
  findOpenTicket: vi.fn(),
  reserveTicketNumber: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CATEGORY = '100000000000000002';
const STAFF = '300000000000000001';
const OWNER = '200000000000000001';

const settings = {
  ticketCategoryId: CATEGORY,
  // Le second rôle a été supprimé sur Discord depuis le réglage
  ticketStaffRoleIds: [STAFF, '300000000000000099'],
};

function fakeClick({ categoryType = ChannelType.GuildCategory, channels = [] as string[] } = {}) {
  const channel = {
    id: '400000000000000001',
    send: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
    toString: () => '<#400000000000000001>',
  };
  const guild = {
    id: GUILD,
    channels: {
      cache: new Map<string, object>([
        [CATEGORY, { id: CATEGORY, type: categoryType }],
        ...channels.map((id) => [id, {}] as [string, object]),
      ]),
      create: vi.fn(async () => channel),
    },
    roles: { cache: new Map([[STAFF, {}]]), everyone: { id: GUILD } },
  };
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    guild,
    user: { id: OWNER },
    member: { id: OWNER, displayName: 'Agent', user: { tag: 'agent' } },
    client: { user: { id: '500000000000000001' } },
    reply: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    channel,
  };
}

function setup(config: object | null = settings) {
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn() },
    configs: { get: vi.fn(async () => config) },
  } as unknown as BotContext;
  const handler = createOpenTicketButton();
  const click = (interaction: ReturnType<typeof fakeClick>) =>
    handler.execute(interaction as unknown as MessageComponentInteraction, undefined, context);
  return { click };
}

const lastText = (mock: { mock: { calls: unknown[][] } }) => {
  const arg = mock.mock.calls.at(-1)?.[0];
  return typeof arg === 'string' ? arg : (arg as { content?: string } | undefined)?.content;
};

beforeEach(() => {
  database.findOpenTicket.mockResolvedValue(null);
  database.reserveTicketNumber.mockResolvedValue(42);
  database.createTicket.mockImplementation(async (_db: unknown, data: object) => ({
    ...data,
    id: 7,
  }));
  database.closeTicket.mockReset();
});

describe('ouvrir un ticket', () => {
  it('crée un salon privé dans la catégorie, l’enregistre et y accueille l’auteur', async () => {
    const { click } = setup();
    const interaction = fakeClick();

    await click(interaction);

    expect(interaction.guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket-0042',
        type: ChannelType.GuildText,
        parent: CATEGORY,
      }),
    );
    const options = vi.mocked(interaction.guild.channels.create).mock.calls[0] as unknown as [
      { permissionOverwrites: { id: string }[] },
    ];
    // Le rôle supprimé n'est pas dans les permissions : Discord refuserait tout le salon
    expect(options[0].permissionOverwrites.map((overwrite) => overwrite.id)).toEqual([
      GUILD,
      OWNER,
      STAFF,
      '500000000000000001',
    ]);
    expect(database.createTicket).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ number: 42, ownerId: OWNER, ownerName: 'Agent' }),
    );
    expect(interaction.channel.send).toHaveBeenCalled();
    expect(lastText(interaction.editReply)).toBe('Ton ticket est ouvert : <#400000000000000001>');
  });

  it('refuse tant que la catégorie n’est pas réglée ou n’existe plus', async () => {
    for (const [config, type] of [
      [null, ChannelType.GuildCategory],
      [settings, ChannelType.GuildText],
    ] as const) {
      const { click } = setup(config);
      const interaction = fakeClick({ categoryType: type });

      await click(interaction);

      expect(lastText(interaction.reply)).toBe(OPEN_REPLIES.notConfigured);
      expect(interaction.guild.channels.create).not.toHaveBeenCalled();
    }
  });

  it('renvoie vers le ticket déjà ouvert', async () => {
    database.findOpenTicket.mockResolvedValue({
      id: 3,
      channelId: '400000000000000009',
    } as never);
    const { click } = setup();
    const interaction = fakeClick({ channels: ['400000000000000009'] });

    await click(interaction);

    expect(lastText(interaction.editReply)).toBe(
      'Tu as déjà un ticket ouvert : <#400000000000000009>',
    );
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('ferme l’ancien ticket dont le salon a disparu, puis en ouvre un neuf', async () => {
    database.findOpenTicket.mockResolvedValue({
      id: 3,
      channelId: '400000000000000009',
    } as never);
    const { click } = setup();
    const interaction = fakeClick();

    await click(interaction);

    expect(database.closeTicket).toHaveBeenCalledWith(
      {},
      3,
      expect.objectContaining({ transcriptKey: null }),
    );
    expect(interaction.guild.channels.create).toHaveBeenCalled();
  });

  it('ignore le second clic tant que le premier crée le salon', async () => {
    let release: (() => void) | undefined;
    database.reserveTicketNumber.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(42);
      }),
    );
    const { click } = setup();
    const first = fakeClick();
    const second = fakeClick();

    const pending = click(first);
    await vi.waitFor(() => expect(database.reserveTicketNumber).toHaveBeenCalled());
    await click(second);
    release?.();
    await pending;

    expect(lastText(second.reply)).toBe(OPEN_REPLIES.inProgress);
    expect(first.guild.channels.create).toHaveBeenCalledTimes(1);
    expect(second.guild.channels.create).not.toHaveBeenCalled();
  });

  it('explique le droit manquant quand Discord refuse le salon', async () => {
    const { click } = setup();
    const interaction = fakeClick();
    interaction.guild.channels.create.mockRejectedValue(
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        '/guilds/1/channels',
        {},
      ),
    );

    await click(interaction);

    expect(lastText(interaction.editReply)).toBe(OPEN_REPLIES.missingPermissions);
  });

  it('supprime le salon si le ticket ne peut pas être enregistré', async () => {
    database.createTicket.mockRejectedValue(new Error('base indisponible'));
    const { click } = setup();
    const interaction = fakeClick();

    await expect(click(interaction)).rejects.toThrow('base indisponible');
    expect(interaction.channel.delete).toHaveBeenCalled();
  });
});
