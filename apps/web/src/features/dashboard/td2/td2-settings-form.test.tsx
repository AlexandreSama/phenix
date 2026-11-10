import type { Td2Settings } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Td2SettingsForm } from './td2-settings-form';

const CHANNEL = '400000000000000001';
const STAFF_CHANNEL = '400000000000000002';
const ROLE = '600000000000000001';
const channels = [
  { id: CHANNEL, name: 'raids', parentName: 'The Division 2' },
  { id: STAFF_CHANNEL, name: 'staff', parentName: null },
];
const roles = [
  { id: ROLE, name: 'Officier', color: null },
  { id: '600000000000000002', name: 'Membre', color: null },
];
const EMPTY: Td2Settings = {
  channelId: null,
  reportChannelId: null,
  reportViewerRoleIds: [],
  reportFeedChannelId: null,
};

function setup(
    settings: Partial<Td2Settings> = {},
    onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  render(
      <Td2SettingsForm
          settings={{ ...EMPTY, ...settings }}
          channels={channels}
          roles={roles as never}
          onSubmit={onSubmit}
      />,
  );
  return onSubmit;
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('Td2SettingsForm', () => {
  it('choisit le salon des sorties et ouvre les signalements', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: CHANNEL } });
    fireEvent.change(screen.getByLabelText('Salon du staff'), { target: { value: STAFF_CHANNEL } });
    fireEvent.click(screen.getByLabelText('Officier'));
    save();

    await vi.waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          channelId: CHANNEL,
          reportChannelId: STAFF_CHANNEL,
          reportViewerRoleIds: [ROLE],
          reportFeedChannelId: null,
        }),
    );
    expect((await screen.findByRole('status')).textContent).toContain('Enregistré');
  });

  it('les options vides envoient null, et aucun rôle coché un tableau vide', async () => {
    const onSubmit = setup({
      channelId: CHANNEL,
      reportFeedChannelId: CHANNEL,
      reportViewerRoleIds: [ROLE],
    });

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Fil du réseau'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Officier'));
    save();

    await vi.waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          channelId: null,
          reportChannelId: null,
          reportViewerRoleIds: [],
          reportFeedChannelId: null,
        }),
    );
  });

  it('affiche le refus de l’API', async () => {
    setup({}, vi.fn().mockRejectedValue(new Error('Salon inconnu sur ce serveur')));

    fireEvent.change(screen.getByLabelText('Salon des sorties'), { target: { value: CHANNEL } });
    save();

    expect((await screen.findByRole('alert')).textContent).toContain('Salon inconnu');
  });
});