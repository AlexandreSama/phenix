import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WelcomeSettings } from '@phenix/shared';
import { WelcomeSettingsForm } from './welcome-settings-form';

const CHANNEL = '400000000000000001';
const ROLE = '500000000000000001';
const BLOCKED_ROLE = '500000000000000002';

const config: WelcomeSettings = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: null,
  welcomeRoleId: null,
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: null,
};
const channels = [{ id: CHANNEL, name: 'accueil', parentName: null }];
const roles = [
  { id: ROLE, name: 'Membre', color: null, assignable: true, blockedReason: null },
  {
    id: BLOCKED_ROLE,
    name: 'Modérateur',
    color: null,
    assignable: false,
    blockedReason: 'Ce rôle donne des permissions de modération',
  },
];

function setup(
  props: { config?: WelcomeSettings; canChooseRole?: boolean } = {},
  onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <WelcomeSettingsForm
      config={props.config ?? config}
      channels={channels}
      roles={roles}
      canChooseRole={props.canChooseRole ?? true}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('WelcomeSettingsForm', () => {
  it('désactive les deux messages par défaut', () => {
    setup();

    expect(
      (screen.getByRole('switch', { name: /message d’arrivée/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByRole('switch', { name: /message de départ/ }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('refuse un message activé sans salon, sans appeler l’API', async () => {
    const onSubmit = setup();

    fireEvent.click(screen.getByRole('switch', { name: /message d’arrivée/ }));
    save();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Choisis le salon des messages d’arrivée',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envoie null pour un salon, un rôle et un message laissés vides', async () => {
    const onSubmit = setup();

    fireEvent.click(screen.getByRole('switch', { name: /message de départ/ }));
    fireEvent.change(screen.getByLabelText('Salon des messages de départ'), {
      target: { value: CHANNEL },
    });
    save();

    expect(await screen.findByText(/Enregistré/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      ...config,
      goodbyeEnabled: true,
      goodbyeChannelId: CHANNEL,
    });
  });

  it('grise les rôles non distribuables avec leur raison', () => {
    setup();

    const blocked = screen.getByRole('option', {
      name: /Modérateur — Ce rôle donne des permissions de modération/,
    }) as HTMLOptionElement;
    expect(blocked.disabled).toBe(true);
    expect((screen.getByRole('option', { name: 'Membre' }) as HTMLOptionElement).disabled).toBe(
      false,
    );
  });

  it('désactive le rôle d’arrivée pour un délégué sans l’onglet Rôles, et l’explique', () => {
    setup({ canChooseRole: false });

    expect((screen.getByLabelText('Rôle d’arrivée') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/onglet Rôles/)).toBeTruthy();
  });

  it('refuse une variable inconnue avec un message français', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Message d’arrivée'), {
      target: { value: 'Salut {inconnu}' },
    });
    save();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Variable inconnue : {inconnu}',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('liste les variables disponibles', () => {
    setup();

    for (const variable of ['{membre}', '{pseudo}', '{serveur}', '{effectif}']) {
      expect(screen.getAllByText(variable).length).toBeGreaterThan(0);
    }
  });

  it('compte les caractères du message', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Message de départ'), { target: { value: 'Salut' } });

    expect(screen.getByText('5 / 1000')).toBeTruthy();
  });

  it('compte en unités UTF-16 comme zod et maxLength (500 émojis = 1000)', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Message de départ'), {
      target: { value: '😀'.repeat(500) },
    });

    expect(screen.getByText('1000 / 1000')).toBeTruthy();
  });

  it('laisse choisir le rôle d’arrivée alors que le message d’arrivée est désactivé', () => {
    setup();

    const select = screen.getByLabelText('Rôle d’arrivée') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    fireEvent.change(select, { target: { value: ROLE } });
    expect(select.value).toBe(ROLE);
  });

  it('enregistre un rôle avec le message d’arrivée désactivé, sans erreur de salon', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Rôle d’arrivée'), { target: { value: ROLE } });
    save();

    expect(await screen.findByText(/Enregistré/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      ...config,
      welcomeEnabled: false,
      welcomeRoleId: ROLE,
    });
  });

  it('renvoie tel quel le rôle actuel pour un délégué sans l’onglet Rôles', async () => {
    const onSubmit = setup({ config: { ...config, welcomeRoleId: ROLE }, canChooseRole: false });

    fireEvent.click(screen.getByRole('switch', { name: /message de départ/ }));
    fireEvent.change(screen.getByLabelText('Salon des messages de départ'), {
      target: { value: CHANNEL },
    });
    save();

    expect(await screen.findByText(/Enregistré/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      ...config,
      welcomeRoleId: ROLE,
      goodbyeEnabled: true,
      goodbyeChannelId: CHANNEL,
    });
  });

  it('explique que le rôle est indépendant du message d’arrivée', () => {
    setup();

    expect(screen.getByText(/Choisis « Aucun rôle » pour ne rien donner/)).toBeTruthy();
    expect(screen.queryByText(/aucun rôle n’est donné/)).toBeNull();
  });
});
