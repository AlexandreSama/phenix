import type { GuildMember, PartialGuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { GuildSettings } from '../../core/guild-config-cache.js';
import {
  createMemberAddHandler,
  createMemberRemoveHandler,
  createMemberUpdateHandler,
  createWelcomeDeps,
} from './member-events.js';
import { MEMBER_ID, PSEUDO, captureLogger, discordErrorWithMemberData } from './test-fixtures.js';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';
const WELCOME_CHANNEL = '300000000000000001';
const GOODBYE_CHANNEL = '300000000000000002';
const ROLE = '500000000000000001';
const BOT_ID = '900000000000000001';
const USER_PSEUDO = 'Pseudo Global';

const settings = {
  welcomeEnabled: true,
  welcomeChannelId: WELCOME_CHANNEL,
  welcomeMessage: null,
  welcomeRoleId: ROLE,
  goodbyeEnabled: true,
  goodbyeChannelId: GOODBYE_CHANNEL,
  goodbyeMessage: null,
} as GuildSettings;

function fakeChannel(id: string, sendable = true) {
  return { id, isSendable: () => sendable, send: vi.fn().mockResolvedValue(undefined) };
}

function fakeGuild(
  id = GUILD,
  channels = [fakeChannel(WELCOME_CHANNEL), fakeChannel(GOODBYE_CHANNEL)],
) {
  return {
    id,
    name: 'Les Agents',
    memberCount: 42,
    channels: { cache: new Map(channels.map((channel) => [channel.id, channel])) },
    roles: {
      cache: new Map([
        [ROLE, { id: ROLE, editable: true, managed: false, permissions: { bitfield: 0n } }],
      ]),
    },
    members: { me: { permissions: { has: () => true } } },
  };
}

type FakeGuild = ReturnType<typeof fakeGuild>;

function fakeMember({
  id = MEMBER_ID,
  guild = fakeGuild(),
  bot = false,
  pending = false as boolean | null,
  partial = false,
  roleIds = [] as string[],
} = {}) {
  return {
    id,
    partial,
    pending,
    displayName: partial ? 'Surnom inconnu' : PSEUDO,
    displayAvatarURL: () => 'https://cdn/member.png',
    user: {
      id,
      bot,
      displayName: USER_PSEUDO,
      displayAvatarURL: () => 'https://cdn/user.png',
    },
    guild,
    roles: { cache: new Set(roleIds), add: vi.fn().mockResolvedValue(undefined) },
    client: { user: { id: BOT_ID } },
  };
}

type FakeMember = ReturnType<typeof fakeMember>;

function setup(config: GuildSettings | null = settings) {
  let time = 0;
  const { logger, lines } = captureLogger();
  const configs = { get: vi.fn().mockResolvedValue(config) };
  const deps = createWelcomeDeps({ configs, logger, now: () => time });
  const add = createMemberAddHandler(deps);
  const remove = createMemberRemoveHandler(deps);
  const update = createMemberUpdateHandler(deps);
  return {
    deps,
    configs,
    lines,
    advance: (ms: number) => (time += ms),
    join: (member: FakeMember) => add(member as unknown as GuildMember),
    leave: (member: FakeMember) => remove(member as unknown as GuildMember | PartialGuildMember),
    change: (old: FakeMember, next: FakeMember) =>
      update(old as unknown as GuildMember | PartialGuildMember, next as unknown as GuildMember),
    /** Attend la fin des ajouts de rôle en file */
    settle: () => deps.roles.idle(),
  };
}

const sendOf = (guild: FakeGuild, channelId: string) => guild.channels.cache.get(channelId)!.send;

/** Aucune ligne de log ne nomme le membre (RGPD : point de sécurité 1 et 9). */
function expectNoMemberData(lines: string[], ...ids: string[]) {
  for (const line of lines) {
    for (const secret of [MEMBER_ID, PSEUDO, USER_PSEUDO, ...ids]) {
      expect(line).not.toContain(secret);
    }
  }
}

describe('arrivée d’un membre', () => {
  it('annonce l’arrivée et donne le rôle quand la vérification Discord est déjà passée', async () => {
    const { join, settle, lines } = setup();
    const member = fakeMember();

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).toHaveBeenCalledWith(
      expect.objectContaining({
        content: `<@${MEMBER_ID}>`,
        allowedMentions: { users: [MEMBER_ID] },
      }),
    );
    expect(member.roles.add).toHaveBeenCalledWith(
      member.guild.roles.cache.get(ROLE),
      "Rôle d'arrivée",
    );
    expect(lines).toEqual([]);
  });

  it('annonce tout de suite mais attend la vérification (pending) pour le rôle', async () => {
    const { join, settle } = setup();
    const member = fakeMember({ pending: true });

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).toHaveBeenCalledOnce();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('ne fait rien sans config, ni sans message d’arrivée activé ni rôle choisi', async () => {
    for (const config of [null, { ...settings, welcomeEnabled: false, welcomeRoleId: null }]) {
      const { join, settle } = setup(config);
      const member = fakeMember();

      await join(member);
      await settle();

      expect(sendOf(member.guild, WELCOME_CHANNEL)).not.toHaveBeenCalled();
      expect(member.roles.add).not.toHaveBeenCalled();
    }
  });

  it('le rôle d’arrivée ne dépend pas du message : message désactivé, rôle quand même donné', async () => {
    const { join, settle, lines } = setup({ ...settings, welcomeEnabled: false });
    const member = fakeMember();

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).not.toHaveBeenCalled();
    expect(member.roles.add).toHaveBeenCalledWith(
      member.guild.roles.cache.get(ROLE),
      "Rôle d'arrivée",
    );
    expect(lines).toEqual([]);
  });

  it('message activé sans rôle choisi : le message part, aucun rôle', async () => {
    const { join, settle } = setup({ ...settings, welcomeRoleId: null });
    const member = fakeMember();

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).toHaveBeenCalledOnce();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('message désactivé et vérification Discord en cours : ni message ni rôle', async () => {
    const { join, settle } = setup({ ...settings, welcomeEnabled: false });
    const member = fakeMember({ pending: true });

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('ignore les bots', async () => {
    const { join, settle, configs } = setup();
    const member = fakeMember({ bot: true });

    await join(member);
    await settle();

    expect(configs.get).not.toHaveBeenCalled();
    expect(sendOf(member.guild, WELCOME_CHANNEL)).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('salon supprimé ou non envoyable : avertit sans planter, le rôle est quand même donné', async () => {
    for (const channels of [[], [fakeChannel(WELCOME_CHANNEL, false)]]) {
      const { join, settle, lines } = setup();
      const member = fakeMember({ guild: fakeGuild(GUILD, channels) });

      await expect(join(member)).resolves.toBeUndefined();
      await settle();

      expect(member.roles.add).toHaveBeenCalledOnce();
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        level: 40,
        guildId: GUILD,
        channelId: WELCOME_CHANNEL,
      });
      expectNoMemberData(lines);
    }
  });

  it('envoi refusé par Discord : avertit avec code et statut, sans l’ID ni le pseudo', async () => {
    const { join, settle, lines } = setup();
    const member = fakeMember();
    sendOf(member.guild, WELCOME_CHANNEL).mockRejectedValue(discordErrorWithMemberData());

    await expect(join(member)).resolves.toBeUndefined();
    await settle();

    expect(member.roles.add).toHaveBeenCalledOnce();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 40,
      code: 50013,
      status: 403,
      guildId: GUILD,
      channelId: WELCOME_CHANNEL,
    });
    expect(lines[0]).not.toContain('"err"');
    expectNoMemberData(lines);
  });

  it('rôle refusé par Discord : le message part quand même, le log ne nomme pas le membre', async () => {
    const { join, settle, lines } = setup();
    const member = fakeMember();
    member.roles.add.mockRejectedValue(discordErrorWithMemberData());

    await join(member);
    await settle();

    expect(sendOf(member.guild, WELCOME_CHANNEL)).toHaveBeenCalledOnce();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ code: 50013, guildId: GUILD, roleId: ROLE });
    expectNoMemberData(lines);
  });

  it('texte rendu trop long (émojis) : le message part quand même, coupé à la limite de discord.js', async () => {
    // 5000 émojis = 10 000 unités UTF-16, or discord.js limite la description à 4096 unités
    const { join, settle, lines } = setup({ ...settings, welcomeMessage: '{serveur}'.repeat(100) });
    const guild = { ...fakeGuild(), name: '😀'.repeat(50) };
    const member = fakeMember({ guild });

    await join(member);
    await settle();

    const send = sendOf(guild, WELCOME_CHANNEL);
    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0] as {
      embeds: { toJSON(): { description?: string } }[];
    };
    const description = payload.embeds[0]!.toJSON().description ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(member.roles.add).toHaveBeenCalledOnce();
    expect(lines).toEqual([]);
  });

  it('lecture de la config ratée : erreur journalisée, sans planter ni nommer le membre', async () => {
    const { join, configs, lines } = setup();
    configs.get.mockRejectedValue(Object.assign(new Error(`boom ${MEMBER_ID}`), { code: 'P1001' }));

    await expect(join(fakeMember())).resolves.toBeUndefined();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 50, guildId: GUILD, code: 'P1001' });
    expectNoMemberData(lines);
  });

  it('anti-raid : 10 messages par minute et par serveur, un seul avertissement, le rôle reste donné', async () => {
    const { join, settle, lines } = setup();
    const guild = fakeGuild();
    const members = Array.from({ length: 12 }, (_, index) =>
      fakeMember({ id: `2000000000000001${String(index).padStart(2, '0')}`, guild }),
    );

    for (const member of members) await join(member);
    await settle();

    expect(sendOf(guild, WELCOME_CHANNEL)).toHaveBeenCalledTimes(10);
    expect(members.every((member) => member.roles.add.mock.calls.length === 1)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 40, guildId: GUILD });
    expectNoMemberData(lines, ...members.map((member) => member.id));
  });

  it('anti-raid : chaque serveur a sa propre limite', async () => {
    const { join } = setup();
    const first = fakeGuild(GUILD);
    const second = fakeGuild(OTHER_GUILD);

    for (let index = 0; index < 10; index++) {
      await join(fakeMember({ id: `20000000000000010${index}`, guild: first }));
    }
    await join(fakeMember({ id: '200000000000000200', guild: second }));

    expect(sendOf(first, WELCOME_CHANNEL)).toHaveBeenCalledTimes(10);
    expect(sendOf(second, WELCOME_CHANNEL)).toHaveBeenCalledOnce();
  });

  it('un membre qui revient dans les 10 minutes n’est annoncé qu’une fois, sans log', async () => {
    const { join, settle, advance, lines } = setup();
    const guild = fakeGuild();

    await join(fakeMember({ guild }));
    advance(9 * 60_000);
    await join(fakeMember({ guild }));
    advance(60_000);
    await join(fakeMember({ guild }));
    await settle();

    expect(sendOf(guild, WELCOME_CHANNEL)).toHaveBeenCalledTimes(2);
    expect(lines).toEqual([]);
  });
});

