import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HomePage } from './home-page';

/** La page d'accueil seule, sous un routeur en mémoire ouvert sur `url`. */
async function renderHome(url = '/') {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({ connexion: z.string().optional() }),
    component: HomePage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole('heading', { level: 1 });
}

const hrefs = (name: string | RegExp) =>
  screen.getAllByRole('link', { name }).map((link) => link.getAttribute('href'));

describe('HomePage', () => {
  it('présente le bot et mène à l’invitation, au tableau de bord et au forum', async () => {
    const title = await renderHome();

    expect(title.textContent).toBe('Un seul bot pour tenir ton serveur et organiser tes raids.');
    expect(new Set(hrefs('Inviter le bot'))).toEqual(new Set(['/api/invite']));
    expect(new Set(hrefs(/Ouvrir le tableau de bord/))).toEqual(new Set(['/dashboard']));
    expect(hrefs(/Visiter le forum/)).toEqual(['/forum']);
  });

  it('a une section par sujet, que le pied de page sait atteindre', async () => {
    await renderHome();

    for (const name of [
      "Ce qu'un serveur actif demande, au même endroit",
      'Des sorties organisées, pas un fil de messages à démêler',
      'Tout se règle depuis le site',
      'Le forum de la communauté',
      'Ajoute PhenixMG à ton serveur',
    ]) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    const footer = screen.getByRole('navigation', { name: 'Pied de page' });
    const anchors = within(footer)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#'));
    expect(anchors).toEqual(['#fonctionnalites', '#td2']);
    for (const anchor of anchors) expect(document.getElementById(anchor.slice(1))).not.toBeNull();
  });

  it('liste les six modules avec leurs commandes', async () => {
    await renderHome();

    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Modération',
      'Niveaux et classement',
      'Tickets',
      'Giveaways',
      'Rôles en libre-service',
      'Fun et utilitaires',
    ]);
    const moderation = within(cards[0]!).getByRole('list', { name: 'Commandes' });
    expect(
      within(moderation)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['/warn', '/mute', '/ban', '/sanctions']);
  });

  it('décrit les aperçus par leur légende, sans faux contrôles à atteindre au clavier', async () => {
    await renderHome();

    expect(screen.getByRole('figure', { name: /Une sortie publiée par le bot/ })).toBeTruthy();
    expect(screen.getByRole('figure', { name: /L'onglet Général d'un serveur/ })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('explique pourquoi le visiteur a été renvoyé à l’accueil', async () => {
    await renderHome('/?connexion=requise');

    expect(screen.getByRole('status').textContent).toBe(
      'Connecte-toi pour accéder au tableau de bord.',
    );
  });

  it('n’affiche aucun message pour une raison inconnue', async () => {
    await renderHome('/?connexion=inconnue');

    expect(screen.queryByRole('status')).toBeNull();
  });
});
