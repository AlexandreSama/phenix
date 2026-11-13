import type { TicketTypeSummary } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketTypeList } from './ticket-type-list';

const type = (
  id: number,
  name: string,
  questionCount: number,
  emoji: string | null = null,
  inactivityHours: number | null = null,
): TicketTypeSummary => ({
  id,
  name,
  description: null,
  emoji,
  categoryId: '1',
  staffRoleIds: ['2'],
  inactivityHours,
  questionCount,
});

const renderList = (
  types: TicketTypeSummary[],
  onDelete = vi.fn().mockResolvedValue(undefined),
) => {
  render(
    <TicketTypeList
      types={types}
      onDelete={onDelete}
      edit={(entry) => <a href={`/t/${entry.id}`}>Modifier {entry.name}</a>}
      add={<a href="/t/nouveau">Ajouter un type</a>}
    />,
  );
  return onDelete;
};

describe('TicketTypeList', () => {
  it('affiche le délai de fermeture automatique seulement quand il est actif', () => {
    renderList([
      type(1, 'Support', 0, null, 48),
      type(2, 'Bug', 0, null, 168),
      type(3, 'Autre', 0),
    ]);
    expect(screen.getByText('Fermeture automatique après 48 heures')).toBeTruthy();
    expect(screen.getByText('Fermeture automatique après 7 jours')).toBeTruthy();
    expect(screen.getAllByText(/Fermeture automatique/)).toHaveLength(2);
  });

  it('affiche le nom, l’emoji et le nombre de questions', () => {
    renderList([type(1, 'Support', 0, '🎫'), type(2, 'Bug', 1), type(3, 'Recrutement', 3)]);
    expect(screen.getByText('🎫')).toBeTruthy();
    // Le nom revient aussi dans le texte réservé aux lecteurs d'écran du bouton « Supprimer »
    expect(screen.getAllByText('Support').length).toBeGreaterThan(0);
    expect(screen.getByText('aucune question')).toBeTruthy();
    expect(screen.getByText('1 question')).toBeTruthy();
    expect(screen.getByText('3 questions')).toBeTruthy();
    expect(screen.getByText('3 / 25 types')).toBeTruthy();
  });

  it('demande confirmation avant de supprimer', () => {
    const onDelete = renderList([type(1, 'Support', 0)]);
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('annule la suppression', () => {
    const onDelete = renderList([type(1, 'Support', 0)]);
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('button', { name: 'Confirmer la suppression' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('désactive l’ajout à 25 types', () => {
    renderList(Array.from({ length: 25 }, (_, i) => type(i + 1, `T${i + 1}`, 0)));
    expect(screen.getByText(/supprime-en un/)).toBeTruthy();
    expect(screen.getByText('Ajouter un type').closest('[aria-disabled]')).toBeTruthy();
  });

  it('invite à créer le premier type quand il n’y en a aucun', () => {
    renderList([]);
    expect(screen.getByText('Aucun type de ticket pour l’instant')).toBeTruthy();
  });
});
