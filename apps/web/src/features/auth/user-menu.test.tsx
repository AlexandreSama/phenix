import type { CurrentUser } from '@projet/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import { currentUserQuery } from './api';
import { UserMenu } from './user-menu';

const member: CurrentUser = {
  id: '1',
  username: 'Faye',
  avatarUrl: '/logo.png',
  isOwner: false,
  forumRole: 'MEMBER',
};

/** Le menu, avec l'utilisateur déjà connu du cache (null : déconnecté). */
async function setup(user: CurrentUser | null = member) {
  renderWithProviders(<UserMenu />, (client) =>
    client.setQueryData(currentUserQuery.queryKey, user),
  );
  return user && screen.findByRole('button', { name: `Menu de ${user.username}` });
}

const itemNames = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

const focused = () => document.activeElement?.textContent;

afterEach(() => vi.restoreAllMocks());

describe('UserMenu', () => {
  it('déconnecté : un seul lien, vers la connexion Discord', async () => {
    await setup(null);

    const login = await screen.findByRole('link', { name: 'Se connecter avec Discord' });
    expect(login.getAttribute('href')).toBe('/api/auth/discord');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('s’ouvre au clic, donne le focus au premier choix, et se referme avec Échap', async () => {
    const trigger = (await setup())!;

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(itemNames()).toEqual(['Ouvrir le tableau de bord', 'Déconnexion']);
    expect(document.activeElement?.textContent).toBe('Ouvrir le tableau de bord');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('propose l’administration aux propriétaires du bot, en premier', async () => {
    const trigger = (await setup({ ...member, isOwner: true }))!;
    fireEvent.click(trigger);

    expect(itemNames()).toEqual(['Administration', 'Ouvrir le tableau de bord', 'Déconnexion']);
    expect(
      within(screen.getByRole('menu'))
        .getByRole('menuitem', { name: 'Administration' })
        .getAttribute('href'),
    ).toBe('/admin');
    expect(screen.getByText('Propriétaire du bot')).toBeTruthy();
  });

  it('se parcourt aux flèches, en boucle', async () => {
    const trigger = (await setup({ ...member, isOwner: true }))!;
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = await screen.findByRole('menu');

    expect(focused()).toBe('Administration');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Ouvrir le tableau de bord');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(focused()).toBe('Déconnexion');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Administration');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(focused()).toBe('Déconnexion');
  });

  it('se referme d’un clic ailleurs dans la page', async () => {
    const trigger = (await setup())!;
    fireEvent.click(trigger);

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('« Déconnexion » appelle l’API, puis le menu laisse place au lien de connexion', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const trigger = (await setup())!;
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Déconnexion' }));

    expect(await screen.findByRole('link', { name: 'Se connecter avec Discord' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
