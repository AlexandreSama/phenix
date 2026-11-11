import type { MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { joinTd2Button, leaveTd2Button, SIGNUP_REPLIES } from './signup.js';
import { GUILD, raidEvent, signup } from './test-fixtures.js';

const database = vi.hoisted(() => ({
  findTd2Event: vi.fn(),
  joinTd2Event: vi.fn(),
  leaveTd2Event: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const PLAYER = '500000000000000001';

function setup() {
  const channel = { isSendable: () => true, send: vi.fn(async () => ({})) };
  const interaction = {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    user: { id: PLAYER },
    client: { channels: { fetch: vi.fn(async () => channel) } },
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
  };
  const context = { db: {}, logger: { warn: vi.fn() } } as unknown as BotContext;
  const click = (handler: typeof joinTd2Button, id: string) =>
    handler.execute(interaction as unknown as MessageComponentInteraction, id, context);
  const said = (mock: typeof interaction.reply) =>
    (mock.mock.calls.at(-1) as unknown as [{ content: string }] | undefined)?.[0].content;
  return { channel, interaction, click, said };
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
});

describe('bouton de rôle', () => {
  it('confirme le joueur et met le message à jour sur place', async () => {
    database.joinTd2Event.mockResolvedValue({
      status: 'joined',
      role: 'DPS',
      signupStatus: 'CONFIRMED',
      previousRole: null,
      promoted: [],
    });
    database.findTd2Event.mockResolvedValue(raidEvent({ signups: [signup(PLAYER, 'DPS')] }));
    const { interaction, click, said } = setup();

    await click(joinTd2Button, '12:DPS');

    expect(database.joinTd2Event).toHaveBeenCalledWith({}, 12, PLAYER, 'DPS');
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
    );
    expect(said(interaction.followUp)).toBe(SIGNUP_REPLIES.joined('DPS'));
  });

  it('rôle complet : en réserve, avec sa place dans la file', async () => {
    database.joinTd2Event.mockResolvedValue({
      status: 'joined',
      role: 'HEAL',
      signupStatus: 'RESERVE',
      previousRole: null,
      promoted: [],
    });
    database.findTd2Event.mockResolvedValue(
      raidEvent({ signups: [signup('1', 'HEAL'), signup(PLAYER, 'HEAL', 'RESERVE')] }),
    );
    const { interaction, click, said } = setup();

    await click(joinTd2Button, '12:HEAL');

    expect(said(interaction.followUp)).toBe(SIGNUP_REPLIES.reserve('HEAL', 1));
  });

  it('changer de rôle libère une place : celui qui monte est prévenu', async () => {
    database.joinTd2Event.mockResolvedValue({
      status: 'joined',
      role: 'TANK',
      signupStatus: 'CONFIRMED',
      previousRole: 'HEAL',
      promoted: [{ userId: '7', role: 'HEAL' }],
    });
    database.findTd2Event.mockResolvedValue(
      raidEvent({ signups: [signup('7', 'HEAL'), signup(PLAYER, 'TANK')] }),
    );
    const { channel, interaction, click, said } = setup();

    await click(joinTd2Button, '12:TANK');

    expect(said(interaction.followUp)).toBe(
      `${SIGNUP_REPLIES.switched('HEAL', 'TANK')}\n${SIGNUP_REPLIES.joined('TANK')}`,
    );
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['7'] } }),
    );
  });

  it('déjà inscrit, fermée ou introuvable : une réponse privée, le message ne bouge pas', async () => {
    const { interaction, click, said } = setup();
    database.findTd2Event.mockResolvedValue(raidEvent({ signups: [signup(PLAYER, 'DPS')] }));
    database.joinTd2Event.mockResolvedValueOnce({
      status: 'already',
      role: 'DPS',
      signupStatus: 'CONFIRMED',
    });
    database.joinTd2Event.mockResolvedValueOnce({ status: 'closed' });

    await click(joinTd2Button, '12:DPS');
    expect(said(interaction.reply)).toBe(SIGNUP_REPLIES.already('DPS'));
    await click(joinTd2Button, '12:DPS');
    expect(said(interaction.reply)).toBe(SIGNUP_REPLIES.closed);
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('ignore un rôle qui n’existe pas', async () => {
    const { interaction, click } = setup();

    await click(joinTd2Button, '12:SNIPER');

    expect(database.joinTd2Event).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});

describe('Se désinscrire', () => {
  it('libère la place, et le premier de la réserve monte', async () => {
    database.leaveTd2Event.mockResolvedValue({
      status: 'left',
      role: 'TANK',
      promoted: [{ userId: '8', role: 'TANK' }],
    });
    database.findTd2Event.mockResolvedValue(raidEvent({ signups: [signup('8', 'TANK')] }));
    const { channel, interaction, click, said } = setup();

    await click(leaveTd2Button, '12');

    expect(interaction.update).toHaveBeenCalled();
    expect(said(interaction.followUp)).toBe(SIGNUP_REPLIES.left);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['8'] } }),
    );
  });

  it('pas inscrit : le dit, sans rien changer', async () => {
    database.leaveTd2Event.mockResolvedValue({ status: 'not-signed' });
    const { interaction, click, said } = setup();

    await click(leaveTd2Button, '12');

    expect(said(interaction.reply)).toBe(SIGNUP_REPLIES.notSigned);
    expect(interaction.update).not.toHaveBeenCalled();
  });
});

describe('réponses d’une mission', () => {
  it('ne parlent pas de rôle : une mission n’a que des joueurs', () => {
    expect(SIGNUP_REPLIES.joined('PLAYER')).toBe("C'est noté : tu es dans l'équipe.");
    expect(SIGNUP_REPLIES.reserve('PLAYER', 1)).toBe(
      "L'équipe est complète : tu es en réserve (1ʳᵉ). Tu passeras dans l’équipe dès qu’une place se libère.",
    );
    expect(SIGNUP_REPLIES.already('PLAYER')).toBe(
      "Tu es déjà dans l'équipe. « Se désinscrire » pour libérer ta place.",
    );
    expect(SIGNUP_REPLIES.alreadyReserve('PLAYER', 2)).toBe('Tu es déjà en réserve (2ᵉ).');
    // Les autres gardent leur rôle
    expect(SIGNUP_REPLIES.reserve('HEAL', 1)).toContain('Heal est complet');
  });

  it('le bouton « Rejoindre » inscrit dans la place « joueur »', async () => {
    database.joinTd2Event.mockResolvedValue({
      status: 'joined',
      role: 'PLAYER',
      signupStatus: 'CONFIRMED',
      previousRole: null,
      promoted: [],
    });
    database.findTd2Event.mockResolvedValue(raidEvent({ signups: [signup(PLAYER, 'PLAYER')] }));
    const { click, said, interaction } = setup();

    await click(joinTd2Button, '12:PLAYER');

    expect(database.joinTd2Event).toHaveBeenCalledWith({}, 12, PLAYER, 'PLAYER');
    expect(said(interaction.followUp)).toBe(SIGNUP_REPLIES.joined('PLAYER'));
  });
});
