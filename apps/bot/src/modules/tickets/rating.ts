import { rateTicket, type Ticket } from '@phenix/database';
import { ticketRatingSchema } from '@phenix/shared';
import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes, type Client } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import { isDiscordError } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { parseTicketId, ratingMessage } from './messages.js';

export const RATING_REPLIES = {
  thanks: 'Merci pour ta note !',
  already: 'Tu as déjà noté ce ticket.',
  refused:
    'Cette note ne peut plus être enregistrée : le délai est dépassé ou le ticket est indisponible.',
} as const;

/**
 * Lit `<ticketId>:<n>` du customId d'un bouton de note. Tout ce qui n'est pas écrit exactement
 * comme le bot l'écrit (id entier positif, note entière de 1 à 5) est ignoré.
 */
function parseRating(id: string | undefined): { ticketId: number; rating: number } | null {
  const match = /^(\d+):([1-5])$/.exec(id ?? '');
  if (!match) return null;
  const ticketId = parseTicketId(match[1]);
  const rating = ticketRatingSchema.safeParse(Number(match[2]));
  if (ticketId === null || !rating.success) return null;
  return { ticketId, rating: rating.data };
}

/**
 * Après une fermeture réussie : un message privé à l'auteur avec cinq boutons de note. Un échec
 * (messages privés fermés, membre parti…) n'est jamais une erreur et ne bloque jamais la fermeture ;
 * le journal ne dit ni qui ni quel serveur.
 */
export async function requestRating(
  client: Pick<Client, 'users'>,
  ticket: Pick<Ticket, 'id' | 'number' | 'ownerId'>,
  guildName: string,
  logger: Pick<Logger, 'info' | 'warn'>,
): Promise<void> {
  try {
    const user = await client.users.fetch(ticket.ownerId);
    await user.send(ratingMessage(ticket, guildName));
  } catch (err) {
    if (isDiscordError(err, RESTJSONErrorCodes.CannotSendMessagesToThisUser)) {
      logger.info('Note de satisfaction non demandée : messages privés fermés');
    } else {
      // Le code seul : l'erreur brute porte l'URL (avec l'identifiant du membre) et son message
      const code = err instanceof DiscordAPIError ? err.code : undefined;
      logger.warn(
        { code },
        'Note de satisfaction non demandée : message privé impossible à envoyer',
      );
    }
  }
}

/**
 * Les boutons de note du message privé. Un message privé n'a pas de serveur : aucun contrôle de
 * serveur ici, c'est `rateTicket` qui ne retient que la note de l'auteur, une fois, dans les délais.
 */
export function createRatingHandler(): ComponentHandler[] {
  const rate: ComponentHandler = {
    prefix: 'ticket:rate',
    async execute(interaction, id, { db }) {
      if (!interaction.isButton()) return;
      const parsed = parseRating(id);
      if (!parsed) return;

      const outcome = await rateTicket(db, parsed.ticketId, interaction.user.id, parsed.rating);
      if (outcome === 'refused') {
        await interaction.reply({ content: RATING_REPLIES.refused, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.update({
        content: outcome === 'rated' ? RATING_REPLIES.thanks : RATING_REPLIES.already,
        components: [],
      });
    },
  };
  return [rate];
}
