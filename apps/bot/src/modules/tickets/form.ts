import type { TicketTypeQuestion } from '@phenix/database';
import { ModalBuilder, TextInputStyle } from 'discord.js';
import { formCustomId, truncate, type FormAnswer } from './messages.js';

/** Les limites d'un formulaire Discord : 5 champs, 45 caractères de titre ou de libellé, 100 d'aide. */
const MAX_QUESTIONS = 5;
const TITLE_MAX = 45;
const PLACEHOLDER_MAX = 100;

export const DELETED_QUESTION_LABEL = 'Question supprimée';

type FormQuestion = Pick<
  TicketTypeQuestion,
  'id' | 'label' | 'placeholder' | 'style' | 'required' | 'maxLength'
>;
type FormType = { id: number; name: string; questions: FormQuestion[] };

/**
 * Le formulaire posé à l'ouverture d'un ticket de ce type : un champ par question. Le customId
 * d'un champ est l'id de la question, pour retrouver son libellé au retour.
 */
export function buildTicketModal(type: FormType): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(formCustomId(type.id))
    .setTitle(truncate(type.name, TITLE_MAX));
  for (const question of type.questions.slice(0, MAX_QUESTIONS)) {
    modal.addLabelComponents((label) =>
      label.setLabel(truncate(question.label, TITLE_MAX)).setTextInputComponent((input) => {
        input
          .setCustomId(String(question.id))
          .setStyle(
            question.style === 'PARAGRAPH' ? TextInputStyle.Paragraph : TextInputStyle.Short,
          )
          .setRequired(question.required)
          .setMaxLength(question.maxLength);
        if (question.placeholder) {
          input.setPlaceholder(truncate(question.placeholder, PLACEHOLDER_MAX));
        }
        return input;
      }),
    );
  }
  return modal;
}

/**
 * Les réponses envoyées, avec le libellé de leur question. Le type est relu à l'envoi : une
 * question supprimée entre l'affichage et l'envoi garde sa réponse, sous « Question supprimée ».
 * Une réponse facultative laissée vide donne `value: null`.
 */
export function readFormAnswers(
  type: Pick<FormType, 'questions'>,
  submitted: { customId: string; value: string }[],
): FormAnswer[] {
  const answers: FormAnswer[] = [];
  for (const field of submitted) {
    if (!/^\d+$/.test(field.customId)) continue;
    const question = type.questions.find((candidate) => candidate.id === Number(field.customId));
    answers.push({
      label: question?.label ?? DELETED_QUESTION_LABEL,
      value: field.value.trim() || null,
    });
  }
  return answers;
}