describe('fin de la vérification Discord (mise à jour du membre)', () => {
  it('donne le rôle quand pending passe de vrai à faux', async () => {
    const { change, settle } = setup();
    const next = fakeMember({ pending: false });

    await change(fakeMember({ pending: true }), next);
    await settle();

    expect(next.roles.add).toHaveBeenCalledOnce();
  });

  it('ancien membre partiel : ne fait rien, sans même lire la config', async () => {
    const { change, settle, configs } = setup();
    const next = fakeMember({ pending: false });

    await change(fakeMember({ partial: true, pending: null }), next);
    await settle();

    expect(configs.get).not.toHaveBeenCalled();
    expect(next.roles.add).not.toHaveBeenCalled();
  });

  it('autre changement (pseudo…) d’un membre sans le rôle : ne le redonne pas', async () => {
    const { change, settle } = setup();
    const next = fakeMember({ pending: false });

    await change(fakeMember({ pending: false }), next);
    await settle();

    expect(next.roles.add).not.toHaveBeenCalled();
  });

  it('ne redonne pas un rôle que le membre a déjà', async () => {
    const { change, settle } = setup();
    const next = fakeMember({ pending: false, roleIds: [ROLE] });

    await change(fakeMember({ pending: true }), next);
    await settle();

    expect(next.roles.add).not.toHaveBeenCalled();
  });

  it('donne le rôle même si le message d’arrivée est désactivé', async () => {
    const { change, settle } = setup({ ...settings, welcomeEnabled: false });
    const next = fakeMember({ pending: false });

    await change(fakeMember({ pending: true }), next);
    await settle();

    expect(next.roles.add).toHaveBeenCalledOnce();
  });

  it('ne fait rien pour un bot, sans config ou sans rôle d’arrivée', async () => {
    for (const [config, bot] of [
      [settings, true],
      [null, false],
      [{ ...settings, welcomeRoleId: null }, false],
    ] as const) {
      const { change, settle } = setup(config);
      const next = fakeMember({ pending: false, bot });

      await change(fakeMember({ pending: true, bot }), next);
      await settle();

      expect(next.roles.add).not.toHaveBeenCalled();
    }
  });
});

