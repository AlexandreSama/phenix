import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { announcementMessage, giveawayMessage, type GiveawayView } from './messages.js';

const base: GiveawayView = {
  id: 12,
  prize: 'Nitro 1 mois',
  hostId: '200000000000000001',
  winnersCount: 2,
  requiredRoleId: '300000000000000001',
  endsAt: new Date('2026-11-10T20:00:00Z'),
  endedAt: null,
  winnerIds: [],
  _count: { entries: 5 },
};

const render = (giveaway: GiveawayView) => {
  const { embeds, components } = giveawayMessage(giveaway);
  const embed = embeds[0]?.toJSON();
  const button = components[0]?.components[0]?.toJSON() as {
    label: string;
    disabled?: boolean;
    style: ButtonStyle;
    custom_id: string;
  };
  return { embed, button };
};

describe('giveawayMessage', () => {
  it('en cours : fin, gagnants, rôle requis, et le nombre de participants sur le bouton', () => {
    const { embed, button } = render(base);

    expect(embed?.title).toBe('🎉 Nitro 1 mois');
    expect(embed?.description).toContain('<t:1794340800:R>');
    expect(embed?.description).toContain('2 gagnants');
    expect(embed?.description).toContain('<@&300000000000000001>');
    expect(embed?.footer?.text).toBe('Giveaway #12 · 5 participants');
    expect(button).toMatchObject({
      label: 'Participer (5)',
      custom_id: 'giveaway:join:12',
      style: ButtonStyle.Primary,
    });
    expect(button.disabled).toBeFalsy();
  });

  it('terminé : les gagnants, et un bouton désactivé', () => {
    const { embed, button } = render({
      ...base,
      endedAt: new Date('2026-11-10T20:00:05Z'),
      winnerIds: ['1', '2'],
    });

    expect(embed?.description).toContain('Gagnants : <@1>, <@2>');
    expect(embed?.description).not.toContain('Réservé');
    expect(button).toMatchObject({ label: 'Terminé', disabled: true });
  });

  it('terminé sans participant : le dit clairement', () => {
    const { embed } = render({
      ...base,
      endedAt: new Date(),
      _count: { entries: 0 },
    });

    expect(embed?.description).toContain('Pas de gagnant');
    expect(embed?.footer?.text).toBe('Giveaway #12 · 0 participant');
  });
});

describe('announcementMessage', () => {
  it('répond au message du giveaway et ne notifie que les gagnants', () => {
    const message = announcementMessage(
      { prize: 'Nitro', winnerIds: ['1'] },
      { messageId: '900', reroll: false },
    );

    expect(message.content).toBe('🎉 Félicitations <@1> ! Tu remportes **Nitro**.');
    expect(message.reply).toEqual({ messageReference: '900', failIfNotExists: false });
    expect(message.allowedMentions).toEqual({ users: ['1'] });
  });

  it('accorde au pluriel, signale un nouveau tirage, et le cas sans gagnant', () => {
    const many = announcementMessage(
      { prize: 'Nitro', winnerIds: ['1', '2'] },
      { messageId: '900', reroll: true },
    );
    const none = announcementMessage(
      { prize: 'Nitro', winnerIds: [] },
      { messageId: '900', reroll: false },
    );

    expect(many.content).toBe(
      'Nouveau tirage ! 🎉 Félicitations <@1>, <@2> ! Vous remportez **Nitro**.',
    );
    expect(none.content).toContain("personne n'a participé");
    expect(none.allowedMentions).toEqual({ users: [] });
  });
});
