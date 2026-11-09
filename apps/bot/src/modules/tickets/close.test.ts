import { Collection, PermissionsBitField, type MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { CLOSE_REPLIES, createCloseTicketButtons } from './close.js';
import { confirmCustomId } from './messages.js';

const database = vi.hoisted(() => ({ closeTicket: vi.fn(), findTicket: vi.fn() }));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CHANNEL = '400000000000000001';
const LOG = '400000000000000002';
const OWNER = '200000000000000001';
const STAFF = '300000000000000001';

const ticket = {
  id: 7,
  guildId: GUILD,
  number: 42,
  channelId: CHANNEL,
  ownerId: OWNER,
  ownerName: 'Agent',
  status: 'OPEN',
  createdAt: new Date('2026-11-07T13:00:00Z'),
};

/** Faux message Discord : seulement ce que le transcript lit. */
const discordMessage = (id: string, content: string, at: number) => ({
  id,
  member: { displayName: 'Agent' },
  author: { displayName: 'agent', bot: false, displayAvatarURL: () => 'https://cdn/a.png' },
  createdAt: new Date(at),
  createdTimestamp: at,
  cleanContent: content,
  attachments: new Collection(),
  embeds: [],
});

function fakeButton({ memberId = OWNER, roles = [] as string[] } = {}) {
  const logChannel = { isSendable: () => true, send: vi.fn(async () => ({})) };
  const channel = {
    id: CHANNEL,
    // Discord renvoie les messages du plus récent au plus ancien
    messages: {
      fetch: vi.fn(
        async () =>
          new Collection([
            ['2', discordMessage('2', 'Merci, c’est réglé', 2000)],
            ['1', discordMessage('1', 'Bonjour <b>', 1000)],
          ]),
      ),
    },
    send: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
  };
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    channelId: CHANNEL,
    channel,
    logChannel,
    guild: { name: 'Phénix', channels: { cache: new Map([[LOG, logChannel]]) } },
    member: {
      id: memberId,
      displayName: 'Modo',
      user: { tag: 'modo' },
      roles: { cache: new Map(roles.map((role) => [role, {}])) },
      permissions: new PermissionsBitField(0n),
      toString: () => `<@${memberId}>`,
    },
    reply: vi.fn(async (_payload: unknown) => {}),
    update: vi.fn(async (_payload: unknown) => {}),
    editReply: vi.fn(async (_payload: unknown) => {}),
  };
}

const now = () => new Date('2026-11-07T14:00:00Z');

function setup() {
  const put = vi.fn(async () => {});
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    configs: {
      get: vi.fn(async () => ({
        timezone: 'Europe/Paris',
        ticketStaffRoleIds: [STAFF],
        ticketLogChannelId: LOG,
      })),
    },
    transcripts: { put, getText: vi.fn() },
    publicUrl: 'https://phenix.example',
  } as unknown as BotContext;
  const wait = vi.fn(async () => {});
  const [ask, confirm, cancel] = createCloseTicketButtons({ wait, now });
  const run =
    (handler: typeof ask) =>
    (interaction: ReturnType<typeof fakeButton>, id: string | undefined = '7') =>
      handler!.execute(interaction as unknown as MessageComponentInteraction, id, context);
  return { context, put, wait, ask: run(ask), confirm: run(confirm), cancel: run(cancel) };
}

const textOf = (mock: { mock: { calls: unknown[][] } }) =>
  (mock.mock.calls.at(-1)?.[0] as { content?: string } | string | undefined) ?? undefined;

beforeEach(() => {
  database.findTicket.mockResolvedValue(ticket as never);
  database.closeTicket.mockReset().mockResolvedValue(true);
});

describe('fermer un ticket', () => {
  it('demande confirmation à l’auteur, refuse un autre membre', async () => {
    const { ask } = setup();

    const owner = fakeButton();
    await ask(owner);
    const payload = owner.reply.mock.calls[0]?.[0] as unknown as {
      components: { toJSON(): { components: { custom_id: string }[] } }[];
    };
    expect(payload.components[0]?.toJSON().components[0]?.custom_id).toBe(confirmCustomId(7));

    const stranger = fakeButton({ memberId: '200000000000000099' });
    await ask(stranger);
    expect(textOf(stranger.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });
  });

  it('enregistre le transcript, ferme en base, poste le log, puis supprime le salon', async () => {
    const { confirm, put, wait } = setup();
    const interaction = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });

    await confirm(interaction);

    expect(put).toHaveBeenCalledWith(
      `${GUILD}/ticket-0042.html`,
      expect.stringContaining('Bonjour &lt;b&gt;'),
      'text/html; charset=utf-8',
    );
    const html = (put.mock.calls[0] as unknown as [string, string])[1];
    // Du plus ancien au plus récent dans le transcript
    expect(html.indexOf('Bonjour')).toBeLessThan(html.indexOf('réglé'));
    expect(database.closeTicket).toHaveBeenCalledWith({}, 7, {
      closedById: '200000000000000002',
      closedByName: 'Modo',
      transcriptKey: `${GUILD}/ticket-0042.html`,
      messageCount: 2,
      now: new Date('2026-11-07T14:00:00Z'),
    });
    expect(interaction.logChannel.send).toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(5000);
    expect(interaction.channel.delete).toHaveBeenCalled();
  });

  it('laisse le ticket ouvert si le stockage ne répond pas', async () => {
    const { confirm, put } = setup();
    put.mockRejectedValue(new Error('Garage injoignable'));
    const interaction = fakeButton();

    await confirm(interaction);

    expect(textOf(interaction.editReply)).toBe(CLOSE_REPLIES.storageDown);
    expect(database.closeTicket).not.toHaveBeenCalled();
    expect(interaction.channel.delete).not.toHaveBeenCalled();
  });

  it('ne supprime rien si quelqu’un d’autre a fermé entre-temps', async () => {
    database.closeTicket.mockResolvedValue(false);
    const { confirm } = setup();
    const interaction = fakeButton();

    await confirm(interaction);

    expect(textOf(interaction.editReply)).toBe(CLOSE_REPLIES.stale);
    expect(interaction.channel.delete).not.toHaveBeenCalled();
  });

  it('refuse un bouton d’un ticket déjà fermé ou d’un autre salon', async () => {
    const { confirm } = setup();

    database.findTicket.mockResolvedValue({ ...ticket, status: 'CLOSED' } as never);
    const closed = fakeButton();
    await confirm(closed);
    expect(textOf(closed.update)).toMatchObject({ content: CLOSE_REPLIES.stale });

    database.findTicket.mockResolvedValue({ ...ticket, channelId: 'ailleurs' } as never);
    const elsewhere = fakeButton();
    await confirm(elsewhere);
    expect(textOf(elsewhere.update)).toMatchObject({ content: CLOSE_REPLIES.stale });
  });

  it('« Annuler » retire simplement la question', async () => {
    const { cancel } = setup();
    const interaction = fakeButton();

    await cancel(interaction, undefined);

    expect(interaction.update).toHaveBeenCalledWith({
      content: CLOSE_REPLIES.cancelled,
      components: [],
    });
  });
});
