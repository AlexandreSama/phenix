import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketSettingsForm } from './ticket-settings-form';

const CATEGORY = '100000000000000001';
const CHANNEL = '400000000000000001';
const MODO = '500000000000000001';
const categories = [{ id: CATEGORY, name: 'Support' }];
const channels = [{ id: CHANNEL, name: 'aide', parentName: null }];
const roles = [{ id: MODO, name: 'Modo', color: null, assignable: false, blockedReason: 'x' }];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <TicketSettingsForm
      settings={null}
      categories={categories}
      channels={channels}
      roles={roles}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et publier' }));

describe('TicketSettingsForm', () => {
  it('envoie une liste de rôles même avec une seule case, et null pour les champs vides', async () => {
    const onSubmit = setup();

    change('Catégorie des tickets', CATEGORY);
    // Un rôle de modération reste proposé : le bot ne le donne pas, il ouvre seulement le salon
    fireEvent.click(screen.getByLabelText('Modo'));
    change('Salon du panel', CHANNEL);
    change('Description', '');
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        categoryId: CATEGORY,
        staffRoleIds: [MODO],
        logChannelId: null,
        panel: {
          channelId: CHANNEL,
          title: 'Besoin d’aide ?',
          description: null,
          buttonLabel: 'Ouvrir un ticket',
        },
      }),
    );
  });

  it('explique ce qui manque avec les messages du schéma partagé', async () => {
    const onSubmit = setup();

    submit();

    expect(await screen.findByText('Choisis une catégorie')).toBeTruthy();
    expect(screen.getByText(/personne ne verrait les tickets/)).toBeTruthy();
    expect(screen.getByText('Choisis le salon du panel')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('met l’aperçu à jour pendant la saisie', () => {
    setup();
    change('Texte du bouton', 'Contacter le staff');

    const preview = within(screen.getByRole('figure', { name: 'Aperçu du panel sur Discord' }));
    expect(preview.getByText('🎫 Contacter le staff')).toBeTruthy();
  });

  it('affiche l’erreur renvoyée par l’API', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Catégorie inconnue sur ce serveur')));

    change('Catégorie des tickets', CATEGORY);
    fireEvent.click(screen.getByLabelText('Modo'));
    change('Salon du panel', CHANNEL);
    submit();

    expect(await screen.findByText('Catégorie inconnue sur ce serveur')).toBeTruthy();
  });
});
