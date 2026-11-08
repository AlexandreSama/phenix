import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatMinutes } from './form-values';
import { LevelingSettingsForm } from './leveling-settings-form';

const config = {
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
};
const channels = [{ id: '400000000000000001', name: 'niveaux', parentName: null }];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <LevelingSettingsForm
      guildId="300000000000000001"
      config={config}
      channels={channels}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LevelingSettingsForm', () => {
  it('envoie des nombres, et null pour « dans le salon du membre »', async () => {
    const onSubmit = setup();

    type('XP maximum par message', '40');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ ...config, xpMax: 40 });
  });

  it('refuse un minimum supérieur au maximum sans appeler l’API', async () => {
    const onSubmit = setup();

    type('XP minimum par message', '30');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Le minimum d'XP doit être inférieur ou égal au maximum",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('met à jour l’estimation pendant la saisie', () => {
    setup();
    // Niveau 10 = 4 675 XP ; 20 XP en moyenne → 234 messages, une minute chacun
    expect(screen.getByText(/234 messages/)).toBeTruthy();
    expect(screen.getByText(/3 h 54 min/)).toBeTruthy();

    type('XP minimum par message', '25');
    type('XP maximum par message', '35');

    expect(screen.getByText(/156 messages/)).toBeTruthy();
  });

  it('propose le lien du classement public seulement s’il est public', () => {
    setup();
    expect(screen.getByRole('link', { name: /classement public/ }).getAttribute('href')).toBe(
      '/classement/300000000000000001',
    );

    fireEvent.click(screen.getByLabelText(/Classement public sur le site/));
    expect(screen.queryByRole('link', { name: /classement public/ })).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('écrit une durée lisible', () => {
    expect(formatMinutes(0)).toBe("moins d'une minute");
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(234)).toBe('3 h 54 min');
  });
});