describe('départ d’un membre', () => {
  it('annonce le départ sans contenu ni notification', async () => {
    const { leave } = setup();
    const member = fakeMember();

    await leave(member);

    const send = sendOf(member.guild, GOODBYE_CHANNEL);
    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0] as { content?: string; allowedMentions: object };
    expect(payload.content).toBeUndefined();
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  it('membre partiel (absent du cache) : annonce avec son profil Discord', async () => {
    const { leave } = setup();
    const member = fakeMember({ partial: true, pending: null });

    await leave(member);

    const payload = sendOf(member.guild, GOODBYE_CHANNEL).mock.calls[0]![0] as {
      embeds: { toJSON(): { author?: { name: string; icon_url?: string } } }[];
    };
    expect(payload.embeds[0]!.toJSON().author).toEqual({
      name: USER_PSEUDO,
      icon_url: 'https://cdn/user.png',
    });
  });

  it('ne fait rien pour le bot lui-même, un autre bot, sans config ou départs désactivés', async () => {
    const cases = [
      { config: settings, member: fakeMember({ id: BOT_ID, bot: true }) },
      { config: settings, member: fakeMember({ bot: true }) },
      { config: null, member: fakeMember() },
      { config: { ...settings, goodbyeEnabled: false }, member: fakeMember() },
    ];
    for (const { config, member } of cases) {
      const { leave } = setup(config);

      await leave(member);

      expect(sendOf(member.guild, GOODBYE_CHANNEL)).not.toHaveBeenCalled();
    }
  });

  it('un départ n’entame pas la pause de l’arrivée, mais a la sienne', async () => {
    const { join, leave } = setup();
    const guild = fakeGuild();

    await join(fakeMember({ guild }));
    await leave(fakeMember({ guild }));
    await leave(fakeMember({ guild }));

    expect(sendOf(guild, WELCOME_CHANNEL)).toHaveBeenCalledOnce();
    expect(sendOf(guild, GOODBYE_CHANNEL)).toHaveBeenCalledOnce();
  });

  it('envoi refusé : avertit sans planter ni nommer le membre', async () => {
    const { leave, lines } = setup();
    const member = fakeMember();
    sendOf(member.guild, GOODBYE_CHANNEL).mockRejectedValue(discordErrorWithMemberData());

    await expect(leave(member)).resolves.toBeUndefined();

    expect(JSON.parse(lines[0]!)).toMatchObject({
      code: 50013,
      guildId: GUILD,
      channelId: GOODBYE_CHANNEL,
    });
    expectNoMemberData(lines);
  });
});
