import type { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { BROADCAST_REPLIES, createBroadcast, formatReport, PENDING_TTL_MS } from './broadcast.js';

const database = vi.hoisted(() => ({ findAnnounceChannels: vi.fn() }));
vi.mock('@phenix/database', () => database);

const OWNER = '200000000000000001';
const STRANGER = '200000000000000002';

function fakeClient() {
  const channels = new Map([
    ['500000000000000001', fakeChannel('100000000000000001')],
    ['500000000000000002', fakeChannel('100000000000000002')],
  ]);
  return {
    channels,
    user: { username: 'PhenixMG' },
    guilds: {
      cache: new Map([
        ['100000000000000001', { name: 'Serveur A' }],
        ['100000000000000002', { name: 'Serveur B' }],
        ['100000000000000003', { name: 'Serveur C' }],
      ]),
    },
    // Le salon du serveur C a été supprimé
    fetchChannel: async (id: string) => channels.get(id) ?? null,
  };
}

function fakeChannel(guildId: string) {
  return { guildId, isSendable: () => true, send: vi.fn(async () => ({})) };
}

function setup() {
  let now = 1_000_000;
  const broadcast = createBroadcast({ now: () => now, newKey: () => 'k1' });
  const client = fakeClient();
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn() },
    ownerIds: [OWNER],
  } as unknown as BotContext;
  const [compose, send, cancel] = broadcast.components;

  const interaction = (userId: string, extra: object = {}) => ({
    user: { id: userId },
    client: { ...client, channels: { fetch: client.fetchChannel } },
    isModalSubmit: () => true,
    isButton: () => true,
    fields: {
      getTextInputValue: (id: string) => (id === 'title' ? '  ' : 'Nouvelle version du bot !'),
    },
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    showModal: vi.fn(async () => {}),
    ...extra,
  });
  type Fake = ReturnType<typeof interaction>;
  const asComponent = (fake: Fake) => fake as unknown as MessageComponentInteraction;

  return {
    client,
    context,
    interaction,
    advance: (ms: number) => {
      now += ms;
    },
    command: (fake: Fake) =>
      broadcast.command.execute(fake as unknown as ChatInputCommandInteraction, context),
    compose: (fake: Fake) => compose?.execute(asComponent(fake), undefined, context),
    send: (fake: Fake, key = 'k1') => send?.execute(asComponent(fake), key, context),
    cancel: (fake: Fake, key = 'k1') => cancel?.execute(asComponent(fake), key, context),
  };
}

beforeEach(() => {
  database.findAnnounceChannels.mockResolvedValue([
    { guildId: '100000000000000001', channelId: '500000000000000001' },
    { guildId: '100000000000000002', channelId: '500000000000000002' },
    { guildId: '100000000000000003', channelId: '500000000000000003' },
  ]);
});

describe('/broadcast', () => {
  it('est réservée aux propriétaires du bot', async () => {
    const { command, compose, interaction } = setup();
    const stranger = interaction(STRANGER);

    await command(stranger);
    await compose(stranger);

    expect(stranger.showModal).not.toHaveBeenCalled();
    expect(stranger.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: BROADCAST_REPLIES.ownerOnly }),
    );
  });

  it('ouvre le formulaire, puis montre un aperçu avec le nombre de serveurs', async () => {
    const { command, compose, interaction } = setup();
    const owner = interaction(OWNER);

    await command(owner);
    await compose(owner);

    expect(owner.showModal).toHaveBeenCalledOnce();
    const preview = (
      owner.reply.mock.calls[0] as unknown as [
        { embeds: { toJSON(): { title: string; description: string } }[]; components: unknown[] },
      ]
    )[0];
    expect(preview.embeds[0]?.toJSON()).toMatchObject({
      title: '📣 Annonce',
      description: 'Nouvelle version du bot !',
    });
    expect(JSON.stringify(preview.components)).toContain('Envoyer (3 serveurs)');
  });

  it('envoie partout, sans mentions, et rend compte des échecs', async () => {
    const { client, compose, send, interaction } = setup();
    await compose(interaction(OWNER));
    const click = interaction(OWNER);

    await send(click);

    const channelA = client.channels.get('500000000000000001');
    expect(channelA?.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } }),
    );
    expect(client.channels.get('500000000000000002')?.send).toHaveBeenCalledOnce();
    expect(click.editReply).toHaveBeenCalledWith({
      content:
        "Annonce envoyée dans 2 serveurs.\nÉchecs (1) :\n- Serveur C : Salon d'annonces introuvable",
    });
  });

  it('n’envoie qu’une fois, même sur un double clic', async () => {
    const { client, compose, send, interaction } = setup();
    await compose(interaction(OWNER));
    const second = interaction(OWNER);

    await send(interaction(OWNER));
    await send(second);

    expect(client.channels.get('500000000000000001')?.send).toHaveBeenCalledOnce();
    expect(second.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: BROADCAST_REPLIES.expired }),
    );
  });

  it('un aperçu trop ancien ou annulé n’envoie rien', async () => {
    const { advance, client, compose, cancel, send, interaction } = setup();
    await compose(interaction(OWNER));
    advance(PENDING_TTL_MS + 1);
    await send(interaction(OWNER));

    await compose(interaction(OWNER));
    const cancelClick = interaction(OWNER);
    await cancel(cancelClick);
    await send(interaction(OWNER));

    expect(client.channels.get('500000000000000001')?.send).not.toHaveBeenCalled();
    expect(cancelClick.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: BROADCAST_REPLIES.cancelled }),
    );
  });
});

describe('formatReport', () => {
  it('résume au-delà de dix échecs', () => {
    const failures = Array.from({ length: 12 }, (_, i) => ({ guild: `S${i}`, reason: 'refus' }));

    const text = formatReport({ sent: 1, failures });

    expect(text.split('\n')).toHaveLength(1 + 1 + 10 + 1);
    expect(text).toContain('Annonce envoyée dans 1 serveur.');
    expect(text).toContain('… et 2 autres');
  });
});
