import { MessageFlags, PermissionsBitField, type MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { CLAIM_REPLIES, createClaimHandler } from './claim.js';

const database = vi.hoisted(() => ({
  claimTicket: vi.fn(),
  findTicket: vi.fn(),
  findTicketType: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CHANNEL = '400000000000000001';
const OWNER = '200000000000000001';
const STAFF = '300000000000000001';
const STAFF_MEMBER = '200000000000000002';

const ticket = {
  id: 7,
  guildId: GUILD,
  number: 42,
  channelId: CHANNEL,
  ownerId: OWNER,
  typeId: 3,
  status: 'OPEN',
};

function fakeButton({
  memberId = STAFF_MEMBER,
  roles = [STAFF] as string[],
  channelId = CHANNEL,
} = {}) {
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    channelId,
    channel: { send: vi.fn(async (_payload: unknown) => ({})) },
    member: {
      id: memberId,
      displayName: 'Modo',
      roles: { cache: new Map(roles.map((role) => [role, {}])) },
      // « Gérer les salons » ne suffit pas : seule l'équipe du type prend en charge
      permissions: new PermissionsBitField(PermissionsBitField.All),
    },
    reply: vi.fn(async (_payload: unknown) => {}),
    update: vi.fn(async (_payload: unknown) => {}),
  };
}

function setup() {
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as BotContext;
  const [handler] = createClaimHandler();
  const claim = (interaction: ReturnType<typeof fakeButton>, id: string | undefined = '7') =>
    handler!.execute(interaction as unknown as MessageComponentInteraction, id, context);
  return { context, claim, handler: handler! };
}

const replied = (interaction: ReturnType<typeof fakeButton>) =>
  interaction.reply.mock.calls.at(-1)?.[0] as { content: string; flags: unknown } | undefined;

beforeEach(() => {
  database.findTicket.mockReset().mockResolvedValue(ticket as never);
  database.findTicketType.mockReset().mockResolvedValue({
    id: 3,
    guildId: GUILD,
    staffRoleIds: [STAFF],
  } as never);
  database.claimTicket.mockReset().mockResolvedValue({ claimed: true });
});

describe('prendre en charge un ticket', () => {
  it('écoute le préfixe ticket:claim', () => {
    expect(setup().handler.prefix).toBe('ticket:claim');
  });

  it('le gagnant prend le ticket, annonce sans mention et retire le bouton', async () => {
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(database.claimTicket).toHaveBeenCalledWith({}, 7, { id: STAFF_MEMBER, name: 'Modo' });
    const update = interaction.update.mock.calls[0]?.[0] as {
      components: { toJSON(): { components: { custom_id: string }[] } }[];
    };
    expect(update.components).toHaveLength(1);
    expect(update.components[0]?.toJSON().components.map((button) => button.custom_id)).toEqual([
      'ticket:close:7',
    ]);
    expect(interaction.channel.send).toHaveBeenCalledWith({
      content: 'Modo prend en charge ce ticket.',
      allowedMentions: { parse: [] },
    });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('neutralise la mise en forme et les mentions d’un pseudo', async () => {
    const { claim } = setup();
    const interaction = fakeButton();
    interaction.member.displayName = '**@everyone**';

    await claim(interaction);

    const payload = interaction.channel.send.mock.calls[0]?.[0] as {
      content: string;
      allowedMentions: unknown;
    };
    expect(payload.content).toBe('\\*\\*@everyone\\*\\* prend en charge ce ticket.');
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  it('neutralise un titre et un lien masqué dans le pseudo de l’annonce', async () => {
    const { claim } = setup();
    const interaction = fakeButton();
    interaction.member.displayName = '# [Staff](https://evil.tld)';

    await claim(interaction);

    const payload = interaction.channel.send.mock.calls[0]?.[0] as { content: string };
    expect(payload.content).toBe('\\# \\[Staff](https://evil.tld) prend en charge ce ticket.');
  });

  it('neutralise un titre et un lien masqué dans le pseudo de qui a déjà pris le ticket', () => {
    expect(CLAIM_REPLIES.claimedBy('# [Staff](https://evil.tld)')).toBe(
      'Ce ticket est déjà pris en charge par \\# \\[Staff](https://evil.tld).',
    );
  });

  it('le perdant apprend qui a pris le ticket, sans rien poster', async () => {
    database.claimTicket.mockResolvedValue({ claimed: false, claimedByName: 'Autre modo' });
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(replied(interaction)).toEqual({
      content: 'Ce ticket est déjà pris en charge par Autre modo.',
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.channel.send).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('un ticket fermé entre-temps (pas de pseudo) répond qu’il est fermé', async () => {
    database.claimTicket.mockResolvedValue({ claimed: false, claimedByName: null });
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(replied(interaction)).toEqual({
      content: CLAIM_REPLIES.stale,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('refuse l’auteur du ticket, même s’il a un rôle de l’équipe', async () => {
    const { claim } = setup();
    const interaction = fakeButton({ memberId: OWNER, roles: [STAFF] });

    await claim(interaction);

    expect(replied(interaction)).toEqual({
      content: CLAIM_REPLIES.owner,
      flags: MessageFlags.Ephemeral,
    });
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it('refuse qui n’est pas de l’équipe du type, même avec « Gérer les salons »', async () => {
    const { claim } = setup();
    const interaction = fakeButton({ roles: ['300000000000000002'] });

    await claim(interaction);

    expect(replied(interaction)).toEqual({
      content: CLAIM_REPLIES.denied,
      flags: MessageFlags.Ephemeral,
    });
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it('ignore l’équipe d’un type qui appartient à un autre serveur', async () => {
    database.findTicketType.mockResolvedValue({
      id: 3,
      guildId: '100000000000000099',
      staffRoleIds: [STAFF],
    } as never);
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(replied(interaction)?.content).toBe(CLAIM_REPLIES.denied);
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it('un ticket sans type n’a pas d’équipe : personne ne le prend en charge', async () => {
    database.findTicket.mockResolvedValue({ ...ticket, typeId: null } as never);
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(replied(interaction)?.content).toBe(CLAIM_REPLIES.denied);
    expect(database.findTicketType).not.toHaveBeenCalled();
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it.each([
    ['inconnu', null],
    ['fermé', { ...ticket, status: 'CLOSED' }],
    ['d’un autre serveur', { ...ticket, guildId: '100000000000000099' }],
    ['d’un autre salon', { ...ticket, channelId: '400000000000000099' }],
  ])('refuse un ticket %s', async (_name, found) => {
    database.findTicket.mockResolvedValue(found as never);
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(replied(interaction)).toEqual({
      content: CLAIM_REPLIES.stale,
      flags: MessageFlags.Ephemeral,
    });
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it('un échec de l’annonce dans le salon ne défait pas la prise en charge et ne journalise aucun pseudo', async () => {
    const { claim, context } = setup();
    const interaction = fakeButton();
    interaction.channel.send.mockRejectedValue(new Error('Missing Permissions'));

    await claim(interaction);

    expect(interaction.update).toHaveBeenCalled();
    const logged = JSON.stringify([
      (context.logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      (context.logger.info as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(logged).not.toContain('Modo');
    expect(logged).not.toContain(STAFF_MEMBER);
  });

  it('un échec de l’annonce journalise l’identifiant du ticket', async () => {
    const { claim, context } = setup();
    const interaction = fakeButton();
    const failure = new Error('Missing Permissions');
    interaction.channel.send.mockRejectedValue(failure);

    await claim(interaction);

    expect(context.logger.warn).toHaveBeenCalledTimes(1);
    expect(context.logger.warn).toHaveBeenCalledWith(
      { err: failure, ticketId: 7 },
      'Annonce de la prise en charge impossible',
    );
  });

  it('sans salon en cache, la prise en charge est faite et rien n’échoue', async () => {
    const { claim, context } = setup();
    const interaction = { ...fakeButton(), channel: null };

    await expect(claim(interaction as never)).resolves.toBeUndefined();

    expect(database.claimTicket).toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalled();
    expect(context.logger.warn).not.toHaveBeenCalled();
  });

  it('message d’accueil supprimé : la prise en charge reste, journalisée sans pseudo, sans erreur pour le membre', async () => {
    const { claim, context } = setup();
    const interaction = fakeButton();
    const failure = new Error('Unknown Message');
    interaction.update.mockRejectedValue(failure);

    await expect(claim(interaction)).resolves.toBeUndefined();

    expect(database.claimTicket).toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      { err: failure, ticketId: 7 },
      'Retrait du bouton « Prendre en charge » impossible',
    );
    // L'annonce dans le salon a toujours lieu, et aucune réponse d'erreur n'est envoyée
    expect(interaction.channel.send).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
    const logged = JSON.stringify(
      (context.logger.warn as ReturnType<typeof vi.fn>).mock.calls.map(([fields, message]) => [
        { ...(fields as object), err: undefined },
        message,
      ]),
    );
    expect(logged).not.toContain('Modo');
    expect(logged).not.toContain(STAFF_MEMBER);
  });

  it('accepte un membre qui n’a que le second rôle d’une équipe à deux rôles', async () => {
    database.findTicketType.mockResolvedValue({
      id: 3,
      guildId: GUILD,
      staffRoleIds: ['300000000000000009', STAFF],
    } as never);
    const { claim } = setup();
    const interaction = fakeButton({ roles: [STAFF] });

    await claim(interaction);

    expect(database.claimTicket).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('un type disparu (findTicketType null) n’a plus d’équipe : refusé', async () => {
    database.findTicketType.mockResolvedValue(null as never);
    const { claim } = setup();
    const interaction = fakeButton();

    await claim(interaction);

    expect(database.findTicketType).toHaveBeenCalledWith({}, 3);
    expect(replied(interaction)?.content).toBe(CLAIM_REPLIES.denied);
    expect(database.claimTicket).not.toHaveBeenCalled();
  });

  it.each([
    ['ce qui n’est pas un bouton', { isButton: () => false }],
    ['un serveur absent du cache', { inCachedGuild: () => false }],
  ])('ignore %s : ni base ni réponse', async (_name, override) => {
    const { claim } = setup();
    const interaction = { ...fakeButton(), ...override };

    await claim(interaction);

    expect(database.findTicket).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', '7.5', '-7', '0', '1e3', '2147483648', '99999999999'])(
    'un identifiant forgé (%s) répond « fermé » sans lire la base',
    async (id) => {
      const { claim } = setup();
      const interaction = fakeButton();

      await claim(interaction, id);

      expect(database.findTicket).not.toHaveBeenCalled();
      expect(replied(interaction)).toEqual({
        content: CLAIM_REPLIES.stale,
        flags: MessageFlags.Ephemeral,
      });
    },
  );

  it('accepte le plus grand identifiant d’une colonne Int (2147483647)', async () => {
    const { claim } = setup();

    await claim(fakeButton(), '2147483647');

    expect(database.findTicket).toHaveBeenCalledWith({}, 2_147_483_647);
  });
});
