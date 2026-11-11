import type { ManageableGuild } from '@phenix/shared';
import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test-utils';
import { GuildPickerPage } from './guild-picker-page';

const guilds = (count: number): ManageableGuild[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(100 + index),
    name: `Serveur ${index + 1}`,
    iconUrl: null,
    botPresent: index % 2 === 0,
  }));

/** Les réponses successives de GET /api/guilds. */
const respond = (...responses: Response[]) => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return fetch;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe('GuildPickerPage', () => {
  it('annonce le chargement, puis montre les serveurs, sans recherche pour une courte liste', async () => {
    respond(json(guilds(3)));
    renderWithProviders(<GuildPickerPage />);

    expect((await screen.findByRole('status')).textContent).toBe('Chargement de tes serveurs…');
    expect(await screen.findByRole('link', { name: 'Configurer Serveur 1' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('propose une recherche dès sept serveurs, qui filtre les deux groupes', async () => {
    respond(json(guilds(12)));
    renderWithProviders(<GuildPickerPage />);

    const search = await screen.findByRole('searchbox', { name: 'Rechercher un serveur' });
    fireEvent.change(search, { target: { value: 'serveur 1' } });

    // « Serveur 1 », « Serveur 10 », « Serveur 11 », « Serveur 12 »
    const names = screen
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.truncate')?.textContent);
    expect(names).toEqual(['Serveur 1', 'Serveur 11', 'Serveur 10', 'Serveur 12']);

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull();
  });

  it('recharge la liste au retour sur l’onglet : le serveur invité change de groupe', async () => {
    const absent = { id: '100', name: 'Les Agents', iconUrl: null, botPresent: false };
    respond(json([absent]), json([{ ...absent, botPresent: true }]));
    renderWithProviders(<GuildPickerPage />);
    expect(
      await screen.findByRole('link', { name: 'Inviter le bot sur Les Agents (nouvel onglet)' }),
    ).toBeTruthy();

    // L'utilisateur part sur l'onglet Discord, puis revient : la liste est rechargée aussitôt
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole('link', { name: 'Configurer Les Agents' })).toBeTruthy();
    focusManager.setFocused(undefined);
  });

  it('explique quoi faire quand il n’y a aucun serveur à gérer', async () => {
    respond(json([]));
    renderWithProviders(<GuildPickerPage />);

    expect(await screen.findByRole('heading', { name: 'Aucun serveur à gérer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
  });

  it('montre l’erreur de l’API, et réessaie à la demande', async () => {
    const fetch = respond(
      json({ statusCode: 502, message: 'Discord ne répond pas' }, 502),
      json(guilds(1)),
    );
    renderWithProviders(<GuildPickerPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Discord ne répond pas');
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));

    expect(await screen.findByRole('link', { name: 'Configurer Serveur 1' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
