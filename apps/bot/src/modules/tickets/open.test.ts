import {
  ChannelType,
  ComponentType,
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { createOpenTicketHandlers, OPEN_REPLIES } from './open.js';

const database = vi.hoisted(() => ({
  closeTicket: vi.fn(),
  createTicket: vi.fn(),
  findOpenTicket: vi.fn(),
  findTicketType: vi.fn(),
  listTicketTypes: vi.fn(),
  reserveTicketNumber: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const CATEGORY = '100000000000000002';
const STAFF = '300000000000000001';
const OWNER = '200000000000000001';
const SECRET = 'réponse très personnelle';

const question = (id: number, label: string, required = true) => ({
  id,
  label,
  placeholder: null,
  style: 'SHORT' as const,
  required,
  maxLength: 100,
  position: id,
});

/** Un type sans question : le salon s'ouvre tout de suite. */
const plainType = {
  id: 1,
  guildId: GUILD,
  name: 'Support',
  description: null,
  emoji: null,
  categoryId: CATEGORY,
  // Le second rôle a été supprimé sur Discord depuis le réglage
  staffRoleIds: [STAFF, '300000000000000099'],
  position: 0,
  questions: [],
};

/** Un type avec formulaire : il faut le remplir avant d'avoir un salon. */
const formType = {
  ...plainType,
  id: 2,
  name: 'Recrutement',
  questions: [question(11, 'Pseudo'), question(12, 'Détails', false)],
};

function fakeGuild(categoryType = ChannelType.GuildCategory, channels: string[] = []) {
  const channel = {
    id: '400000000000000001',
    send: vi.fn(async (_payload: unknown) => ({})),
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
      create: vi.fn(async (_options: unknown) => channel),
    },
    roles: { cache: new Map([[STAFF, {}]]), everyone: { id: GUILD } },
  };
  return { guild, channel };
}

interface FakeOptions {
  categoryType?: ChannelType;
  channels?: string[];
  fields?: [string, string][];
  values?: string[];
  /** Le message portant le composant : le menu des types (éphémère) ou le panneau (public) */
  message?: 'menu' | 'panel';
}

function fakeInteraction({
  categoryType,
  channels,
  fields = [],
  values,
  message = 'panel',
}: FakeOptions = {}) {
  const { guild, channel } = fakeGuild(categoryType, channels);
  return {
    isButton: () => values === undefined && fields.length === 0,
    isStringSelectMenu: () => values !== undefined,
    isModalSubmit: () => fields.length > 0,
    isFromMessage: () => true,
    message: {
      flags: { has: (flag: MessageFlags) => message === 'menu' && flag === MessageFlags.Ephemeral },
    },
    inCachedGuild: () => true,
    guildId: GUILD,
    guild,
    user: { id: OWNER },
    member: { id: OWNER, displayName: 'Agent', user: { tag: 'agent' } },
    client: { user: { id: '500000000000000001' } },
    values,
    fields: {
      fields: new Map(
        fields.map(([customId, value]) => [
          customId,
          { customId, value, type: ComponentType.TextInput },
        ]),
      ),
    },
    reply: vi.fn(async (_payload: unknown) => {}),
    showModal: vi.fn(async (_modal: unknown) => {}),
    deferReply: vi.fn(async (_options?: unknown) => {}),
    deferUpdate: vi.fn(async () => {}),
    editReply: vi.fn(async (_payload: unknown) => {}),
    channel,
  };
}
type Fake = ReturnType<typeof fakeInteraction>;

function setup() {
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as BotContext;
  const [open, choose, form] = createOpenTicketHandlers();
  const run =
    (handler: typeof open, id?: string) =>
    (interaction: Fake, customIdArg: string | undefined = id) =>
      handler!.execute(
        interaction as unknown as MessageComponentInteraction | ModalSubmitInteraction,
        customIdArg,
        context,
      );
  return {
    context,
    clickType: (interaction: Fake, id = '1') => run(open)(interaction, id),
    clickLegacy: (interaction: Fake) => run(open)(interaction, undefined),
    choose: (interaction: Fake) => run(choose)(interaction, undefined),
    submit: (interaction: Fake, id = '2') => run(form)(interaction, id),
  };
}

const lastText = (mock: { mock: { calls: unknown[][] } }) => {
  const arg = mock.mock.calls.at(-1)?.[0];
  return typeof arg === 'string' ? arg : (arg as { content?: string } | undefined)?.content;
};

beforeEach(() => {
  vi.clearAllMocks();
  database.findOpenTicket.mockResolvedValue(null);
  database.findTicketType.mockImplementation(async (_db: unknown, id: number) =>
    [plainType, formType].find((type) => type.id === id),
  );
  database.listTicketTypes.mockResolvedValue([plainType, formType]);
  database.reserveTicketNumber.mockResolvedValue(42);
  database.createTicket.mockImplementation(async (_db: unknown, data: object) => ({
    ...data,
    id: 7,
  }));
});

describe('le bouton unique « Ouvrir un ticket »', () => {
  it('propose le menu des types, en réponse visible de lui seul, sans salon ni formulaire', async () => {
    const { clickLegacy } = setup();
    const interaction = fakeInteraction();

    await clickLegacy(interaction);

    expect(database.listTicketTypes).toHaveBeenCalledWith({}, GUILD);
    const reply = interaction.reply.mock.calls[0]?.[0] as {
      content: string;
      flags: number;
      components: { toJSON(): { components: { custom_id: string; options: unknown[] }[] } }[];
    };
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    const menu = reply.components[0]?.toJSON().components[0];
    expect(menu?.custom_id).toBe('ticket:choose');
    expect(menu?.options).toHaveLength(2);
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('ouvre tout de suite le type unique d’un serveur qui n’en a qu’un, sans menu', async () => {
    database.listTicketTypes.mockResolvedValue([plainType]);
    const { clickLegacy } = setup();
    const interaction = fakeInteraction();

    await clickLegacy(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(database.createTicket).toHaveBeenCalledWith({}, expect.objectContaining({ typeId: 1 }));
  });

  it('montre le formulaire du type unique quand il a des questions', async () => {
    database.listTicketTypes.mockResolvedValue([formType]);
    const { clickLegacy } = setup();
    const interaction = fakeInteraction();

    await clickLegacy(interaction);

    expect(interaction.showModal).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('ne montre pas le formulaire du type unique à qui a déjà un ticket ouvert', async () => {
    database.listTicketTypes.mockResolvedValue([formType]);
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { clickLegacy } = setup();
    const interaction = fakeInteraction({ channels: ['400000000000000009'] });

    await clickLegacy(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(lastText(interaction.reply)).toBe('Tu as déjà un ticket ouvert : <#400000000000000009>');
  });

  it('le type choisi dans le menu ouvre le salon d’un type sans question', async () => {
    const { choose } = setup();
    const interaction = fakeInteraction({ values: ['1'] });

    await choose(interaction);

    expect(database.createTicket).toHaveBeenCalledWith({}, expect.objectContaining({ typeId: 1 }));
  });
});

describe('le menu des types est remplacé par le résultat', () => {
  const lastReply = (interaction: Fake) =>
    interaction.editReply.mock.calls.at(-1)?.[0] as { content: string; components: unknown[] };

  it('un type sans question choisi dans le menu éphémère remplace le menu par le salon', async () => {
    const { choose } = setup();
    const interaction = fakeInteraction({ values: ['1'], message: 'menu' });

    await choose(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(lastReply(interaction)).toEqual({
      content: 'Ton ticket est ouvert : <#400000000000000001>',
      components: [],
    });
  });

  it('le formulaire envoyé depuis le menu éphémère remplace le menu par le salon', async () => {
    const { submit } = setup();
    const interaction = fakeInteraction({ fields: [['11', 'Alex']], message: 'menu' });

    await submit(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(lastReply(interaction)).toEqual({
      content: 'Ton ticket est ouvert : <#400000000000000001>',
      components: [],
    });
  });

  it('un message d’erreur du formulaire remplace aussi le menu', async () => {
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { submit } = setup();
    const interaction = fakeInteraction({
      fields: [['11', 'Alex']],
      channels: ['400000000000000009'],
      message: 'menu',
    });

    await submit(interaction);

    expect(lastReply(interaction)).toEqual({
      content: 'Tu as déjà un ticket ouvert : <#400000000000000009>',
      components: [],
    });
  });

  it('ne touche jamais au message public du panneau : réponse à part, éphémère', async () => {
    const { choose, submit } = setup();
    const picked = fakeInteraction({ values: ['1'], message: 'panel' });
    const sent = fakeInteraction({ fields: [['11', 'Alex']], message: 'panel' });

    await choose(picked);
    await submit(sent);

    for (const interaction of [picked, sent]) {
      expect(interaction.deferUpdate).not.toHaveBeenCalled();
      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    }
  });
});

describe('ouvrir un ticket d’un type sans question', () => {
  it('crée un salon privé dans la catégorie du type, l’enregistre et y accueille l’auteur', async () => {
    const { clickType } = setup();
    const interaction = fakeInteraction();

    await clickType(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket-0042',
        type: ChannelType.GuildText,
        parent: CATEGORY,
      }),
    );
    const options = interaction.guild.channels.create.mock.calls[0] as unknown as [
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
      expect.objectContaining({ number: 42, ownerId: OWNER, ownerName: 'Agent', typeId: 1 }),
    );
    const welcome = interaction.channel.send.mock.calls[0]?.[0] as {
      content: string;
      embeds: { toJSON(): { fields: { value: string }[] } }[];
    };
    expect(welcome.content).toBe(`<@${OWNER}> <@&${STAFF}>`);
    expect(welcome.embeds[0]?.toJSON().fields[0]?.value).toBe('Support');
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    expect(lastText(interaction.editReply)).toBe('Ton ticket est ouvert : <#400000000000000001>');
  });

  it('refuse d’ouvrir un ticket si le serveur n’a aucun type', async () => {
    database.listTicketTypes.mockResolvedValue([]);
    const { clickLegacy } = setup();
    const interaction = fakeInteraction();

    await clickLegacy(interaction);

    expect(lastText(interaction.reply)).toBe(OPEN_REPLIES.notConfigured);
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('dit clairement que le type a été supprimé, ou qu’il vient d’un autre serveur', async () => {
    const { clickType } = setup();

    for (const found of [null, { ...plainType, guildId: '100000000000000999' }]) {
      database.findTicketType.mockResolvedValue(found);
      const interaction = fakeInteraction();

      await clickType(interaction);

      expect(lastText(interaction.reply)).toBe(OPEN_REPLIES.typeGone);
      expect(interaction.guild.channels.create).not.toHaveBeenCalled();
      expect(interaction.showModal).not.toHaveBeenCalled();
    }
  });

  it('refuse tant que la catégorie du type n’existe plus', async () => {
    const { clickType } = setup();
    const interaction = fakeInteraction({ categoryType: ChannelType.GuildText });

    await clickType(interaction);

    expect(lastText(interaction.reply)).toBe(OPEN_REPLIES.notConfigured);
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('renvoie vers le ticket déjà ouvert, sans rien créer', async () => {
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { clickType } = setup();
    const interaction = fakeInteraction({ channels: ['400000000000000009'] });

    await clickType(interaction);

    expect(lastText(interaction.reply)).toBe('Tu as déjà un ticket ouvert : <#400000000000000009>');
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('ferme l’ancien ticket dont le salon a disparu, puis en ouvre un neuf', async () => {
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { clickType } = setup();
    const interaction = fakeInteraction();

    await clickType(interaction);

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
    const { clickType } = setup();
    const first = fakeInteraction();
    const second = fakeInteraction();

    const pending = clickType(first);
    await vi.waitFor(() => expect(database.reserveTicketNumber).toHaveBeenCalled());
    await clickType(second);
    release?.();
    await pending;

    expect(lastText(second.reply)).toBe(OPEN_REPLIES.inProgress);
    expect(first.guild.channels.create).toHaveBeenCalledTimes(1);
    expect(second.guild.channels.create).not.toHaveBeenCalled();
  });

  it('explique le droit manquant quand Discord refuse le salon', async () => {
    const { clickType } = setup();
    const interaction = fakeInteraction();
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

    await clickType(interaction);

    expect(lastText(interaction.editReply)).toBe(OPEN_REPLIES.missingPermissions);
  });

  it('supprime le salon si le ticket ne peut pas être enregistré', async () => {
    database.createTicket.mockRejectedValue(new Error('base indisponible'));
    const { clickType } = setup();
    const interaction = fakeInteraction();

    await expect(clickType(interaction)).rejects.toThrow('base indisponible');
    expect(interaction.channel.delete).toHaveBeenCalled();
  });
});

describe('ouvrir un ticket d’un type avec formulaire', () => {
  it('montre le formulaire comme première réponse, sans différer ni créer de salon', async () => {
    const { clickType } = setup();
    const interaction = fakeInteraction();

    await clickType(interaction, '2');

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
    const modal = interaction.showModal.mock.calls[0]?.[0] as {
      toJSON(): { custom_id: string; components: unknown[] };
    };
    expect(modal.toJSON()).toMatchObject({ custom_id: 'ticket:form:2' });
    expect(modal.toJSON().components).toHaveLength(2);
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
    expect(database.createTicket).not.toHaveBeenCalled();
  });

  it('ne montre pas le formulaire à qui a déjà un ticket ouvert', async () => {
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { clickType } = setup();
    const interaction = fakeInteraction({ channels: ['400000000000000009'] });

    await clickType(interaction, '2');

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(lastText(interaction.reply)).toBe('Tu as déjà un ticket ouvert : <#400000000000000009>');
  });

  it('le menu de choix ouvre le type choisi', async () => {
    const { choose } = setup();
    const interaction = fakeInteraction({ values: ['2'] });

    await choose(interaction);

    expect(database.findTicketType).toHaveBeenCalledWith({}, 2);
    expect(interaction.showModal).toHaveBeenCalled();
  });

  it('le menu de choix signale un type supprimé', async () => {
    database.findTicketType.mockResolvedValue(null);
    const { choose } = setup();
    const interaction = fakeInteraction({ values: ['2'] });

    await choose(interaction);

    expect(lastText(interaction.reply)).toBe(OPEN_REPLIES.typeGone);
    expect(interaction.showModal).not.toHaveBeenCalled();
  });
});

describe('envoi du formulaire', () => {
  const answers: [string, string][] = [
    ['11', SECRET],
    ['12', ''],
  ];

  it('crée le salon, poste l’accueil puis les réponses, et ne garde les réponses nulle part ailleurs', async () => {
    const { submit, context } = setup();
    const interaction = fakeInteraction({ fields: answers });

    await submit(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(database.createTicket).toHaveBeenCalledWith(
      {},
      {
        guildId: GUILD,
        number: 42,
        channelId: '400000000000000001',
        ownerId: OWNER,
        ownerName: 'Agent',
        typeId: 2,
      },
    );
    expect(interaction.channel.send).toHaveBeenCalledTimes(2);
    const [welcome, replies] = interaction.channel.send.mock.calls.map((call) => call[0]) as [
      { components: unknown[] },
      {
        embeds: { toJSON(): { title: string; description: string } }[];
        allowedMentions: object;
      },
    ];
    expect(welcome.components).toHaveLength(1);
    expect(replies.allowedMentions).toEqual({ parse: [] });
    expect(replies.embeds.map((embed) => embed.toJSON())).toMatchObject([
      { title: 'Pseudo', description: SECRET },
      { title: 'Détails', description: '*Pas de réponse*' },
    ]);
    // Ni en base, ni dans les logs
    expect(JSON.stringify(database.createTicket.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(context.logger.info).mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(context.logger.warn).mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(context.logger.error).mock.calls)).not.toContain(SECRET);
    expect(lastText(interaction.editReply)).toBe('Ton ticket est ouvert : <#400000000000000001>');
  });

  it('garde la réponse d’une question supprimée depuis l’affichage du formulaire', async () => {
    const { submit } = setup();
    const interaction = fakeInteraction({
      fields: [
        ['11', 'Phénix'],
        ['99', 'Orpheline'],
      ],
    });

    await submit(interaction);

    const replies = interaction.channel.send.mock.calls[1]?.[0] as {
      embeds: { toJSON(): { title: string } }[];
    };
    expect(replies.embeds.map((embed) => embed.toJSON().title)).toEqual([
      'Pseudo',
      'Question supprimée',
    ]);
  });

  it('revérifie le ticket déjà ouvert à l’envoi', async () => {
    database.findOpenTicket.mockResolvedValue({ id: 3, channelId: '400000000000000009' });
    const { submit } = setup();
    const interaction = fakeInteraction({ fields: answers, channels: ['400000000000000009'] });

    await submit(interaction);

    expect(lastText(interaction.editReply)).toBe(
      'Tu as déjà un ticket ouvert : <#400000000000000009>',
    );
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
    expect(database.createTicket).not.toHaveBeenCalled();
  });

  it('dit que le type a été supprimé pendant que le formulaire était rempli', async () => {
    database.findTicketType.mockResolvedValue(null);
    const { submit } = setup();
    const interaction = fakeInteraction({ fields: answers });

    await submit(interaction);

    expect(lastText(interaction.editReply)).toBe(OPEN_REPLIES.typeGone);
    expect(interaction.guild.channels.create).not.toHaveBeenCalled();
  });

  it('ignore le double envoi tant que le premier crée le salon', async () => {
    let release: (() => void) | undefined;
    database.reserveTicketNumber.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(42);
      }),
    );
    const { submit } = setup();
    const first = fakeInteraction({ fields: answers });
    const second = fakeInteraction({ fields: answers });

    const pending = submit(first);
    await vi.waitFor(() => expect(database.reserveTicketNumber).toHaveBeenCalled());
    await submit(second);
    release?.();
    await pending;

    expect(lastText(second.reply)).toBe(OPEN_REPLIES.inProgress);
    expect(first.guild.channels.create).toHaveBeenCalledTimes(1);
    expect(second.guild.channels.create).not.toHaveBeenCalled();
  });

  it('supprime le salon si les réponses ne peuvent pas être postées', async () => {
    const { submit } = setup();
    const interaction = fakeInteraction({ fields: answers });
    interaction.channel.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Discord indisponible'));

    await expect(submit(interaction)).rejects.toThrow('Discord indisponible');
    expect(interaction.channel.delete).toHaveBeenCalled();
  });
});
