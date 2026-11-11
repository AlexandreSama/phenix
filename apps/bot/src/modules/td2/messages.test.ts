import { ButtonStyle, time, TimestampStyles, type EmbedBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { COLORS } from '../../core/embeds.js';
import {
  directivesMenu,
  fitLines,
  manageMenu,
  progressBar,
  promotionMessage,
  reminderMessage,
  reservePosition,
  ROLE_EMOJIS,
  slotLines,
  td2EventMessage,
} from './messages.js';
import { incursionEvent, missionEvent, raidEvent, signup } from './test-fixtures.js';

const BEFORE = new Date('2026-11-14T12:00:00Z');
const FREE = '▫️ *libre*';
const WHEN = raidEvent().scheduledAt;
const FULL_DATE = time(WHEN, TimestampStyles.LongDateTime);
const RELATIVE = time(WHEN, TimestampStyles.RelativeTime);
const color = (hex: string) => Number.parseInt(hex.slice(1), 16);

function render(event: ReturnType<typeof raidEvent>, now = BEFORE) {
  const { embeds, components } = td2EventMessage(event, now);
  const buttons = components.map((row) =>
    row.components.map(
      (button) =>
        button.toJSON() as {
          label: string;
          style: ButtonStyle;
          custom_id: string;
          emoji?: { name: string };
        },
    ),
  );
  return { embed: embeds[0]?.toJSON(), buttons };
}

describe('utilitaires d’affichage', () => {
  it('un emoji par rôle', () => {
    expect(ROLE_EMOJIS).toEqual({
      DPS: '🗡️',
      HEAL: '💉',
      TANK: '🛡️',
      HEAL_TANK: '⛑️',
      PLAYER: '👥',
    });
  });

  it('progressBar : une case par place, dix au plus', () => {
    expect(progressBar(5, 8)).toBe('▰▰▰▰▰▱▱▱');
    expect(progressBar(0, 4)).toBe('▱▱▱▱');
    expect(progressBar(4, 4)).toBe('▰▰▰▰');
    expect(progressBar(12, 12)).toBe('▰▰▰▰▰▰▰▰▰▰');
    expect(progressBar(6, 12)).toBe('▰▰▰▰▰▱▱▱▱▱');
    expect(progressBar(0, 0)).toBe('');
  });

  it('progressBar : jamais plus de cases pleines que de cases', () => {
    expect(progressBar(9, 8)).toBe('▰▰▰▰▰▰▰▰');
  });

  it('fitLines : tout tient, rien n’est coupé', () => {
    expect(fitLines(['a', 'b'])).toBe('a\nb');
    expect(fitLines(['a', 'b'], '-# fin')).toBe('a\nb\n-# fin');
    expect(fitLines([])).toBe('');
  });

  it('fitLines : le surplus devient « … et N autres », le pied reste, 1024 caractères au plus', () => {
    const lines = Array.from({ length: 100 }, (_, index) => `${index + 1}. ${'x'.repeat(30)}`);

    const value = fitLines(lines, '-# fin');

    expect(value.length).toBeLessThanOrEqual(1024);
    expect(value.startsWith('1. xxx')).toBe(true);
    expect(value).toMatch(/\n… et \d+ autres\n-# fin$/);
    // Le compte est exact : lignes affichées + lignes cachées = toutes les lignes
    const shown = value.split('\n').filter((line) => /^\d+\. /.test(line)).length;
    const hidden = Number(/… et (\d+) autres/.exec(value)?.[1]);
    expect(shown + hidden).toBe(100);
  });

  it('fitLines : « autre » au singulier quand il n’en reste qu’une', () => {
    const lines = [`1. ${'x'.repeat(600)}`, `2. ${'x'.repeat(600)}`];

    expect(fitLines(lines)).toMatch(/\n… et 1 autre$/);
  });

  it('slotLines : un joueur par ligne, puis les places libres', () => {
    expect(slotLines(['1'], 3)).toBe(`<@1>\n${FREE}\n${FREE}`);
    expect(slotLines(['1', '2'], 2)).toBe('<@1>\n<@2>');
    expect(slotLines([], 1)).toBe(FREE);
  });
});

describe('td2EventMessage', () => {
  it('ouverte : en-tête, titre, date en ###, places par rôle, réserve numérotée, pied', () => {
    const event = raidEvent({
      signups: [
        signup('1', 'DPS'),
        signup('2', 'DPS'),
        signup('3', 'HEAL'),
        signup('4', 'HEAL', 'RESERVE'),
      ],
    });

    const { embed } = render(event);

    expect(embed?.author?.name).toBe('⚔️ RAID · MODE NORMAL');
    expect(embed?.title).toBe('Dark Hours');
    expect(embed?.color).toBe(color(COLORS.primary));
    expect(embed?.description).toBe(
      [
        `### ${FULL_DATE}`,
        `-# ${RELATIVE} · organisée par <@200000000000000001>`,
        '',
        '`▰▰▰▱▱▱▱▱` **3/8** · 5 places libres · 1 en réserve',
      ].join('\n'),
    );
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['🗡️ DPS · 2/6', `<@1>\n<@2>\n${[FREE, FREE, FREE, FREE].join('\n')}`],
      ['💉 Heal · complet', '<@3>'],
      ['🛡️ Tank · 0/1', FREE],
      ['⏳ Réserve', '1. <@4> · Heal'],
    ]);
    expect(embed?.footer?.text).toBe('Sortie #12 · rappel 15 min avant le départ');
    expect(embed?.timestamp).toBe(WHEN.toISOString());
  });

  it('ouverte à moins de 15 min du départ : le pied ne promet pas de rappel (le bot n’en envoie pas)', () => {
    const inTenMinutes = new Date(WHEN.getTime() - 10 * 60_000);

    const { embed } = render(raidEvent(), inTenMinutes);

    expect(embed?.footer?.text).toBe('Sortie #12');
  });

  it('ouverte à exactement 15 min du départ : pas de rappel planifié, donc pas de promesse', () => {
    const inFifteenMinutes = new Date(WHEN.getTime() - 15 * 60_000);

    const { embed } = render(raidEvent(), inFifteenMinutes);

    expect(embed?.footer?.text).toBe('Sortie #12');
  });

  it('ouverte : un bouton par rôle avec son emoji, « Se désinscrire » en rouge', () => {
    const event = raidEvent({
      signups: [signup('1', 'DPS'), signup('3', 'HEAL'), signup('4', 'HEAL', 'RESERVE')],
    });

    const { buttons } = render(event);

    expect(buttons[0]?.map((b) => [b.label, b.emoji?.name, b.style])).toEqual([
      ['DPS 1/6', '🗡️', ButtonStyle.Primary],
      // Complet : toujours cliquable, et le libellé dit ce qui arrive (réserve)
      ['Heal · réserve', '💉', ButtonStyle.Secondary],
      ['Tank 0/1', '🛡️', ButtonStyle.Primary],
    ]);
    expect(buttons[1]?.map((b) => [b.label, b.emoji?.name, b.style])).toEqual([
      ['Se désinscrire', '🚪', ButtonStyle.Danger],
      ['Gérer', '⚙️', ButtonStyle.Secondary],
    ]);
    // Les identifiants ne changent pas : les anciens messages restent cliquables
    expect(buttons[0]?.[0]?.custom_id).toBe('td2:join:12:DPS');
    expect(buttons[1]?.map((b) => b.custom_id)).toEqual(['td2:leave:12', 'td2:manage:12']);
  });

  it('une incursion n’affiche pas de mode, et propose Heal/Tank', () => {
    const { embed, buttons } = render(incursionEvent());

    expect(embed?.author?.name).toBe('🛡️ INCURSION');
    expect(embed?.title).toBe('Paradis Perdu');
    expect(embed?.fields?.map((field) => field.name)).toEqual([
      '🗡️ DPS · 0/3',
      '⛑️ Heal/Tank · 0/1',
    ]);
    expect(buttons[0]?.map((b) => [b.label, b.emoji?.name])).toEqual([
      ['DPS 0/3', '🗡️'],
      ['Heal/Tank 0/1', '⛑️'],
    ]);
  });

  it('commencée : la liste reste, les boutons partent, la couleur passe à l’or', () => {
    const { embed, buttons } = render(raidEvent(), new Date('2026-11-14T20:00:00Z'));

    expect(embed?.author?.name).toBe('⚔️ RAID · EN COURS');
    expect(embed?.color).toBe(color(COLORS.soon));
    expect(embed?.description).toContain(`### Commencée ${RELATIVE}`);
    expect(embed?.fields).toHaveLength(3);
    expect(buttons).toEqual([]);
  });

  it('annulée : titre barré, date barrée, sans liste ni boutons, sans promesse', () => {
    const { embed, buttons } = render(
      raidEvent({ cancelledAt: BEFORE, signups: [signup('1', 'DPS'), signup('2', 'DPS')] }),
    );

    expect(embed?.author?.name).toBe('⚔️ RAID · ANNULÉE');
    expect(embed?.title).toBe('~~Dark Hours~~');
    expect(embed?.color).toBe(color(COLORS.danger));
    expect(embed?.description).toBe(`Prévue le ~~${FULL_DATE}~~`);
    expect(embed?.description).not.toContain('prévenus');
    expect(embed?.footer?.text).toBe('Sortie #12');
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

  it('le rappel : mentions en sous-texte dans le contenu, le reste dans un embed or', () => {
    const event = raidEvent({ signups: [signup('1', 'DPS'), signup('2', 'DPS', 'RESERVE')] });

    const message = reminderMessage(event);
    const embed = (message?.embeds?.[0] as EmbedBuilder | undefined)?.toJSON();

    // Un embed ne notifie personne : les mentions restent dans le contenu
    expect(message?.content).toBe('-# <@1> <@2>');
    expect(embed?.author?.name).toBe('⏰ RAPPEL · DÉPART IMMINENT');
    expect(embed?.title).toBe('Dark Hours · Normal');
    expect(embed?.color).toBe(color(COLORS.soon));
    expect(embed?.description).toBe(`### Départ ${RELATIVE}`);
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['👥 Équipe · 1/8', '<@1>'],
      ['⏳ Réserve', '1. <@2> · DPS\n-# Prêt à monter si une place se libère'],
    ]);
    expect(embed?.footer?.text).toBe('Sortie #12');
    expect(message?.reply).toEqual({
      messageReference: '900000000000000001',
      failIfNotExists: false,
    });
    expect(message?.allowedMentions).toEqual({ users: ['1', '2'] });
    expect(reminderMessage(raidEvent())).toBeNull();
  });

  it('une réserve de 60 joueurs : le champ reste sous 1024 caractères, dans l’embed et dans le rappel', () => {
    const reserve = Array.from({ length: 60 }, (_, index) =>
      signup(String(100_000_000_000_000_000n + BigInt(index)), 'HEAL', 'RESERVE'),
    );
    const event = raidEvent({ signups: [signup('1', 'DPS'), ...reserve] });

    const { embed } = render(event);
    const reminder = (reminderMessage(event)?.embeds?.[0] as EmbedBuilder | undefined)?.toJSON();

    for (const fields of [embed?.fields, reminder?.fields]) {
      const value = fields?.find((field) => field.name === '⏳ Réserve')?.value ?? '';
      expect(value.length).toBeLessThanOrEqual(1024);
      expect(value).toContain('1. <@100000000000000000> · Heal');
      expect(value).toMatch(/… et \d+ autres/);
    }
    // Dans le rappel, la ligne de fin n'est jamais perdue
    const reminderValue = reminder?.fields?.find((field) => field.name === '⏳ Réserve')?.value;
    expect(reminderValue?.endsWith('-# Prêt à monter si une place se libère')).toBe(true);
  });

  it('la montée de la réserve ne notifie que les joueurs qui montent', () => {
    const message = promotionMessage(raidEvent(), [{ userId: '7', role: 'TANK' }]);

    expect(message.content).toContain('<@7>, une place de Tank s’est libérée');
    expect(message.allowedMentions).toEqual({ users: ['7'] });
  });
});

