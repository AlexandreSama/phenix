import { z } from 'zod';

/** Canal pub/sub sur lequel l'API prévient le bot. */
export const BOT_EVENTS_CHANNEL = 'bot:events';

export const botEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('config.updated'), guildId: z.string() }),
  z.object({ type: z.literal('rolePanel.publish'), panelId: z.number().int() }),
  z.object({ type: z.literal('giveaway.publish'), giveawayId: z.number().int() }),
  z.object({ type: z.literal('ticketPanel.publish'), guildId: z.string() }),
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
