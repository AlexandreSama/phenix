import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketSettingsForm } from './ticket-settings-form';

const CHANNEL = '400000000000000001';
const channels = [{ id: CHANNEL, name: 'aide', parentName: null }];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<TicketSettingsForm settings={null} channels={channels} onSubmit={onSubmit} />);
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et publier' }));

describe('TicketSettingsForm', () => {
  it('envoie null pour les champs vides, sans catégorie ni rôles', async () => {
    const onSubmit = setup();

    change('Salon du panel', CHANNEL);
    change('Description', '');
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
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

    expect(await screen.findByText('Choisis le salon du panel')).toBeTruthy();
    expect(screen.queryByLabelText('Catégorie des tickets')).toBeNull();
    expect(screen.queryByText('Équipe')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('met l’aperçu à jour pendant la saisie', () => {
    setup();
    change('Texte du bouton', 'Contacter le staff');

    const preview = within(screen.getByRole('figure', { name: 'Aperçu du panel sur Discord' }));
    expect(preview.getByText('🎫 Contacter le staff')).toBeTruthy();
  });

  it('affiche l’erreur renvoyée par l’API', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Salon inconnu sur ce serveur')));

    change('Salon du panel', CHANNEL);
    submit();

    expect(await screen.findByText('Salon inconnu sur ce serveur')).toBeTruthy();
  });
});