describe('missions', () => {
  const DIRECTIVES = [
    { id: 1, name: 'Brouillard de guerre', description: 'Mini-carte vide.' },
    { id: 2, name: 'Sans régénération', description: null },
  ];

  it('la difficulté en en-tête, le nom en titre, les directives en champ, une seule équipe', () => {
    const event = missionEvent({
      directives: ['Brouillard de guerre', 'Sans régénération'],
      signups: [
        signup('1', 'PLAYER'),
        signup('2', 'PLAYER'),
        signup('3', 'PLAYER'),
        signup('4', 'PLAYER'),
        signup('5', 'PLAYER', 'RESERVE'),
      ],
    });

    const { embed, buttons } = render(event);

    expect(embed?.author?.name).toBe('🎯 MISSION · HÉROÏQUE');
    expect(embed?.title).toBe('Capitole');
    // La couleur dit l'état, pas la difficulté
    expect(embed?.color).toBe(color(COLORS.primary));
    expect(embed?.description).toContain('`▰▰▰▰` **4/4** · complet · 1 en réserve');
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['👥 Équipe · complet', '<@1>\n<@2>\n<@3>\n<@4>'],
      ['🧩 Directives', '• Brouillard de guerre\n• Sans régénération'],
      ['⏳ Réserve', '1. <@5>'],
    ]);
    expect(buttons[0]?.map((b) => [b.label, b.emoji?.name, b.style])).toEqual([
      ['Rejoindre · réserve', '👥', ButtonStyle.Secondary],
    ]);
  });

  it('mission non complète : le bouton montre les places, sans directive pas de champ', () => {
    const { embed, buttons } = render(missionEvent({ signups: [signup('1', 'PLAYER')] }));

    expect(buttons[0]?.map((b) => [b.label, b.style])).toEqual([
      ['Rejoindre · 1/4', ButtonStyle.Primary],
    ]);
    expect(embed?.fields?.map((field) => field.name)).toEqual(['👥 Équipe · 1/4']);
    expect(embed?.description).toContain('3 places libres');
    expect(embed?.description?.split('\n')).toHaveLength(4);
  });

  it('le menu des directives coche celles déjà retenues ; aucun menu sans directive', () => {
    const row = directivesMenu(missionEvent({ directives: ['Sans régénération'] }), DIRECTIVES);
    const menu = row?.toJSON().components[0] as {
      custom_id: string;
      min_values: number;
      max_values: number;
      options: { label: string; value: string; description?: string; default: boolean }[];
    };

    expect(menu).toMatchObject({ custom_id: 'td2:directives:12', min_values: 0, max_values: 2 });
    expect(menu.options).toEqual([
      {
        label: 'Brouillard de guerre',
        value: '1',
        description: 'Mini-carte vide.',
        default: false,
      },
      { label: 'Sans régénération', value: '2', default: true },
    ]);
    expect(directivesMenu(missionEvent(), [])).toBeNull();
  });

  it('« Gérer » propose les directives à une mission, pas à un raid', () => {
    expect(manageMenu(missionEvent(), DIRECTIVES).components).toHaveLength(2);
    expect(manageMenu(raidEvent(), DIRECTIVES).components).toHaveLength(1);
  });

  it('la montée de la réserve d’une mission ne parle pas de rôle', () => {
    const message = promotionMessage(missionEvent(), [{ userId: '7', role: 'PLAYER' }]);

    expect(message.content).toBe(
      '🎉 <@7>, une place s’est libérée : tu passes dans l’équipe de **🎯 Mission Capitole · Héroïque** !',
    );
  });
});
