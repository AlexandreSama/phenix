import {
  Collection,
  PermissionFlagsBits,
  PermissionsBitField,
  type MessageComponentInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import {
  CLOSE_REPLIES,
  createCloseTicketButtons,
  finishTicketClose,
  withTicketClosing,
} from './close.js';
import { AUTOMATIC_CLOSER_LABEL, confirmCustomId } from './messages.js';

const database = vi.hoisted(() => ({
  closeTicket: vi.fn(),
  findTicket: vi.fn(),
  findTicketType: vi.fn(),
  touchTicketActivity: vi.fn(),
}));
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
  typeId: 3,
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
  const dm = { send: vi.fn(async (_payload: unknown) => ({})) };
  const logChannel = { isSendable: () => true, send: vi.fn(async (_payload: unknown) => ({})) };
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
    send: vi.fn(async (_payload: unknown) => ({})),
    delete: vi.fn(async () => {}),
  };
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    channelId: CHANNEL,
    channel,
    logChannel,
    dm,
    client: { users: { fetch: vi.fn(async (_id: string) => dm) } },
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

/** Le ticket, pris en charge à `iso` par un membre de l'équipe. */
const claimedAt = (iso: string) => ({
  ...ticket,
  claimedById: '200000000000000002',
  claimedByName: 'Modo',
  claimedAt: new Date(iso),
});

function setup() {
  const put = vi.fn(async () => {});
  const remove = vi.fn(async (_keys: readonly string[]) => {});
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    configs: {
      get: vi.fn(async () => ({
        timezone: 'Europe/Paris',
        // Plus lu : l'équipe vient du type du ticket
        ticketStaffRoleIds: ['300000000000000077'],
        ticketLogChannelId: LOG,
      })),
    },
    transcripts: { put, getText: vi.fn(), delete: remove },
    publicUrl: 'https://phenix.example',
  } as unknown as BotContext;
  const wait = vi.fn(async () => {});
  const [ask, confirm, cancel] = createCloseTicketButtons({ wait, now });
  const run =
    (handler: typeof ask) =>
    (interaction: ReturnType<typeof fakeButton>, id: string | undefined = '7') =>
      handler!.execute(interaction as unknown as MessageComponentInteraction, id, context);
  return {
    context,
    put,
    remove,
    wait,
    ask: run(ask),
    confirm: run(confirm),
    cancel: run(cancel),
  };
}

const textOf = (mock: { mock: { calls: unknown[][] } }) =>
  (mock.mock.calls.at(-1)?.[0] as { content?: string } | string | undefined) ?? undefined;

