import { z } from 'zod';
import type { RawTicketStats, TicketStats } from '../api.js';
import { requiredIdSchema as requiredId, snowflakeSchema } from './guild-config.js';
import { emojiSchema } from './role-panel.js';

export const TICKET_LIMITS = {
  staffRoles: 10,
  title: 100,
  description: 1000,
  buttonLabel: 80,
  /** Types de ticket par serveur : la limite d'un menu déroulant Discord */
  types: 25,
  typeName: 80,
  typeDescription: 100,
  /** Questions par type : la limite d'un formulaire (modal) Discord */
  questions: 5,
  questionLabel: 45,
  questionPlaceholder: 100,
  /** Longueur maximale d'une réponse : la limite d'un champ de formulaire Discord */
  answerLength: 1000,
} as const;

/** Le message « Ouvrir un ticket » que le bot poste dans un salon. */
export const ticketPanelSchema = z.object({
  channelId: requiredId('Choisis le salon du panel'),
  title: z
    .string()
    .trim()
    .min(1, 'Le titre est obligatoire')
    .max(TICKET_LIMITS.title, `${TICKET_LIMITS.title} caractères au plus`),
  description: z
    .string()
    .trim()
    .max(TICKET_LIMITS.description, `${TICKET_LIMITS.description} caractères au plus`)
    .nullable(),
  buttonLabel: z
    .string()
    .trim()
    .min(1, 'Le texte du bouton est obligatoire')
    .max(TICKET_LIMITS.buttonLabel, `${TICKET_LIMITS.buttonLabel} caractères au plus`),
});

/** Délais d'inactivité proposés, en heures : 12 h, 24 h, 48 h, 72 h, 7 jours. */
export const TICKET_INACTIVITY_CHOICES = [12, 24, 48, 72, 168] as const;

const inactivityMessage = 'Choisis un délai proposé, ou désactive la fermeture automatique';

const answerLengthMessage = `Longueur de réponse invalide (1 à ${TICKET_LIMITS.answerLength})`;

/** Une question du formulaire d'un type. La réponse est postée dans le salon, jamais stockée. */
export const ticketQuestionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'La question est obligatoire')
    .max(TICKET_LIMITS.questionLabel, `${TICKET_LIMITS.questionLabel} caractères au plus`),
  placeholder: z
    .string()
    .trim()
    .max(
      TICKET_LIMITS.questionPlaceholder,
      `${TICKET_LIMITS.questionPlaceholder} caractères au plus`,
    )
    .nullable(),
  style: z.enum(['SHORT', 'PARAGRAPH']),
  required: z.boolean(),
  maxLength: z
    .number({ error: answerLengthMessage })
    .int(answerLengthMessage)
    .min(1, answerLengthMessage)
    .max(TICKET_LIMITS.answerLength, answerLengthMessage),
});

/** Un type de ticket : où ouvrir le salon, qui le voit, et le formulaire posé à l'ouverture. */
export const ticketTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire')
    .max(TICKET_LIMITS.typeName, `${TICKET_LIMITS.typeName} caractères au plus`),
  description: z
    .string()
    .trim()
    .max(TICKET_LIMITS.typeDescription, `${TICKET_LIMITS.typeDescription} caractères au plus`)
    .nullable(),
  emoji: emojiSchema.nullable(),
  categoryId: requiredId('Choisis une catégorie'),
  staffRoleIds: z
    .array(snowflakeSchema)
    .min(1, 'Choisis au moins un rôle : sinon personne ne verrait les tickets')
    .max(TICKET_LIMITS.staffRoles, `${TICKET_LIMITS.staffRoles} rôles au plus`),
  /** Heures sans message avant la fermeture automatique ; null : jamais (réglage par défaut) */
  inactivityHours: z
    .number({ error: inactivityMessage })
    .refine((hours) => (TICKET_INACTIVITY_CHOICES as readonly number[]).includes(hours), {
      error: inactivityMessage,
    })
    .nullable(),
  questions: z
    .array(ticketQuestionSchema)
    .max(
      TICKET_LIMITS.questions,
      `${TICKET_LIMITS.questions} questions au plus : la limite d’un formulaire Discord`,
    ),
});

