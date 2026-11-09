import { describe, expect, it } from 'vitest';
import { escapeHtml, renderTranscript, type TranscriptMessage } from './transcript.js';

const message = (overrides: Partial<TranscriptMessage> = {}): TranscriptMessage => ({
  authorName: 'Agent',
  authorAvatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png',
  authorIsBot: false,
  createdAt: new Date('2026-11-07T13:05:00Z'),
  content: 'Bonjour',
  attachments: [],
  embeds: [],
  ...overrides,
});

const render = (messages: TranscriptMessage[]) =>
  renderTranscript({
    guildName: 'Phénix',
    ticketNumber: 42,
    ownerName: 'Agent',
    closedByName: 'Modo',
    openedAt: new Date('2026-11-07T13:00:00Z'),
    closedAt: new Date('2026-11-07T14:00:00Z'),
    timeZone: 'Europe/Paris',
    messages,
  });

describe('transcript', () => {
  it('échappe le HTML écrit par les membres', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );

    const html = render([
      message({ content: '<script>alert(1)</script>', authorName: '<b>Pirate</b>' }),
    ]);

    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<b>Pirate</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('ne garde que les liens https, pour les pièces jointes comme pour les avatars', () => {
    const html = render([
      message({
        authorAvatarUrl: 'javascript:alert(1)',
        attachments: [
          { name: 'capture.png', url: 'https://cdn.discordapp.com/attachments/1/capture.png' },
          { name: 'piege', url: 'javascript:alert(1)' },
        ],
      }),
    ]);

    expect(html).toContain('href="https://cdn.discordapp.com/attachments/1/capture.png"');
    expect(html).not.toContain('javascript:');
  });

  it('affiche les heures dans le fuseau du serveur et compte les messages', () => {
    const html = render([message(), message({ authorName: 'PhenixMG', authorIsBot: true })]);

    // 13 h 05 UTC = 14 h 05 à Paris en novembre
    expect(html).toContain('14:05');
    expect(html).toContain('Ticket #42 · Phénix');
    expect(html).toContain('2 messages');
    expect(html).toContain('<span class="bot">BOT</span>');
  });

  it('reste une page autonome, sans aucun script', () => {
    const html = render([]);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Aucun message.');
  });
});