beforeEach(() => {
  database.findTicket.mockResolvedValue(ticket as never);
  database.findTicketType.mockReset().mockResolvedValue({
    id: 3,
    guildId: GUILD,
    staffRoleIds: [STAFF],
  } as never);
  database.closeTicket.mockReset().mockResolvedValue(true);
  database.touchTicketActivity.mockReset().mockResolvedValue(true);
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

  it('laisse l’équipe du type fermer, pas celle d’un autre type ni l’ancien réglage du serveur', async () => {
    const { ask } = setup();

    const staff = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });
    await ask(staff);
    expect(staff.reply.mock.calls[0]?.[0]).not.toMatchObject({ content: CLOSE_REPLIES.denied });

    const otherTeam = fakeButton({ memberId: '200000000000000003', roles: ['300000000000000002'] });
    await ask(otherTeam);
    expect(textOf(otherTeam.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });

    const legacySetting = fakeButton({
      memberId: '200000000000000004',
      roles: ['300000000000000077'],
    });
    await ask(legacySetting);
    expect(textOf(legacySetting.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });
    expect(database.findTicketType).toHaveBeenCalledWith({}, 3);
  });

  it('ignore l’équipe d’un type qui appartient à un autre serveur', async () => {
    database.findTicketType.mockResolvedValue({
      id: 3,
      guildId: '100000000000000099',
      staffRoleIds: [STAFF],
    } as never);
    const { ask } = setup();

    const staff = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });
    await ask(staff);

    expect(textOf(staff.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });
  });

  it('pour un ticket sans type, seuls l’auteur et « Gérer les salons » peuvent fermer', async () => {
    database.findTicket.mockResolvedValue({ ...ticket, typeId: null } as never);
    const { ask } = setup();

    const staff = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });
    await ask(staff);
    expect(textOf(staff.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });
    expect(database.findTicketType).not.toHaveBeenCalled();

    const owner = fakeButton();
    await ask(owner);
    expect(textOf(owner.reply)).not.toMatchObject({ content: CLOSE_REPLIES.denied });

    const manager = fakeButton({ memberId: '200000000000000005' });
    manager.member.permissions = new PermissionsBitField(PermissionFlagsBits.ManageChannels);
    await ask(manager);
    expect(textOf(manager.reply)).not.toMatchObject({ content: CLOSE_REPLIES.denied });
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
      closedVia: 'BUTTON',
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

  it('un type disparu (findTicketType null) n’a plus d’équipe : l’équipe ne peut plus fermer', async () => {
    database.findTicketType.mockResolvedValue(null as never);
    const { ask } = setup();

    const staff = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });
    await ask(staff);

    expect(database.findTicketType).toHaveBeenCalledWith({}, 3);
    expect(textOf(staff.reply)).toMatchObject({ content: CLOSE_REPLIES.denied });
  });

  it.each(['', 'abc', '7.5', '-7', '0', '1e3', '2147483648', '99999999999'])(
    'un identifiant forgé (%s) répond « fermé » sans lire la base',
    async (id) => {
      database.findTicket.mockClear();
      const { ask, confirm } = setup();

      const asked = fakeButton();
      await ask(asked, id);
      expect(textOf(asked.reply)).toMatchObject({ content: CLOSE_REPLIES.stale });

      const confirmed = fakeButton();
      await confirm(confirmed, id);
      expect(textOf(confirmed.update)).toMatchObject({ content: CLOSE_REPLIES.stale });

      expect(database.findTicket).not.toHaveBeenCalled();
    },
  );

  it('accepte le plus grand identifiant d’une colonne Int (2147483647)', async () => {
    database.findTicket.mockClear();
    const { ask } = setup();

    await ask(fakeButton(), '2147483647');

    expect(database.findTicket).toHaveBeenCalledWith({}, 2_147_483_647);
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

  it('demande une note à l’auteur après une fermeture réussie, par un membre de l’équipe', async () => {
    const { confirm } = setup();
    const interaction = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });

    await confirm(interaction);

    expect(interaction.client.users.fetch).toHaveBeenCalledWith(OWNER);
    const payload = interaction.dm.send.mock.calls[0]?.[0] as {
      content: string;
      components: { toJSON(): { components: { custom_id: string }[] } }[];
    };
    expect(payload.content).toContain('Phénix');
    expect(payload.components[0]?.toJSON().components.map((button) => button.custom_id)).toEqual([
      'ticket:rate:7:1',
      'ticket:rate:7:2',
      'ticket:rate:7:3',
      'ticket:rate:7:4',
      'ticket:rate:7:5',
    ]);
    expect(interaction.channel.delete).toHaveBeenCalled();
  });

  it('demande aussi une note quand l’auteur ferme lui-même son ticket', async () => {
    const { confirm } = setup();
    const interaction = fakeButton();

    await confirm(interaction);

    expect(interaction.client.users.fetch).toHaveBeenCalledWith(OWNER);
    expect(interaction.dm.send).toHaveBeenCalledTimes(1);
  });

  it('demande la note après l’annonce « Ticket fermé » et avant l’attente de suppression', async () => {
    const { confirm, wait } = setup();
    const interaction = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });

    await confirm(interaction);

    const announced = interaction.channel.send.mock.invocationCallOrder[0]!;
    const fetched = interaction.client.users.fetch.mock.invocationCallOrder[0]!;
    const dm = interaction.dm.send.mock.invocationCallOrder[0]!;
    const waited = wait.mock.invocationCallOrder[0]!;
    expect(textOf(interaction.channel.send as never)).toMatchObject({
      content: expect.stringContaining('🔒 Ticket fermé'),
    });
    expect(announced).toBeLessThan(fetched);
    expect(dm).toBeLessThan(waited);
  });

  describe('pas de note quand l’auteur ferme juste après la prise en charge', () => {
    // now() = 14:00:00 : la prise en charge date de 9 min 59 s, 10 min pile, 1 min
    it('auteur à 9 min 59 s de la prise en charge : pas de MP, la fermeture continue', async () => {
      database.findTicket.mockResolvedValue(claimedAt('2026-11-07T13:50:01Z') as never);
      const { confirm } = setup();
      const interaction = fakeButton();

      await confirm(interaction);

      expect(database.closeTicket).toHaveBeenCalled();
      expect(interaction.client.users.fetch).not.toHaveBeenCalled();
      expect(interaction.dm.send).not.toHaveBeenCalled();
      expect(interaction.channel.delete).toHaveBeenCalled();
    });

    it('auteur à 10 min pile de la prise en charge : MP', async () => {
      database.findTicket.mockResolvedValue(claimedAt('2026-11-07T13:50:00Z') as never);
      const { confirm } = setup();
      const interaction = fakeButton();

      await confirm(interaction);

      expect(interaction.dm.send).toHaveBeenCalledTimes(1);
    });

    it('membre de l’équipe à 1 min de la prise en charge : MP', async () => {
      database.findTicket.mockResolvedValue(claimedAt('2026-11-07T13:59:00Z') as never);
      const { confirm } = setup();
      const interaction = fakeButton({ memberId: '200000000000000002', roles: [STAFF] });

      await confirm(interaction);

      expect(interaction.dm.send).toHaveBeenCalledTimes(1);
    });

    it('ticket non pris en charge fermé par l’auteur : MP', async () => {
      database.findTicket.mockResolvedValue({ ...ticket, claimedAt: null } as never);
      const { confirm } = setup();
      const interaction = fakeButton();

      await confirm(interaction);

      expect(interaction.dm.send).toHaveBeenCalledTimes(1);
    });
  });

  it('une annonce « Ticket fermé » impossible à poster ne bloque ni la note ni la suppression', async () => {
    const { confirm, wait, context } = setup();
    const interaction = fakeButton();
    interaction.channel.send.mockRejectedValueOnce(new Error('Missing Permissions'));

    await confirm(interaction);

    expect(interaction.dm.send).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(5000);
    expect(interaction.channel.delete).toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it('un MP impossible à envoyer ne bloque jamais la fermeture', async () => {
    const { confirm, wait, context } = setup();
    const interaction = fakeButton();
    interaction.dm.send.mockRejectedValue(new Error('Cannot send messages to this user'));

    await confirm(interaction);

    expect(interaction.channel.send).toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(5000);
    expect(interaction.channel.delete).toHaveBeenCalled();
    expect((context.logger.error as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
  });

  it('ne demande pas de note si la fermeture échoue (stockage ou fermeture concurrente)', async () => {
    const { confirm, put } = setup();
    put.mockRejectedValueOnce(new Error('Garage injoignable'));
    const storageDown = fakeButton();
    await confirm(storageDown);
    expect(storageDown.dm.send).not.toHaveBeenCalled();

    database.closeTicket.mockResolvedValue(false);
    const concurrent = fakeButton();
    await confirm(concurrent);
    expect(concurrent.dm.send).not.toHaveBeenCalled();
    expect(concurrent.client.users.fetch).not.toHaveBeenCalled();
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

describe('fermeture automatique (finishTicketClose sans membre)', () => {
  const lastActivityAt = new Date('2026-11-07T10:00:00Z');

  function automatic() {
    const button = fakeButton();
    const { context, put, remove, wait } = setup();
    const run = () =>
      finishTicketClose({
        ticket: ticket as never,
        guild: button.guild as never,
        channel: button.channel as never,
        client: button.client as never,
        closedBy: null,
        expectedLastActivityAt: lastActivityAt,
        context,
        options: { wait, now },
      });
    return { button, context, put, remove, wait, run };
  }

  it('ferme en base sans identifiant, avec closedVia INACTIVITY et l’activité lue', async () => {
    const { run } = automatic();

    expect(await run()).toBe('closed');

    expect(database.closeTicket).toHaveBeenCalledWith({}, 7, {
      closedById: null,
      closedByName: null,
      transcriptKey: `${GUILD}/ticket-0042.html`,
      messageCount: 2,
      closedVia: 'INACTIVITY',
      expectedLastActivityAt: lastActivityAt,
      now: new Date('2026-11-07T14:00:00Z'),
    });
  });

  it('écrit « Fermeture automatique » dans le transcript, le salon et le log, sans mention', async () => {
    const { button, put, run } = automatic();

    await run();

    const html = (put.mock.calls[0] as unknown as [string, string])[1];
    expect(html).toContain(AUTOMATIC_CLOSER_LABEL);
    const announced = button.channel.send.mock.calls[0]?.[0] as unknown as {
      content: string;
      allowedMentions: unknown;
    };
    expect(announced.content).toContain('🔒 Ticket fermé automatiquement');
    expect(announced.content).not.toContain('<@');
    expect(announced.allowedMentions).toEqual({ parse: [] });
    const log = JSON.stringify(
      (
        button.logChannel.send.mock.calls[0] as unknown as [{ embeds: { toJSON(): unknown }[] }]
      )[0].embeds[0]!.toJSON(),
    );
    expect(log).toContain(AUTOMATIC_CLOSER_LABEL);
  });

  it('ne demande PAS de note (contact non sollicité pour un ticket abandonné), puis supprime le salon', async () => {
    const { button, wait, run } = automatic();

    await run();

    expect(button.client.users.fetch).not.toHaveBeenCalled();
    expect(button.dm.send).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(5000);
    expect(button.channel.delete).toHaveBeenCalledWith('Ticket #42 fermé automatiquement');
  });

  describe('second signal tiré de Discord : le dernier message de membre', () => {
    const member = (id: string, iso: string, extra: Record<string, unknown> = {}) => ({
      ...discordMessage(id, 'Toujours là ?', Date.parse(iso)),
      ...extra,
    });
    const withMessages = (button: ReturnType<typeof fakeButton>, messages: unknown[]) => {
      button.channel.messages.fetch.mockResolvedValue(
        new Collection(
          messages.map((message) => [(message as { id: string }).id, message]),
        ) as never,
      );
    };

    it('message de membre plus récent que lastActivityAt (bot éteint ou écriture perdue) : pas de fermeture, activité recalée, pas de transcript', async () => {
      const { button, put, run } = automatic();
      withMessages(button, [member('9', '2026-11-07T10:30:00Z')]);

      expect(await run()).toBe('stale');

      expect(database.touchTicketActivity).toHaveBeenCalledWith(
        {},
        CHANNEL,
        new Date('2026-11-07T10:30:00Z'),
      );
      expect(put).not.toHaveBeenCalled();
      expect(database.closeTicket).not.toHaveBeenCalled();
      expect(button.channel.send).not.toHaveBeenCalled();
      expect(button.channel.delete).not.toHaveBeenCalled();
    });

    it('un message de bot ou un message système plus récent est ignoré : la fermeture a lieu', async () => {
      const { button, put, run } = automatic();
      withMessages(button, [
        member('1', '2026-11-07T09:00:00Z'),
        member('2', '2026-11-07T11:00:00Z', {
          author: { displayName: 'Phénix', bot: true, displayAvatarURL: () => 'https://cdn/b.png' },
        }),
        member('3', '2026-11-07T12:00:00Z', { system: true }),
      ]);

      expect(await run()).toBe('closed');

      expect(database.touchTicketActivity).not.toHaveBeenCalled();
      expect(put).toHaveBeenCalledTimes(1);
    });

    it('un message de membre pile à lastActivityAt n’empêche pas la fermeture', async () => {
      const { button, run } = automatic();
      withMessages(button, [member('1', '2026-11-07T10:00:00Z')]);

      expect(await run()).toBe('closed');
      expect(database.touchTicketActivity).not.toHaveBeenCalled();
    });

    it('le bouton « Fermer » ne regarde pas ce signal (fermeture voulue par un membre)', async () => {
      const { confirm } = setup();
      const interaction = fakeButton();
      withMessages(interaction, [member('9', '2026-11-07T13:59:00Z')]);

      await confirm(interaction);

      expect(database.touchTicketActivity).not.toHaveBeenCalled();
      expect(database.closeTicket).toHaveBeenCalled();
    });
  });

  describe('transcript tronqué (limite de messages atteinte)', () => {
    /** Un salon de 5000 messages ou plus : Discord en rend 100 par appel. */
    const huge = (button: ReturnType<typeof fakeButton>) => {
      let batch = 0;
      button.channel.messages.fetch.mockImplementation(async () => {
        const start = batch++ * 100;
        return new Collection(
          Array.from({ length: 100 }, (_, index) => {
            const id = String(start + index + 1);
            return [id, discordMessage(id, 'bla', 1000 + start + index)];
          }),
        ) as never;
      });
    };

    it('la fermeture automatique s’abstient : rien d’écrit, rien de fermé, salon gardé', async () => {
      const { button, put, run } = automatic();
      huge(button);

      expect(await run()).toBe('too_long');

      expect(put).not.toHaveBeenCalled();
      expect(database.closeTicket).not.toHaveBeenCalled();
      expect(button.channel.send).not.toHaveBeenCalled();
      expect(button.channel.delete).not.toHaveBeenCalled();
    });

    it('le bouton garde son comportement : il ferme avec le transcript tronqué', async () => {
      const { confirm, put } = setup();
      const interaction = fakeButton();
      huge(interaction);

      await confirm(interaction);

      expect(put).toHaveBeenCalledTimes(1);
      expect(database.closeTicket).toHaveBeenCalledWith(
        {},
        7,
        expect.objectContaining({ messageCount: 5000 }),
      );
    });
  });

  it('suppression du salon impossible : ticket fermé, message posté, résultat closed', async () => {
    const { button, run, context } = automatic();
    button.channel.delete.mockRejectedValue(new Error('Missing Permissions'));

    expect(await run()).toBe('closed');

    expect(database.closeTicket).toHaveBeenCalledTimes(1);
    expect(button.channel.send).toHaveBeenLastCalledWith(
      "Je n'ai pas pu supprimer ce salon : un admin peut le faire à la main.",
    );
    expect(context.logger.warn).toHaveBeenCalled();
  });

  describe('journal : le code de l’erreur, jamais l’erreur complète', () => {
    const secretError = () =>
      Object.assign(new Error('<@200000000000000001> contenu privé'), { code: 'E_TEST' });
    const logged = (context: BotContext) =>
      JSON.stringify([
        (context.logger.warn as ReturnType<typeof vi.fn>).mock.calls,
        (context.logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ]);

    it('Garage injoignable : error { ticketId, code }', async () => {
      const { put, run, context } = automatic();
      put.mockRejectedValue(secretError());

      await run();

      expect(context.logger.error).toHaveBeenCalledWith(
        { ticketId: 7, code: 'E_TEST' },
        expect.any(String),
      );
      expect(logged(context)).not.toContain('contenu privé');
    });

    it('annonce, log et suppression impossibles : warn avec le code, en anglais pour l’annonce', async () => {
      const { button, run, context } = automatic();
      button.channel.send.mockRejectedValueOnce(secretError());
      button.logChannel.send.mockRejectedValue(secretError());
      button.channel.delete.mockRejectedValue(secretError());

      await run();

      const warns = (context.logger.warn as ReturnType<typeof vi.fn>).mock.calls as [
        Record<string, unknown>,
        string,
      ][];
      expect(warns).toHaveLength(3);
      for (const [payload] of warns) {
        expect(payload).toMatchObject({ code: 'E_TEST' });
        expect(payload).not.toHaveProperty('err');
      }
      expect(warns.map(([, message]) => message)).toContain('Closing announcement not posted');
      expect(logged(context)).not.toContain('contenu privé');
    });
  });

  it('activité entre-temps (closeTicket renvoie false) : rien n’est posté, ni supprimé, ni envoyé', async () => {
    database.closeTicket.mockResolvedValue(false);
    const { button, run } = automatic();

    expect(await run()).toBe('stale');

    expect(button.channel.send).not.toHaveBeenCalled();
    expect(button.channel.delete).not.toHaveBeenCalled();
    expect(button.dm.send).not.toHaveBeenCalled();
    expect(button.logChannel.send).not.toHaveBeenCalled();
  });

  describe('transcript orphelin (closeTicket renvoie false)', () => {
    const KEY = `${GUILD}/ticket-0042.html`;

    it('ticket toujours ouvert (activité entre-temps) : le transcript écrit est supprimé', async () => {
      database.closeTicket.mockResolvedValue(false);
      database.findTicket.mockResolvedValue({ ...ticket, transcriptKey: null } as never);
      const { remove, run } = automatic();

      expect(await run()).toBe('stale');

      expect(remove).toHaveBeenCalledWith([KEY]);
    });

    it('ticket déjà fermé par un concurrent avec ce transcript : l’objet est conservé', async () => {
      database.closeTicket.mockResolvedValue(false);
      // 1re lecture : le clic ; 2e : après l'échec de la fermeture, un concurrent l'a fermé
      database.findTicket
        .mockResolvedValueOnce(ticket as never)
        .mockResolvedValueOnce({ ...ticket, status: 'CLOSED', transcriptKey: KEY } as never);
      const { confirm, remove } = setup();
      const interaction = fakeButton();

      await confirm(interaction);

      expect(textOf(interaction.editReply)).toBe(CLOSE_REPLIES.stale);
      expect(remove).not.toHaveBeenCalled();
    });

    it('suppression impossible : pas d’erreur levée, warn avec le code seulement', async () => {
      database.closeTicket.mockResolvedValue(false);
      database.findTicket.mockResolvedValue({ ...ticket, transcriptKey: null } as never);
      const { remove, run, context } = automatic();
      remove.mockRejectedValue(
        Object.assign(new Error('<@200000000000000001> contenu privé'), { code: 'E_TEST' }),
      );

      expect(await run()).toBe('stale');

      expect(context.logger.warn).toHaveBeenCalledWith(
        { ticketId: 7, code: 'E_TEST' },
        expect.any(String),
      );
      expect(
        JSON.stringify((context.logger.warn as ReturnType<typeof vi.fn>).mock.calls),
      ).not.toContain('contenu privé');
    });

    it('relecture du ticket impossible : pas d’erreur levée, rien de supprimé', async () => {
      database.closeTicket.mockResolvedValue(false);
      database.findTicket.mockRejectedValue(Object.assign(new Error('db'), { code: 'E_DB' }));
      const { remove, run, context } = automatic();

      expect(await run()).toBe('stale');

      expect(remove).not.toHaveBeenCalled();
      expect(context.logger.warn).toHaveBeenCalledWith(
        { ticketId: 7, code: 'E_DB' },
        expect.any(String),
      );
    });
  });

  it('Garage injoignable : le ticket reste ouvert', async () => {
    const { button, put, run } = automatic();
    put.mockRejectedValue(new Error('Garage injoignable'));

    expect(await run()).toBe('storage_down');

    expect(database.closeTicket).not.toHaveBeenCalled();
    expect(button.channel.delete).not.toHaveBeenCalled();
  });
});

describe('withTicketClosing', () => {
  it('refuse une seconde fermeture du même ticket pendant la première, pas d’un autre ticket', async () => {
    let release!: () => void;
    const first = withTicketClosing(
      900,
      () => new Promise<string>((resolve) => (release = () => resolve('done'))),
    );

    expect(await withTicketClosing(900, async () => 'second')).toBe('busy');
    expect(await withTicketClosing(901, async () => 'other')).toBe('other');

    release();
    expect(await first).toBe('done');
    // Libéré : le ticket peut de nouveau être fermé (par exemple après un échec de Garage)
    expect(await withTicketClosing(900, async () => 'again')).toBe('again');
  });

  it('libère le ticket même si la fermeture lève une erreur', async () => {
    await expect(
      withTicketClosing(902, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await withTicketClosing(902, async () => 'ok')).toBe('ok');
  });
});
