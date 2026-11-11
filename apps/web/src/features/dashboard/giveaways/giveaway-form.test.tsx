import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { localToIso, toLocalInput } from './form-values';
import { GiveawayForm } from './giveaway-form';

const CHANNEL = '400000000000000001';
const ROLE = '600000000000000001';
const channels = [{ id: CHANNEL, name: 'annonces', parentName: null }];
const roles = [{ id: ROLE, name: 'Membre', color: null, assignable: true, blockedReason: null }];
// Une heure fixe, pour que « dans une minute au moins » ne dépende pas de l'horloge
const NOW = new Date(2026, 10, 9, 12, 0);

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<GiveawayForm channels={channels} roles={roles} onSubmit={onSubmit} now={() => NOW} />);
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Lancer le giveaway' }));

describe('GiveawayForm', () => {
  it('propose une fin dans 24 h, à l’heure pile, et envoie une date ISO', async () => {
    const onSubmit = setup();
    expect(screen.getByLabelText('Fin')).toHaveProperty('value', '2026-11-10T13:00');

    change('Lot', '  Nitro 1 mois ');
    change('Salon', CHANNEL);
    change('Gagnants', '3');
    change('Réservé à un rôle', ROLE);
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        channelId: CHANNEL,
        prize: 'Nitro 1 mois',
        winnersCount: 3,
        endsAt: new Date(2026, 10, 10, 13, 0).toISOString(),
        requiredRoleId: ROLE,
      }),
    );
  });

  it('« Tout le monde » envoie requiredRoleId: null', async () => {
    const onSubmit = setup();

    change('Lot', 'Nitro');
    change('Salon', CHANNEL);
    submit();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ requiredRoleId: null })),
    );
  });

  it('explique ce qui manque, avec les messages partagés avec l’API et /giveaway', async () => {
    const onSubmit = setup();

    change('Gagnants', '0');
    change('Fin', toLocalInput(new Date(NOW.getTime() + 30_000)));
    submit();

    await screen.findByText('Le lot est obligatoire');
    // Dans l'ordre de la page : le lot et ses gagnants, puis le salon et la fin
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Le lot est obligatoire',
      'Un gagnant au moins',
      'Choisis un salon',
      'La fin doit être dans une minute au moins',
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche le refus de l’API sous le bouton', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Salon inconnu sur ce serveur')));

    change('Lot', 'Nitro');
    change('Salon', CHANNEL);
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Salon inconnu sur ce serveur',
    );
  });
});

describe('dates du formulaire', () => {
  it('passe de l’heure locale du champ à une date ISO, et retour', () => {
    const local = new Date(2026, 10, 10, 20, 30);

    expect(toLocalInput(local)).toBe('2026-11-10T20:30');
    expect(localToIso('2026-11-10T20:30')).toBe(local.toISOString());
    // Une saisie illisible reste telle quelle : le schéma dira « Date de fin invalide »
    expect(localToIso('pas une date')).toBe('pas une date');
  });
});
