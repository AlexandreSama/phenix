import { BRAND } from '@phenix/shared';
import type { Collection, GuildTextBasedChannel, Message } from 'discord.js';

export interface TranscriptMessage {
  authorName: string;
  authorAvatarUrl: string;
  authorIsBot: boolean;
  createdAt: Date;
  content: string;
  attachments: { name: string; url: string }[];
  embeds: { title: string | null; description: string | null }[];
}

export interface TranscriptInput {
  guildName: string;
  ticketNumber: number;
  ownerName: string;
  closedByName: string;
  openedAt: Date;
  closedAt: Date;
  /** Fuseau du serveur (réglage « Général ») pour afficher les heures */
  timeZone: string;
  messages: TranscriptMessage[];
}

/** Au-delà, le transcript s'arrête : un ticket n'est pas un salon de discussion. */
export const TRANSCRIPT_MAX_MESSAGES = 5000;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Tout texte venu de Discord passe par ici : un message ne peut pas injecter de HTML. */
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** Seuls les liens https:// sont gardés : pas de `javascript:` dans un href. */
const safeUrl = (url: string) => (url.startsWith('https://') ? escapeHtml(url) : null);

/** Recopie un message Discord dans un format simple, sans objet discord.js. */
export function toTranscriptMessage(message: Message): TranscriptMessage {
  return {
    authorName: message.member?.displayName ?? message.author.displayName,
    authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 64 }),
    authorIsBot: message.author.bot,
    createdAt: message.createdAt,
    // cleanContent remplace les mentions <@123> par @pseudo
    content: message.cleanContent,
    attachments: [...message.attachments.values()].map((file) => ({
      name: file.name,
      url: file.url,
    })),
    embeds: message.embeds.map((embed) => ({ title: embed.title, description: embed.description })),
  };
}

/** Tous les messages du salon, du plus ancien au plus récent, par paquets de 100 (limite de Discord). */
export async function fetchChannelMessages(
  channel: GuildTextBasedChannel,
  max = TRANSCRIPT_MAX_MESSAGES,
): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;
  while (all.length < max) {
    const batch: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before });
    all.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.lastKey();
  }
  return all.slice(0, max).toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function renderMessage(message: TranscriptMessage, date: Intl.DateTimeFormat): string {
  const avatar = safeUrl(message.authorAvatarUrl);
  const attachments = message.attachments
    .map((file) => {
      const url = safeUrl(file.url);
      return url
        ? `<li><a href="${url}" rel="noreferrer" target="_blank">${escapeHtml(file.name)}</a></li>`
        : '';
    })
    .join('');
  const embeds = message.embeds
    .map(
      (embed) =>
        `<div class="embed">${embed.title ? `<strong>${escapeHtml(embed.title)}</strong>` : ''}${
          embed.description ? `<p>${escapeHtml(embed.description)}</p>` : ''
        }</div>`,
    )
    .join('');

  return `<article class="message">
  ${avatar ? `<img class="avatar" src="${avatar}" alt="" width="40" height="40" loading="lazy">` : '<span class="avatar"></span>'}
  <div class="body">
    <p class="meta"><strong>${escapeHtml(message.authorName)}</strong>${message.authorIsBot ? ' <span class="bot">BOT</span>' : ''} <time datetime="${message.createdAt.toISOString()}">${date.format(message.createdAt)}</time></p>
    ${message.content ? `<div class="content">${escapeHtml(message.content)}</div>` : ''}
    ${attachments ? `<ul class="attachments">${attachments}</ul>` : ''}
    ${embeds}
  </div>
</article>`;
}

/** Une page HTML autonome : styles intégrés, aucun script. Elle s'ouvre telle quelle dans un navigateur. */
export function renderTranscript(input: TranscriptInput): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: input.timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const title = `Ticket #${input.ticketNumber} · ${escapeHtml(input.guildName)}`;
  const body =
    input.messages.map((message) => renderMessage(message, date)).join('\n') ||
    '<p class="empty">Aucun message.</p>';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; background: ${BRAND.ink}; color: #f3ece6; font: 15px/1.5 system-ui, sans-serif; }
  header { padding: 24px; border-bottom: 1px solid ${BRAND.brown}; }
  header h1 { margin: 0 0 4px; font-size: 20px; color: #fff; }
  header p { margin: 0; color: #b9aca3; font-size: 13px; }
  main { padding: 8px 24px 32px; max-width: 900px; }
  .message { display: flex; gap: 12px; padding: 10px 0; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; background: ${BRAND.brown}; flex-shrink: 0; }
  .body { min-width: 0; }
  .meta { margin: 0; font-size: 13px; color: #b9aca3; }
  .meta strong { color: #fff; font-size: 15px; margin-right: 6px; }
  .bot { background: ${BRAND.flame}; color: ${BRAND.ink}; border-radius: 4px; padding: 0 4px; font-size: 11px; font-weight: 700; }
  .content { white-space: pre-wrap; overflow-wrap: anywhere; }
  .attachments { margin: 4px 0 0; padding-left: 18px; }
  a { color: ${BRAND.gold}; }
  .embed { border-left: 4px solid ${BRAND.flame}; background: #2a1a12; border-radius: 4px; padding: 8px 12px; margin-top: 6px; }
  .embed p { margin: 4px 0 0; white-space: pre-wrap; }
  .empty { color: #b9aca3; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <p>Ouvert par ${escapeHtml(input.ownerName)} le ${date.format(input.openedAt)} · fermé par ${escapeHtml(input.closedByName)} le ${date.format(input.closedAt)} · ${input.messages.length} messages</p>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}
