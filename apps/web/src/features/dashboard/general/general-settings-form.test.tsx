import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneralSettingsForm } from './general-settings-form';

const config = {
  timezone: 'Europe/Paris',
  modLogChannelId: null,
  announceChannelId: null,
  staffRoleIds: [],
};
const channels = [{ id: '400000000000000001', name: 'logs', parentName: 'Staff' }];
const roles = [
  {
    id: '500000000000000001',
    name: 'Modérateur',
    color: null,
    assignable: false,
    blockedReason: null,
  },
];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <GeneralSettingsForm config={config} channels={channels} roles={roles} onSubmit={onSubmit} />,
  );
  return onSubmit;
}

describe('GeneralSettingsForm', () => {
  it('envoie null pour « Aucun » et l’ID du salon choisi', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Salon de logs de modération'), {
      target: { value: '400000000000000001' },
    });
    fireEvent.click(screen.getByLabelText('Modérateur'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      timezone: 'Europe/Paris',
      modLogChannelId: '400000000000000001',
      announceChannelId: null,
      staffRoleIds: ['500000000000000001'],
    });
  });

  it('affiche le refus de l’API sans perdre la saisie', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Salon inconnu sur ce serveur')));

    fireEvent.change(screen.getByLabelText("Salon d'annonces"), {
      target: { value: '400000000000000001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Salon inconnu sur ce serveur');
    expect((screen.getByLabelText("Salon d'annonces") as HTMLSelectElement).value).toBe(
      '400000000000000001',
    );
  });

  it('signale les modifications en attente et sait les annuler', () => {
    setup();

    const select = screen.getByLabelText<HTMLSelectElement>('Salon de logs de modération');
    fireEvent.change(select, { target: { value: '400000000000000001' } });
    expect(screen.getByText('Modifications non enregistrées')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler les modifications' }));
    expect(select.value).toBe('');
    expect(screen.queryByText('Modifications non enregistrées')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('désactive « Enregistrer » tant que rien n’a changé', () => {
    setup();
    expect(
      (screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
