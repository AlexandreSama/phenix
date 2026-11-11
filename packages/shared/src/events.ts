import { z } from 'zod';

/** Canal pub/sub sur lequel l'API prévient le bot. */
export const BOT_EVENTS_CHANNEL = 'bot:events';

export const botEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('config.updated'), guildId: z.string() }),
  z.object({ type: z.literal('rolePanel.publish'), panelId: z.number().int() }),
  // Le panel n'existe plus en base : l'événement porte de quoi retrouver son message
  z.object({
    type: z.literal('rolePanel.delete'),
    guildId: z.string(),
    channelId: z.string(),
    messageId: z.string(),
  }),
  z.object({ type: z.literal('ticketPanel.publish'), guildId: z.string() }),
  // Supprimé depuis la page d'administration : le bot retire son embed du salon du staff
  z.object({
    type: z.literal('td2Report.deleted'),
    guildId: z.string(),
    messageId: z.string(),
  }),
  // Le panel change de salon : l'ancien message part, comme pour un panel de rôles
  z.object({
    type: z.literal('ticketPanel.delete'),
    guildId: z.string(),
    channelId: z.string(),
    messageId: z.string(),
  }),
]);

export type BotEvent = z.infer<typeof botEventSchema>;

/** Lit un message reçu sur Redis. Renvoie null s'il est mal formé, au lieu de planter le bot. */
export function parseBotEvent(raw: string): BotEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = botEventSchema.safeParse(data);
  return result.success ? result.data : null;
}
