import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toFormValues } from './form-values';
import { RolePanelForm } from './role-panel-form';

const CHANNEL = '400000000000000001';
const GAMER = '500000000000000001';
const channels = [{ id: CHANNEL, name: 'rôles', parentName: null }];
const roles = [
  {
    id: '500000000000000009',
    name: 'Admin',
    color: null,
    assignable: false,
    blockedReason: 'Placé au-dessus du rôle du bot',
    managed: false,
  },
  {
    id: '500000000000000010',
    name: 'Booster',
    color: null,
    assignable: false,
    blockedReason: 'Rôle géré par Discord',
    managed: true,
  },
  { id: GAMER, name: 'Gamer', color: null, assignable: true, blockedReason: null, managed: false },
];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <RolePanelForm
      defaultValues={toFormValues()}
      channels={channels}
      roles={roles}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('RolePanelForm', () => {
  it('reprend le nom du rôle pour le bouton et envoie null pour les champs vides', async () => {
    const onSubmit = setup();

    change('Titre', 'Tes jeux');
    change('Salon du panel', CHANNEL);
    change('Rôle 1', GAMER);
    await vi.waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Texte du bouton').value).toBe('Gamer'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et publier' }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Tes jeux',
        description: null,
        channelId: CHANNEL,
        mode: 'MULTIPLE',
        options: [{ roleId: GAMER, label: 'Gamer', emoji: null }],
      }),
    );
  });

  it('grise les rôles que le bot ne peut pas donner, avec la raison', () => {
    setup();
    const admin = screen.getByRole<HTMLOptionElement>('option', { name: /Admin/ });
    expect(admin.disabled).toBe(true);
    expect(admin.textContent).toContain('Placé au-dessus du rôle du bot');
  });

  it('grise un rôle géré (Booster) avec sa raison : un panel ne peut pas le donner', () => {
    setup();
    const booster = screen.getByRole<HTMLOptionElement>('option', { name: /Booster/ });
    expect(booster.disabled).toBe(true);
    expect(booster.textContent).toContain('Rôle géré par Discord');
  });

  it('signale un rôle en double sous le second bouton', async () => {
    const onSubmit = setup();
    change('Titre', 'Tes jeux');
    change('Salon du panel', CHANNEL);
    change('Rôle 1', GAMER);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un rôle' }));
    change('Rôle 2', GAMER);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et publier' }));

    expect(await screen.findByText('Ce rôle a déjà un bouton')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('montre le message dans l’aperçu pendant la saisie', () => {
    setup();
    change('Titre', 'Choisis ton équipe');
    change('Rôle 1', GAMER);
    change('Emoji', '🎮');

    const preview = within(screen.getByRole('figure', { name: 'Aperçu du message sur Discord' }));
    expect(preview.getByText('Choisis ton équipe')).toBeTruthy();
    expect(preview.getByText('🎮 Gamer')).toBeTruthy();
  });
});
