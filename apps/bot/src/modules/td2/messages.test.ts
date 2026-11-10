import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { promotionMessage, reminderMessage, reservePosition, td2EventMessage } from './messages.js';
import { incursionEvent, raidEvent, signup } from './test-fixtures.js';

const BEFORE = new Date('2026-11-14T12:00:00Z');

function render(event: ReturnType<typeof raidEvent>, now = BEFORE) {
  const { embeds, components } = td2EventMessage(event, now);
  const buttons = components.map((row) =>
    row.components.map((button) => button.toJSON() as { label: string; style: ButtonStyle }),
  );
  return { embed: embeds[0]?.toJSON(), buttons };
}

describe('td2EventMessage', () => {
  it('ouverte : les places par rôle, la réserve, un bouton par rôle', () => {
    const event = raidEvent({
      signups: [
        signup('1', 'DPS'),
        signup('2', 'DPS'),
        signup('3', 'HEAL'),
        signup('4', 'HEAL', 'RESERVE'),
      ],
    });

    const { embed, buttons } = render(event);

    expect(embed?.title).toBe('⚔️ Raid Dark Hours · Normal');
    expect(embed?.description).toContain('👥 3/8 joueurs · 1 en réserve');
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['DPS (2/6)', '<@1> <@2>'],
      ['Heal (1/1)', '<@3>'],
      ['Tank (0/1)', '—'],
      ['Réserve', '<@4> (Heal)'],
    ]);
    expect(buttons[0]?.map((button) => [button.label, button.style])).toEqual([
      ['DPS 2/6', ButtonStyle.Primary],
      // Complet : toujours cliquable, mais en gris (on y entre en réserve)
      ['Heal 1/1', ButtonStyle.Secondary],
      ['Tank 0/1', ButtonStyle.Primary],
    ]);
    expect(buttons[1]?.map((button) => button.label)).toEqual(['Se désinscrire', 'Gérer']);
  });

  it('une incursion n’affiche pas de mode, et propose Heal/Tank', () => {
    const { embed, buttons } = render(incursionEvent());

    expect(embed?.title).toBe('🛡️ Incursion Paradis Perdu');
    expect(buttons[0]?.map((button) => button.label)).toEqual(['DPS 0/3', 'Heal/Tank 0/1']);
  });

  it('commencée : la liste reste, les boutons partent', () => {
    const { embed, buttons } = render(raidEvent(), new Date('2026-11-14T20:00:00Z'));

    expect(embed?.description).toContain('Commencée');
    expect(buttons).toEqual([]);
  });

  it('annulée : barrée, sans liste ni boutons', () => {
    const { embed, buttons } = render(raidEvent({ cancelledAt: BEFORE }));

    expect(embed?.title).toBe('Annulée — ⚔️ Raid Dark Hours · Normal');
    expect(embed?.description).toContain('Sortie annulée.');
    expect(embed?.fields).toBeUndefined();
    expect(buttons).toEqual([]);
  });
});

describe('réserve et annonces', () => {
  it('donne la place de chacun dans la réserve de son rôle', () => {
    const event = raidEvent({
      signups: [
        signup('1', 'TANK'),
        signup('2', 'TANK', 'RESERVE'),
        signup('3', 'HEAL', 'RESERVE'),
        signup('4', 'TANK', 'RESERVE'),
      ],
    });

    expect(reservePosition(event, '2')).toBe(1);
    expect(reservePosition(event, '4')).toBe(2);
    expect(reservePosition(event, '3')).toBe(1);
    expect(reservePosition(event, '1')).toBe(0);
  });

  it('le rappel mentionne l’équipe et la réserve, en réponse au message de la sortie', () => {
    const event = raidEvent({ signups: [signup('1', 'DPS'), signup('2', 'DPS', 'RESERVE')] });

    const message = reminderMessage(event);

    expect(message?.content).toContain('Équipe : <@1>');
    expect(message?.content).toContain('Réserve, au cas où : <@2>');
    expect(message?.reply).toEqual({
      messageReference: '900000000000000001',
      failIfNotExists: false,
    });
    expect(message?.allowedMentions).toEqual({ users: ['1', '2'] });
    expect(reminderMessage(raidEvent())).toBeNull();
  });

  it('la montée de la réserve ne notifie que les joueurs qui montent', () => {
    const message = promotionMessage(raidEvent(), [{ userId: '7', role: 'TANK' }]);

    expect(message.content).toContain('<@7>, une place de Tank s’est libérée');
    expect(message.allowedMentions).toEqual({ users: ['7'] });
  });
});
