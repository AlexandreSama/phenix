import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModeForm } from './mode-form';

const mode = {
  id: 3,
  name: 'Normal',
  slots: { DPS: 6, HEAL: 1, TANK: 1, HEAL_TANK: 0 },
  eventCount: 0,
};

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('ModeForm', () => {
  it('ajoute un mode : nom et places, le total suit la saisie', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ModeForm idPrefix="new" onSubmit={onSubmit} />);

    fireEvent.change(field('Nom du mode'), { target: { value: 'Semi-Speed' } });
    fireEvent.change(field('DPS'), { target: { value: '5' } });
    fireEvent.change(field('Heal'), { target: { value: '1' } });
    fireEvent.change(field('Tank'), { target: { value: '2' } });
    expect(screen.getByText('8/8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le mode' }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Semi-Speed',
        slots: { DPS: 5, HEAL: 1, TANK: 2, HEAL_TANK: 0 },
      }),
    );
    // Le formulaire d'ajout repart à vide
    await vi.waitFor(() => expect(field('Nom du mode').value).toBe(''));
  });

  it('refuse plus de 8 joueurs avant d’appeler l’API', async () => {
    const onSubmit = vi.fn();
    render(<ModeForm mode={mode} idPrefix="m3" onSubmit={onSubmit} />);

    fireEvent.change(field('DPS'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Entre 1 et 8 joueurs au total');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('un mode qui a servi ne se supprime pas', () => {
    render(
      <ModeForm
        mode={{ ...mode, eventCount: 3 }}
        idPrefix="m3"
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveProperty('disabled', true);
    expect(screen.getByText('A servi à 3 sorties.')).toBeTruthy();
  });

  it('affiche le refus de l’API', async () => {
    render(
      <ModeForm
        mode={mode}
        idPrefix="m3"
        onSubmit={vi.fn().mockRejectedValue(new Error('Ce nom est déjà pris'))}
      />,
    );

    fireEvent.change(field('Nom du mode'), { target: { value: 'Semi-Speed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Ce nom est déjà pris');
  });
});
