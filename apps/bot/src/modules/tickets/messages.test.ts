import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { closedTicketLog, OPEN_CUSTOM_ID, ticketPanelMessage, welcomeMessage } from './messages.js';
import { ticketChannelName, ticketOverwrites, transcriptKey } from './permissions.js';

const ticket = {
  id: 7,
  number: 42,
  ownerId: '200000000000000001',
  guildId: '100000000000000001',
  createdAt: new Date('2026-11-07T13:00:00Z'),
};

describe('messages des tickets', () => {
  it('le panel porte un seul bouton « Ouvrir »', () => {
    const { embeds, components } = ticketPanelMessage({
      title: 'Support',
      description: null,
      buttonLabel: 'Ouvrir un ticket',
    });

    expect(embeds[0]?.data.title).toBe('Support');
    const button = components[0]?.components[0]?.toJSON();
    expect(button).toMatchObject({ custom_id: OPEN_CUSTOM_ID, label: 'Ouvrir un ticket' });
  });

  it('le message d’accueil ne notifie que l’auteur et l’équipe', () => {
    const message = welcomeMessage(ticket, ['300000000000000001']);

    expect(message.content).toBe('<@200000000000000001> <@&300000000000000001>');
    expect(message.allowedMentions).toEqual({
      users: ['200000000000000001'],
      roles: ['300000000000000001'],
    });
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
