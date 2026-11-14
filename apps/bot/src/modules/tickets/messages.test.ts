import { TICKET_RATING_MIN_COUNT, TICKET_RATING_WINDOW_DAYS } from '@phenix/shared';
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_CLOSER_LABEL,
  CHOOSE_CUSTOM_ID,
  claimCustomId,
  closedTicketLog,
  formAnswersMessage,
  OPEN_CUSTOM_ID,
  rateCustomId,
  ratingMessage,
  ticketPanelMessage,
  ticketTypeChoice,
  welcomeButtons,
  welcomeMessage,
} from './messages.js';
import { ticketChannelName, ticketOverwrites, transcriptKey } from './permissions.js';

const ticket = {
  id: 7,
  number: 42,
  ownerId: '200000000000000001',
  guildId: '100000000000000001',
  createdAt: new Date('2026-11-07T13:00:00Z'),
};

const panel = { title: 'Support', description: null, buttonLabel: 'Ouvrir un ticket' };

/** `count` types, dans l'ordre ; le premier a un emoji, tous une description. */
const types = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Type ${index + 1}`,
    description: `Description ${index + 1}`,
    emoji: index === 0 ? '🎫' : null,
  }));

describe('messages des tickets', () => {
  it('le panneau ne porte qu’un seul bouton « Ouvrir un ticket », quel que soit le nombre de types', () => {
    const { embeds, components } = ticketPanelMessage(panel);

    expect(embeds[0]?.data.title).toBe('Support');
    expect(components).toHaveLength(1);
    const buttons = components[0]?.toJSON().components;
    expect(buttons).toMatchObject([
      {
        type: ComponentType.Button,
        custom_id: OPEN_CUSTOM_ID,
        label: 'Ouvrir un ticket',
        emoji: { name: '🎫' },
      },
    ]);
  });

  it('le bouton du panneau prend le texte réglé sur le site', () => {
    const { components } = ticketPanelMessage({ ...panel, buttonLabel: 'Besoin d’aide ?' });

    expect(components[0]?.toJSON().components[0]).toMatchObject({ label: 'Besoin d’aide ?' });
  });

  it('le choix du type est un menu « Type de ticket » à une option par type', () => {
    const { content, components } = ticketTypeChoice(types(25));

    expect(content).toBe('Quel est le type de ton ticket ?');
    expect(components).toHaveLength(1);
    const menu = components[0]?.toJSON().components[0];
    expect(menu).toMatchObject({
      type: ComponentType.StringSelect,
      custom_id: CHOOSE_CUSTOM_ID,
      placeholder: 'Type de ticket',
    });
    const options = (menu as { options: { value: string; label: string }[] }).options;
    expect(options).toHaveLength(25);
    expect(options[0]).toMatchObject({
      value: '1',
      label: 'Type 1',
      description: 'Description 1',
      emoji: { name: '🎫' },
    });
  });

  it('le menu de choix s’arrête à 25 types, la limite de Discord', () => {
    const menu = ticketTypeChoice(types(30)).components[0]?.toJSON().components[0];

    expect((menu as { options: unknown[] }).options).toHaveLength(25);
  });

  it('les identifiants des composants tiennent dans les 100 caractères de Discord', () => {
    expect(OPEN_CUSTOM_ID).toBe('ticket:open');
    expect(CHOOSE_CUSTOM_ID).toBe('ticket:choose');
  });

  it('le message d’accueil ne notifie que l’auteur et les rôles du type, et nomme le type', () => {
    const message = welcomeMessage(ticket, {
      name: 'Recrutement',
      staffRoleIds: ['300000000000000001'],
    });

    expect(message.content).toBe('<@200000000000000001> <@&300000000000000001>');
    expect(message.allowedMentions).toEqual({
      users: ['200000000000000001'],
      roles: ['300000000000000001'],
    });
    const embed = message.embeds?.[0] as {
      toJSON(): { fields?: { name: string; value: string }[] };
    };
    expect(embed.toJSON().fields).toEqual([
      expect.objectContaining({ name: 'Type', value: 'Recrutement' }),
    ]);
  });

  it('le message d’accueil porte « Prendre en charge » à côté de « Fermer le ticket »', () => {
    const message = welcomeMessage(ticket, { name: 'Recrutement', staffRoleIds: [] });

    const row = message.components?.[0] as { toJSON(): { components: unknown[] } };
    expect(row.toJSON().components).toMatchObject([
      { custom_id: 'ticket:claim:7', label: 'Prendre en charge', style: ButtonStyle.Success },
      { custom_id: 'ticket:close:7', label: 'Fermer le ticket' },
    ]);
  });

  it('une fois le ticket pris en charge, il ne reste que « Fermer le ticket »', () => {
    const [row] = welcomeButtons(7, { claimed: true });

    expect(row?.toJSON().components).toMatchObject([{ custom_id: 'ticket:close:7' }]);
    expect(row?.toJSON().components).toHaveLength(1);
  });

  it('le log ajoute un lien vers le transcript seulement si le site est déployé', () => {
    const base = { ticket, closedById: '1', closedAt: new Date(), messageCount: 3 };

    const withSite = closedTicketLog({ ...base, publicUrl: 'https://phenix.example' });
    const row = withSite.components?.[0] as { toJSON(): { components: unknown[] } } | undefined;
    const link = row?.toJSON().components[0];
    expect(link).toMatchObject({
      style: ButtonStyle.Link,
      url: 'https://phenix.example/dashboard/100000000000000001/tickets/7',
    });

    expect(closedTicketLog(base).components).toEqual([]);
  });

  it('fermeture automatique : « Fermé par » dit « Fermeture automatique », sans mention', () => {
    const log = closedTicketLog({
      ticket,
      closedById: null,
      closedAt: new Date(),
      messageCount: 3,
    });
    const embed = log.embeds?.[0] as { toJSON(): { fields: { name: string; value: string }[] } };
    const fields = embed.toJSON().fields;

    expect(fields.find((field) => field.name === 'Fermé par')?.value).toBe(AUTOMATIC_CLOSER_LABEL);
  });
});

describe('salon d’un ticket', () => {
  it('se cache de @everyone et s’ouvre à l’auteur, l’équipe et le bot', () => {
    const overwrites = ticketOverwrites({
      everyoneId: 'everyone',
      ownerId: 'owner',
      staffRoleIds: ['staff'],
      botId: 'bot',
    });

    expect(overwrites.map((overwrite) => overwrite.id)).toEqual([
      'everyone',
      'owner',
      'staff',
      'bot',
    ]);
    expect(overwrites[0]).toHaveProperty('deny');
  });

  it('numérote sur quatre chiffres et range le transcript par serveur', () => {
    expect(ticketChannelName(42)).toBe('ticket-0042');
    expect(ticketChannelName(12_345)).toBe('ticket-12345');
    expect(transcriptKey('100', 42)).toBe('100/ticket-0042.html');
  });
});

const textOf = (embed: { data: { title?: string; description?: string } }) =>
  (embed.data.title?.length ?? 0) + (embed.data.description?.length ?? 0);

describe('réponses du formulaire', () => {
  it('poste un embed par réponse, sans aucune mention', () => {
    const message = formAnswersMessage([
      { label: 'Pseudo', value: '@everyone <@1>' },
      { label: 'Détails', value: null },
    ]);

    expect(message.allowedMentions).toEqual({ parse: [] });
    expect(message.embeds).toHaveLength(2);
    expect(message.embeds[0]?.data).toMatchObject({
      title: 'Pseudo',
      description: '@everyone <@1>',
    });
    expect(message.embeds[1]?.data.description).toBe('*Pas de réponse*');
  });

  it('tronque pour rester sous les 6000 caractères d’un message', () => {
    const answers = Array.from({ length: 5 }, (_, index) => ({
      label: `Question ${index}`.padEnd(300, 'q'),
      value: 'r'.repeat(5000),
    }));

    const { embeds } = formAnswersMessage(answers);

    const total = embeds.reduce((sum, embed) => sum + textOf(embed), 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(embeds.length).toBeGreaterThan(0);
    for (const embed of embeds) {
      expect(embed.data.title?.length).toBeLessThanOrEqual(256);
      expect(embed.data.description?.length).toBeLessThanOrEqual(4096);
    }
    expect(embeds[0]?.data.description?.endsWith('…')).toBe(true);
  });
});

describe('demande de note de satisfaction', () => {
  it('propose cinq boutons de 1 à 5, des identifiants qui tiennent dans 100 caractères', () => {
    const message = ratingMessage({ id: 7, number: 42 }, 'Phénix');

    const buttons = message.components[0]?.toJSON().components;
    expect(buttons?.map((button) => (button as { custom_id: string }).custom_id)).toEqual([
      'ticket:rate:7:1',
      'ticket:rate:7:2',
      'ticket:rate:7:3',
      'ticket:rate:7:4',
      'ticket:rate:7:5',
    ]);
    expect(buttons?.map((button) => (button as { label: string }).label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(rateCustomId(2_147_483_647, 5).length).toBeLessThanOrEqual(100);
    expect(claimCustomId(2_147_483_647).length).toBeLessThanOrEqual(100);
  });

  it('dit fidèlement ce qui est fait de la note : enregistrée, moyennes seulement, jamais « anonyme »', () => {
    const { content } = ratingMessage({ id: 7, number: 42 }, 'Phénix');

    expect(content).toContain('Ticket #42');
    expect(content).toContain('Phénix');
    expect(content).not.toContain('anonyme');
    expect(content).toContain('Répondre est facultatif');
    expect(content).toContain('Ta note est enregistrée avec ce ticket');
    expect(content).toContain(`à partir de ${TICKET_RATING_MIN_COUNT} notes`);
    expect(content).toContain('une moyenne peut laisser deviner une note');
    // Qui voit quoi : la moyenne par type avec l'onglet Tickets, par membre les seuls administrateurs
    expect(content).toContain('la moyenne par type de ticket à qui a accès à l’onglet Tickets');
    expect(content).toContain(
      'la moyenne par membre de l’équipe qui a pris en charge aux seuls administrateurs du serveur',
    );
    expect(content).not.toContain('L’équipe du serveur ne voit');
    expect(content).toContain(`Tu as ${TICKET_RATING_WINDOW_DAYS} jours pour répondre`);
  });

  it('échappe le nom du serveur : ni lien masqué ni titre', () => {
    const { content } = ratingMessage({ id: 7, number: 42 }, '[Vérifie](https://evil.tld)');

    expect(content).toContain('\\[Vérifie](https://evil.tld)');
    expect(content).not.toMatch(/(^|[^\\])\[Vérifie\]\(/);
  });
});
