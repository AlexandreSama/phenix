import type { MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { GUILD, td2Report } from '../test-fixtures.js';
import { confirmReportButton, REVIEW_REPLIES, rejectReportButton } from './review.js';

const database = vi.hoisted(() => ({
  findTd2Report: vi.fn(),
  listTd2FeedChannels: vi.fn(),
  reviewTd2Report: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const STAFF_ROLE = '600000000000000001';
const REVIEWER = '800000000000000001';
const OTHER_GUILD = '100000000000000002';

function setup({ roles = [STAFF_ROLE] } = {}) {
  const feedChannel = { isSendable: () => true, send: vi.fn(async () => ({})) };
  const interaction = {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    user: { id: REVIEWER },
    member: { permissions: { has: () => false }, roles: { cache: new Set(roles) } },
    client: {
      guilds: {
        cache: new Map([
          [GUILD, {}],
          [OTHER_GUILD, {}],
        ]),
      },
      channels: { fetch: vi.fn(async () => feedChannel) },
    },
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    deferUpdate: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
  };
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn() },
    configs: { get: vi.fn(async () => ({ staffRoleIds: [STAFF_ROLE] })) },
  } as unknown as BotContext;
  const click = (handler: typeof confirmReportButton) =>
    handler.execute(interaction as unknown as MessageComponentInteraction, '7', context);
  const said = (mock: typeof interaction.reply) =>
    (mock.mock.calls.at(-1) as unknown as [{ content: string }] | undefined)?.[0].content;
  return { feedChannel, interaction, click, said };
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset();
  database.listTd2FeedChannels.mockResolvedValue([
    { guildId: GUILD, channelId: '400000000000000011' },
    { guildId: OTHER_GUILD, channelId: '400000000000000012' },
    // Un serveur que le bot a quitté sans que la base le sache encore : ignoré
    { guildId: '100000000000000099', channelId: '400000000000000013' },
  ]);
});

describe('examiner un signalement', () => {
  it('confirmer : le message suit, et le fil de chaque serveur est prévenu', async () => {
    const confirmed = td2Report({
      status: 'CONFIRMED',
      reviewedById: REVIEWER,
      reviewedAt: new Date(),
    });
    database.reviewTd2Report.mockResolvedValue({
      status: 'reviewed',
      report: confirmed,
      previous: 'PENDING',
    });
    const { feedChannel, interaction, click, said } = setup();

    await click(confirmReportButton);

    expect(database.reviewTd2Report).toHaveBeenCalledWith(
      {},
      { id: 7, guildId: GUILD, status: 'CONFIRMED', reviewerId: REVIEWER },
    );
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
    expect(feedChannel.send).toHaveBeenCalledTimes(2);
    expect(said(interaction.followUp)).toBe(
      REVIEW_REPLIES.reviewed(7, 'CONFIRMED') + REVIEW_REPLIES.shared(2),
    );
  });

  it('rejeter ne prévient pas le réseau', async () => {
    database.reviewTd2Report.mockResolvedValue({
      status: 'reviewed',
      report: td2Report({ status: 'REJECTED' }),
      previous: 'PENDING',
    });
    const { feedChannel, click } = setup();

    await click(rejectReportButton);

    expect(feedChannel.send).not.toHaveBeenCalled();
  });

  it('réservé à l’équipe du serveur', async () => {
    const { interaction, click, said } = setup({ roles: [] });

    await click(confirmReportButton);

    expect(said(interaction.reply)).toBe(REVIEW_REPLIES.forbidden);
    expect(database.reviewTd2Report).not.toHaveBeenCalled();
  });

  it('supprimé par l’administration : les boutons partent', async () => {
    database.reviewTd2Report.mockResolvedValue({ status: 'missing' });
    const { interaction, click, said } = setup();

    await click(confirmReportButton);

    expect(interaction.update).toHaveBeenCalledWith({ components: [] });
    expect(said(interaction.followUp)).toBe(REVIEW_REPLIES.missing);
  });

  it('déjà tranché par un autre : le message se remet à jour', async () => {
    database.reviewTd2Report.mockResolvedValue({ status: 'unchanged', current: 'REJECTED' });
    database.findTd2Report.mockResolvedValue(td2Report({ status: 'REJECTED' }));
    const { interaction, click, said } = setup();

    await click(rejectReportButton);

    expect(interaction.update).toHaveBeenCalled();
    expect(said(interaction.followUp)).toBe(REVIEW_REPLIES.unchanged('REJECTED'));
  });

  it('sans capture, ou déjà confirmé : un refus privé', async () => {
    const { interaction, click, said } = setup();
    database.reviewTd2Report.mockResolvedValueOnce({ status: 'no-evidence' });
    database.reviewTd2Report.mockResolvedValueOnce({ status: 'final' });

    await click(confirmReportButton);
    expect(said(interaction.reply)).toBe(REVIEW_REPLIES.noEvidence);
    await click(rejectReportButton);
    expect(said(interaction.reply)).toBe(REVIEW_REPLIES.final);
  });
});
