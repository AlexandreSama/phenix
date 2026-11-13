import type { TicketTypeDetail } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toTypeFormValues } from './type-form-values';
import { TicketTypeForm } from './ticket-type-form';

const CATEGORY = '100000000000000001';
const MODO = '500000000000000001';
const categories = [{ id: CATEGORY, name: 'Support' }];
const roles = [{ id: MODO, name: 'Modo', color: null, assignable: false, blockedReason: 'x' }];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined), type?: TicketTypeDetail) {
  render(
    <TicketTypeForm
      defaultValues={toTypeFormValues(type)}
      categories={categories}
      roles={roles}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('TicketTypeForm', () => {
  it('envoie null pour les champs vides, une liste de rôles et aucune question par défaut', async () => {
    const onSubmit = setup();

    change('Nom', 'Support');
    change('Catégorie des salons', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Support',
        description: null,
        emoji: null,
        categoryId: CATEGORY,
        staffRoleIds: [MODO],
        inactivityHours: null,
        questions: [],
      }),
    );
  });

  it('propose la fermeture automatique, désactivée par défaut, et envoie le délai choisi', async () => {
    const onSubmit = setup();
    const select = screen.getByLabelText<HTMLSelectElement>('Fermeture automatique');

    expect(select.value).toBe('');
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Désactivée'],
      ['12', '12 heures'],
      ['24', '24 heures'],
      ['48', '48 heures'],
      ['72', '72 heures'],
      ['168', '7 jours'],
    ]);
    expect(screen.getByText(/Un rappel est posté dans le salon à la moitié du délai/)).toBeTruthy();
    expect(screen.getByText(/hors fils de discussion\) remet le compteur à zéro/)).toBeTruthy();
    expect(screen.queryByText(/restés sans réponse/)).toBeNull();

    change('Nom', 'Support');
    change('Catégorie des salons', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    change('Fermeture automatique', '72');
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inactivityHours: 72 })),
    );
  });

  it('avertit de ne pas demander de données sensibles', () => {
    setup();
    expect(
      screen.getByText(
        'Ne demande pas de données sensibles (santé, âge, etc.) : les réponses restent dans le transcript du ticket.',
      ),
    ).toBeTruthy();
  });

  it('ajoute une question avec ses réglages et l’envoie', async () => {
    const onSubmit = setup();

    change('Nom', 'Recrutement');
    change('Catégorie des salons', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une question' }));
    change('Question 1', 'Ton pseudo en jeu ?');
    change('Texte d’aide 1', 'Exemple : Faye#42');
    change('Format 1', 'PARAGRAPH');
    fireEvent.click(screen.getByLabelText('Réponse obligatoire 1'));
    change('Longueur maximale 1', '300');
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [
            {
              label: 'Ton pseudo en jeu ?',
              placeholder: 'Exemple : Faye#42',
              style: 'PARAGRAPH',
              required: false,
              maxLength: 300,
            },
          ],
        }),
      ),
    );
  });

  it('limite à 5 questions, réordonne et retire', () => {
    setup();
    const add = () => screen.getByRole('button', { name: 'Ajouter une question' });
    for (let i = 0; i < 5; i += 1) fireEvent.click(add());
    expect((add() as HTMLButtonElement).disabled).toBe(true);

    change('Question 1', 'A');
    change('Question 2', 'B');
    fireEvent.click(screen.getByRole('button', { name: 'Descendre la question 1' }));
    expect(screen.getByLabelText<HTMLInputElement>('Question 1').value).toBe('B');
    expect(screen.getByLabelText<HTMLInputElement>('Question 2').value).toBe('A');

    fireEvent.click(screen.getByRole('button', { name: 'Retirer la question 1' }));
    expect(screen.queryByLabelText('Question 5')).toBeNull();
    expect((add() as HTMLButtonElement).disabled).toBe(false);
  });

  it('explique ce qui manque avec les messages du schéma partagé', async () => {
    const onSubmit = setup();

    submit();

    expect(await screen.findByText('Le nom est obligatoire')).toBeTruthy();
    expect(document.getElementById('typeCategoryId-error')?.textContent).toBe(
      'Choisis une catégorie',
    );
    expect(screen.getByText(/personne ne verrait les tickets/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuse une longueur de réponse hors limites', async () => {
    const onSubmit = setup();
    change('Nom', 'Support');
    change('Catégorie des salons', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une question' }));
    change('Question 1', 'Pourquoi ?');
    change('Longueur maximale 1', '5000');
    submit();

    expect(await screen.findByText('Longueur de réponse invalide (1 à 1000)')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche l’erreur renvoyée par l’API', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Catégorie inconnue sur ce serveur')));
    change('Nom', 'Support');
    change('Catégorie des salons', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    submit();

    expect(await screen.findByText('Catégorie inconnue sur ce serveur')).toBeTruthy();
  });

  it('préremplit un type existant', () => {
    setup(undefined, {
      id: 3,
      name: 'Bug',
      description: 'Un souci ?',
      emoji: '🐛',
      categoryId: CATEGORY,
      staffRoleIds: [MODO],
      inactivityHours: 24,
      questions: [
        { label: 'Étapes', placeholder: null, style: 'SHORT', required: true, maxLength: 200 },
      ],
    });
    expect(screen.getByLabelText<HTMLInputElement>('Nom').value).toBe('Bug');
    expect(screen.getByLabelText<HTMLSelectElement>('Fermeture automatique').value).toBe('24');
    expect(screen.getByLabelText<HTMLInputElement>('Question 1').value).toBe('Étapes');
    expect(screen.getByLabelText<HTMLInputElement>('Longueur maximale 1').value).toBe('200');
  });
});
