import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Td2SettingsForm } from './td2-settings-form';

const CHANNEL = '400000000000000001';
const channels = [{ id: CHANNEL, name: 'raids', parentName: 'The Division 2' }];

function setup(channelId: string | null, onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<Td2SettingsForm settings={{ channelId }} channels={channels} onSubmit={onSubmit} />);
  return onSubmit;
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('Td2SettingsForm', () => {
  it('choisit le salon des sorties', async () => {
    const onSubmit = setup(null);

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: CHANNEL } });
    save();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ channelId: CHANNEL }));
    expect((await screen.findByRole('status')).textContent).toContain('Enregistré');
  });

  it('« Là où la commande est lancée » envoie null', async () => {
    const onSubmit = setup(CHANNEL);

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: '' } });
    save();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ channelId: null }));
  });

  it('affiche le refus de l’API', async () => {
    setup(null, vi.fn().mockRejectedValue(new Error('Salon inconnu sur ce serveur')));

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: CHANNEL } });
    save();

    expect((await screen.findByRole('alert')).textContent).toContain('Salon inconnu');
  });
});
