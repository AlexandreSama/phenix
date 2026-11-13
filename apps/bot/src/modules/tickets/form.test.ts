import { ComponentType, TextInputStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildTicketModal, DELETED_QUESTION_LABEL, readFormAnswers } from './form.js';

const question = (id: number, over: object = {}) => ({
  id,
  label: `Question ${id}`,
  placeholder: null,
  style: 'SHORT' as const,
  required: true,
  maxLength: 200,
  position: id,
  ...over,
});

const type = (questions: ReturnType<typeof question>[], name = 'Recrutement') => ({
  id: 9,
  name,
  questions,
});

describe('formulaire d’un type', () => {
  it('pose une question par champ, identifié par l’id de la question', () => {
    const modal = buildTicketModal(
      type([
        question(11, { placeholder: 'Ton pseudo en jeu', maxLength: 32 }),
        question(12, { style: 'PARAGRAPH', required: false, maxLength: 1000 }),
      ]),
    ).toJSON();

    expect(modal.custom_id).toBe('ticket:form:9');
    expect(modal.title).toBe('Recrutement');
    expect(modal.components).toMatchObject([
      {
        type: ComponentType.Label,
        label: 'Question 11',
        component: {
          type: ComponentType.TextInput,
          custom_id: '11',
          style: TextInputStyle.Short,
          required: true,
          max_length: 32,
          placeholder: 'Ton pseudo en jeu',
        },
      },
      {
        type: ComponentType.Label,
        label: 'Question 12',
        component: {
          custom_id: '12',
          style: TextInputStyle.Paragraph,
          required: false,
          max_length: 1000,
        },
      },
    ]);
  });

  it('coupe le titre à 45 caractères, la limite de Discord', () => {
    const modal = buildTicketModal(type([question(1)], 'N'.repeat(80))).toJSON();

    expect(modal.title).toHaveLength(45);
    expect(modal.title.endsWith('…')).toBe(true);
  });

  it('garde au plus cinq questions : la limite d’un formulaire Discord', () => {
    const six = [1, 2, 3, 4, 5, 6].map((id) => question(id));

    expect(buildTicketModal(type(six)).toJSON().components).toHaveLength(5);
  });
});

const submitted = (...entries: [string, string][]) =>
  entries.map(([customId, value]) => ({ customId, value }));

describe('lire les réponses du formulaire', () => {
  it('associe chaque réponse au libellé de sa question, dans l’ordre du formulaire', () => {
    const answers = readFormAnswers(
      type([question(11, { label: 'Pseudo' }), question(12, { label: 'Détails' })]),
      submitted(['11', ' Phénix '], ['12', 'Une longue histoire']),
    );

    expect(answers).toEqual([
      { label: 'Pseudo', value: 'Phénix' },
      { label: 'Détails', value: 'Une longue histoire' },
    ]);
  });

  it('garde la réponse d’une question supprimée depuis l’affichage du formulaire', () => {
    const answers = readFormAnswers(
      type([question(11, { label: 'Pseudo' })]),
      submitted(['11', 'Phénix'], ['12', 'Réponse orpheline']),
    );

    expect(answers).toEqual([
      { label: 'Pseudo', value: 'Phénix' },
      { label: DELETED_QUESTION_LABEL, value: 'Réponse orpheline' },
    ]);
    expect(DELETED_QUESTION_LABEL).toBe('Question supprimée');
  });

  it('marque une réponse facultative laissée vide, sans la perdre', () => {
    const answers = readFormAnswers(
      type([question(11, { required: false, label: 'Détails' })]),
      submitted(['11', '   ']),
    );

    expect(answers).toEqual([{ label: 'Détails', value: null }]);
  });

  it('ignore un champ qui n’est pas un id de question', () => {
    const answers = readFormAnswers(type([question(11)]), submitted(['11', 'ok'], ['abc', 'x']));

    expect(answers).toEqual([{ label: 'Question 11', value: 'ok' }]);
  });
});