/** Les réglages de l'onglet « Tickets » : le salon de logs et le panel. Le reste est par type. */
export const ticketSettingsSchema = z.object({
  logChannelId: snowflakeSchema.nullable(),
  panel: ticketPanelSchema,
});

export type TicketQuestionInput = z.infer<typeof ticketQuestionSchema>;
export type TicketTypeInput = z.infer<typeof ticketTypeSchema>;
export type TicketPanelInput = z.infer<typeof ticketPanelSchema>;
export type TicketSettingsInput = z.infer<typeof ticketSettingsSchema>;

/** ?status=open|closed&page= de la liste des tickets. */
export const ticketListQuerySchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
  page: z.coerce
    .number({ error: 'Numéro de page invalide' })
    .int('Numéro de page invalide')
    .min(1, 'Numéro de page invalide')
    .max(1000, 'Numéro de page invalide')
    .default(1),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

/** Tickets par page sur le site. */
export const TICKET_PAGE_SIZE = 20;

/** La note que l'auteur donne à un ticket fermé : de 1 à 5 étoiles, entière. */
export const ticketRatingSchema = z
  .number({ error: 'La note doit être un nombre de 1 à 5' })
  .int('La note doit être un nombre entier de 1 à 5')
  .min(1, 'La note doit être comprise entre 1 et 5')
  .max(5, 'La note doit être comprise entre 1 et 5');

export type TicketRating = z.infer<typeof ticketRatingSchema>;

/** Jours après la fermeture pendant lesquels l'auteur peut encore noter son ticket. */
export const TICKET_RATING_WINDOW_DAYS = 7;

/** Notes minimum pour afficher une moyenne : en dessous, une moyenne désignerait une personne. */
export const TICKET_RATING_MIN_COUNT = 5;

/**
 * Prépare les statistiques pour le site (minimisation) : retire les nombres de notes et les
 * identifiants Discord, masque (null) les moyennes de moins de `TICKET_RATING_MIN_COUNT` notes,
 * arrondit les autres au dixième, et trie par nom (types : nom puis id ; membres : pseudo, puis
 * l'ordre reçu) : un tri par nombre de notes trahirait l'arrivée d'une nouvelle note. Fonction
 * pure : l'entrée n'est pas modifiée.
 */
export function maskRatingStats(raw: RawTicketStats): TicketStats {
  return {
    types: raw.types
      .map((row) => ({
        typeId: row.typeId,
        typeName: row.typeName,
        average: publicAverage(row),
      }))
      .toSorted(
        (a, b) =>
          compareNames(a.typeName, b.typeName) ||
          (a.typeId ?? Number.MAX_SAFE_INTEGER) - (b.typeId ?? Number.MAX_SAFE_INTEGER),
      ),
    // Le tri de JavaScript est stable : à pseudo égal, l'ordre reçu est gardé
    members: raw.members
      .map((row) => ({
        claimedByName: row.claimedByName,
        average: publicAverage(row),
      }))
      .toSorted((a, b) => compareNames(a.claimedByName, b.claimedByName)),
  };
}

/** Ordre alphabétique français ; un nom absent (null) va à la fin. */
function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'fr');
}

/**
 * Arrondi au dixième le plus proche, la moitié vers le haut (4,25 → 4,3 ; 4,35 → 4,4). Le
 * pré-arrondi à 6 décimales corrige l'écriture binaire (4,35 × 10 = 43,4999…).
 */
function publicAverage({ count, average }: { count: number; average: number | null }) {
  if (average === null || count < TICKET_RATING_MIN_COUNT) return null;
  return Math.round(Number((average * 10).toFixed(6))) / 10;
}
