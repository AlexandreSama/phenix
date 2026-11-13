import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneralSettingsForm } from './general-settings-form';

const config = {
  timezone: 'Europe/Paris',
  modLogChannelId: null,
  announceChannelId: null,
  staffRoleIds: [],
  caseRetentionMonths: 12 as const,
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

function setup(onSubmit = vi.fn().mockResolvedValue(undefined), canEditRetention = true) {
  render(
    <GeneralSettingsForm
      config={config}
      channels={channels}
      roles={roles}
      canEditRetention={canEditRetention}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const retention = () => screen.getByLabelText<HTMLSelectElement>('Conservation des sanctions');

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
      caseRetentionMonths: 12,
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

  describe('conservation des sanctions', () => {
    it('propose les durées, avec 12 mois sélectionné par défaut', () => {
      setup();
      expect(retention().value).toBe('12');
      expect(Array.from(retention().options).map((option) => option.textContent)).toEqual([
        '6 mois',
        '12 mois (par défaut)',
        '24 mois',
        'Jamais',
      ]);
      expect(screen.getByText(/sont supprimées après cette durée/)).toBeTruthy();
    });

    it('envoie null pour « Jamais »', async () => {
      const onSubmit = setup();
      fireEvent.change(retention(), { target: { value: 'never' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await screen.findByText('Enregistré. Le bot applique déjà le changement.');
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ caseRetentionMonths: null }));
    });

    it('envoie le nombre 6 pour « 6 mois »', async () => {
      const onSubmit = setup();
      fireEvent.change(retention(), { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await screen.findByText('Enregistré. Le bot applique déjà le changement.');
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ caseRetentionMonths: 6 }));
    });

    it('est désactivé avec une explication pour un délégué', () => {
      setup(undefined, false);
      expect(retention().disabled).toBe(true);
      expect(screen.getByText('Réservé aux administrateurs du serveur.')).toBeTruthy();
    });

    it('n’envoie pas la conservation d’un délégué, même s’il modifie un autre champ', async () => {
      const onSubmit = setup(undefined, false);
      fireEvent.change(screen.getByLabelText('Salon de logs de modération'), {
        target: { value: '400000000000000001' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      // Le select désactivé ne bloque pas la validation : l'enregistrement part
      expect(
        await screen.findByText('Enregistré. Le bot applique déjà le changement.'),
      ).toBeTruthy();
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const sent = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('caseRetentionMonths' in sent).toBe(false);
      expect(sent.modLogChannelId).toBe('400000000000000001');
    });

    it('envoie la conservation d’un administrateur (12 par défaut)', async () => {
      const onSubmit = setup(undefined, true);
      fireEvent.change(screen.getByLabelText('Salon de logs de modération'), {
        target: { value: '400000000000000001' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await screen.findByText('Enregistré. Le bot applique déjà le changement.');
      const sent = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('caseRetentionMonths' in sent).toBe(true);
      expect(sent.caseRetentionMonths).toBe(12);
    });
  });
});
