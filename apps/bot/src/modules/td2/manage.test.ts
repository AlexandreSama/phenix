import { PermissionFlagsBits, type MessageComponentInteraction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import {
  canManage,
  cancelTd2Button,
  confirmCancelTd2Button,
  MANAGE_REPLIES,
  manageTd2Button,
  rescheduleTd2Modal,
} from './manage.js';
import { GUILD, ORGANIZER, raidEvent, signup } from './test-fixtures.js';

const database = vi.hoisted(() => ({
  cancelTd2Event: vi.fn(),
  findTd2Event: vi.fn(),
  markTd2EventPublished: vi.fn(),
  rescheduleTd2Event: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const STAFF_ROLE = '600000000000000001';
const NOW = new Date('2026-11-09T12:00:00Z');

function member(id: string, { admin = false, roles = [] as string[] } = {}) {
  return {
    id,
    permissions: { has: (flag: bigint) => admin && flag === PermissionFlagsBits.ManageGuild },
    roles: { cache: new Set(roles) },
  };
}

function setup(userId = ORGANIZER, options: Parameters<typeof member>[1] = {}) {
  const channel = {
    guildId: GUILD,
    isSendable: () => true,
    send: vi.fn(async () => ({})),
    messages: { edit: vi.fn(async () => ({})) },
  };
  const interaction = {
    isButton: () => true,
    isModalSubmit: () => true,
    isFromMessage: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    member: member(userId, options),
    client: { channels: { fetch: vi.fn(async () => channel) } },
    fields: { getTextInputValue: vi.fn(() => 'samedi 22h') },
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    showModal: vi.fn(async () => {}),
  };
  const td2 = { schedule: vi.fn(async () => {}), cancel: vi.fn(async () => {}) };
  const logger = { warn: vi.fn() };
  const context = {
    db: {},
    td2,
    logger,
    configs: {
      get: vi.fn(async () => ({ timezone: 'Europe/Paris', staffRoleIds: [STAFF_ROLE] })),
    },
  } as unknown as BotContext;
  const run = (handler: typeof manageTd2Button) =>
    handler.execute(interaction as unknown as MessageComponentInteraction, '12', context);
  const said = (mock: typeof interaction.reply) =>
    (mock.mock.calls.at(-1) as unknown as [{ content: string }] | undefined)?.[0].content;
  return { channel, interaction, td2, logger, run, said };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  for (const mock of Object.values(database)) mock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('qui peut gérer une sortie', () => {
  it('l’organisateur, un admin du serveur, ou un rôle d’équipe', () => {
    const event = raidEvent();

    expect(canManage(member(ORGANIZER), event, [])).toBe(true);
    expect(canManage(member('9', { admin: true }), event, [])).toBe(true);
    expect(canManage(member('9', { roles: [STAFF_ROLE] }), event, [STAFF_ROLE])).toBe(true);
    expect(canManage(member('9'), event, [STAFF_ROLE])).toBe(false);
  });

  it('« Gérer » ouvre le menu pour eux seuls, et seulement avant le début', async () => {
    const stranger = setup('9');
    database.findTd2Event.mockResolvedValue(raidEvent());
    await stranger.run(manageTd2Button);
    expect(stranger.said(stranger.interaction.reply)).toBe(MANAGE_REPLIES.forbidden);

    const organizer = setup();
    await organizer.run(manageTd2Button);
    expect(organizer.said(organizer.interaction.reply)).toContain('Que veux-tu faire');

    database.findTd2Event.mockResolvedValue(raidEvent({ cancelledAt: NOW }));
    await organizer.run(manageTd2Button);
    expect(organizer.said(organizer.interaction.reply)).toBe(MANAGE_REPLIES.closed);
  });
});

describe('changer la date', () => {
  it('déplace la sortie, replanifie ses tâches et prévient les inscrits', async () => {
    const moved = raidEvent({
      scheduledAt: new Date('2026-11-14T21:00:00Z'),
      signups: [signup('1', 'DPS')],
    });
    database.findTd2Event.mockResolvedValue(raidEvent());
    database.rescheduleTd2Event.mockResolvedValue(moved);
    const { channel, interaction, td2, run, said } = setup();

    await run(rescheduleTd2Modal);

    // « samedi 22h » à Paris, le samedi qui suit le lundi 9 novembre
    expect(database.rescheduleTd2Event).toHaveBeenCalledWith(
      {},
      12,
      new Date('2026-11-14T21:00:00Z'),
    );
    expect(channel.messages.edit).toHaveBeenCalled();
    expect(td2.schedule).toHaveBeenCalledWith(12, moved.scheduledAt);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['1'] } }),
    );
    expect(said(interaction.update)).toBe(MANAGE_REPLIES.rescheduled(moved.scheduledAt));
  });

  it('salon supprimé : la date change quand même, l’erreur est notée', async () => {
    const moved = raidEvent({ scheduledAt: new Date('2026-11-14T21:00:00Z') });
    database.findTd2Event.mockResolvedValue(raidEvent());
    database.rescheduleTd2Event.mockResolvedValue(moved);
    const { interaction, td2, run, said, logger } = setup();
    interaction.client.channels.fetch.mockRejectedValueOnce(new Error('Unknown Channel'));

    await run(rescheduleTd2Modal);

    expect(td2.schedule).toHaveBeenCalledWith(12, moved.scheduledAt);
    expect(logger.warn).toHaveBeenCalled();
    expect(said(interaction.update)).toBe(MANAGE_REPLIES.rescheduled(moved.scheduledAt));
  });

  it('une date illisible est expliquée, rien ne change', async () => {
    database.findTd2Event.mockResolvedValue(raidEvent());
    const { interaction, run, said } = setup();
    interaction.fields.getTextInputValue.mockReturnValue('bientôt 22h');

    await run(rescheduleTd2Modal);

    expect(said(interaction.reply)).toContain('Je ne comprends pas');
    expect(database.rescheduleTd2Event).not.toHaveBeenCalled();
  });
});

describe('annuler', () => {
  it('demande confirmation, puis annule, retire les tâches et prévient', async () => {
    const cancelled = raidEvent({ cancelledAt: NOW, signups: [signup('1', 'DPS')] });
    database.findTd2Event.mockResolvedValue(raidEvent());
    database.cancelTd2Event.mockResolvedValue(cancelled);
    const { channel, interaction, td2, run, said } = setup();

    await run(cancelTd2Button);
    expect(said(interaction.update)).toContain('Annuler **⚔️ Raid Dark Hours · Normal** ?');

    await run(confirmCancelTd2Button);

    expect(td2.cancel).toHaveBeenCalledWith(12);
    expect(channel.messages.edit).toHaveBeenCalledWith(
      '900000000000000001',
      expect.objectContaining({ components: [] }),
    );
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['1'] } }),
    );
    expect(said(interaction.update)).toBe(MANAGE_REPLIES.cancelled);
  });
});
