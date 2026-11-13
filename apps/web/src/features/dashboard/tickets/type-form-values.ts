import { TICKET_LIMITS, ticketTypeSchema, type TicketTypeDetail } from '@phenix/shared';
import { z } from 'zod';

/** Un champ vidé vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const questionSchema = ticketTypeSchema.shape.questions.element;

/** Le schéma partagé, adapté aux champs du formulaire : mêmes règles et mêmes messages que l'API. */
export const ticketTypeFormSchema = ticketTypeSchema.extend({
  description: z.preprocess(emptyToNull, ticketTypeSchema.shape.description),
  emoji: z.preprocess(emptyToNull, ticketTypeSchema.shape.emoji),
  questions: questionSchema
    .extend({ placeholder: z.preprocess(emptyToNull, questionSchema.shape.placeholder) })
    .array()
    .max(
      TICKET_LIMITS.questions,
      `${TICKET_LIMITS.questions} questions au plus : la limite d’un formulaire Discord`,
    ),
});

export type TicketTypeFormInput = z.input<typeof ticketTypeFormSchema>;

/** Les délais proposés, sans réécrire la liste du schéma partagé : seul le libellé est d'ici. */
export const inactivityLabel = (hours: number) =>
  hours % 24 === 0 && hours >= 168 ? `${hours / 24} jours` : `${hours} heures`;

export const emptyQuestion = {
  label: '',
  placeholder: '',
  style: 'SHORT',
  required: true,
  maxLength: 1000,
} as const;

/** staffRoleIds part d'une liste, même vide : react-hook-form renvoie alors toujours une liste, même avec une seule case. */
export function toTypeFormValues(type?: TicketTypeDetail): TicketTypeFormInput {
  if (!type) {
    return {
      name: '',
      description: '',
      emoji: '',
      categoryId: '',
      staffRoleIds: [],
      inactivityHours: null,
      questions: [],
    };
  }
  return {
    name: type.name,
    description: type.description ?? '',
    emoji: type.emoji ?? '',
    categoryId: type.categoryId,
    staffRoleIds: type.staffRoleIds,
    inactivityHours: type.inactivityHours,
    questions: type.questions.map((question) => ({
      ...question,
      placeholder: question.placeholder ?? '',
    })),
  };
}
