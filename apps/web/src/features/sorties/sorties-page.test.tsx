import type { PublicTd2Event } from '@phenix/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../router';

const AGENTS = { id: '100000000000000001', name: 'Les Agents', iconUrl: null };
const DELTA = { id: '100000000000000002', name: 'Escouade Delta', iconUrl: null };

const event = (overrides: Partial<PublicTd2Event>): PublicTd2Event => ({
  id: 1,
  kind: 'RAID',
  activity: 'Dark Hours',
  mode: 'Normal',
  difficulty: null,
  directives: [],
  scheduledAt: '2099-01-03T20:00:00.000Z',
  confirmed: 8,
  capacity: 8,
  reserve: 1,
  guild: AGENTS,
  ...overrides,
});

const EVENTS: PublicTd2Event[] = [
  event({ id: 1 }),
  event({
    id: 2,
    kind: 'INCURSION',
    activity: 'Paradis Perdu',
    mode: 'Standard',
    scheduledAt: '2099-01-03T21:00:00.000Z',
    confirmed: 2,
    capacity: 4,
    reserve: 0,
    guild: DELTA,
  }),
  event({
    id: 3,
    kind: 'MISSION',
    activity: 'Capitole',
    mode: null,
    difficulty: 'HEROIC',
    directives: ['Brouillard de guerre', 'Sans régénération'],
    scheduledAt: '2099-01-10T20:00:00.000Z',
    confirmed: 1,
    capacity: 4,
    reserve: 0,
  }),
];

let events: PublicTd2Event[] = EVENTS;

beforeEach(() => {
  events = EVENTS;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/td2/public/events') return new Response(JSON.stringify(events));
    // Un visiteur : pas de session, la page reste publique
    return new Response('{"statusCode":401,"message":"Non connecté"}', { status: 401 });
  });
});
afterEach(() => vi.restoreAllMocks());

function open(url = '/sorties') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const titles = () =>
  screen.getAllByRole('article').map((card) => within(card).getByRole('heading').textContent);

describe('page des sorties', () => {
  it('range les sorties par jour, avec leur serveur et un lien pour le rejoindre', async () => {
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Sorties en cours' })).toBeTruthy();
    expect(await screen.findByText('3 sorties · 2 serveurs')).toBeTruthy();
    // Deux jours : le samedi 3 (raid, incursion), le samedi 10 (mission)
    const days = screen.getAllByRole('region');
    expect(days.map((day) => within(day).getAllByRole('article').length)).toEqual([2, 1]);

    const mission = screen.getByRole('article', { name: 'Capitole' });
    expect(mission.textContent).toContain('Mission· Héroïque');
    expect(
      within(within(mission).getByRole('list', { name: 'Directives' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Brouillard de guerre', 'Sans régénération']);
    expect(mission.textContent).toContain('3 places');

    const raid = screen.getByRole('article', { name: 'Dark Hours' });
    expect(raid.textContent).toContain('8/8 joueurs');
    expect(raid.textContent).toContain('Réserve ouverte · 1 en attente');
    expect(within(raid).getByText('Complet')).toBeTruthy();
    const join = within(raid).getByRole('link', {
      name: 'Rejoindre ce serveur : Les Agents (nouvel onglet)',
    });
    expect(join.getAttribute('href')).toBe(`/api/td2/public/guilds/${AGENTS.id}/join`);
    expect(join.getAttribute('target')).toBe('_blank');
  });

  it('filtre par type et par places libres, dans l’adresse à partager', async () => {
    const router = open();
    await screen.findAllByRole('article');
    const filters = screen.getByRole('navigation', { name: 'Filtrer par type' });

    fireEvent.click(within(filters).getByRole('link', { name: /Missions/ }));
    await vi.waitFor(() => expect(titles()).toEqual(['Capitole']));
    expect(router.state.location.search).toEqual({ type: 'mission' });
    expect(within(filters).getByRole('link', { current: 'page' }).textContent).toBe('Missions1');

    fireEvent.click(within(filters).getByRole('link', { name: /Toutes/ }));
    await vi.waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.click(screen.getByRole('switch', { name: 'Places libres seulement' }));
    await vi.waitFor(() => expect(titles()).toEqual(['Paradis Perdu', 'Capitole']));
    expect(router.state.location.search).toEqual({ places: 'libres' });
  });

  it('dit pourquoi un « Rejoindre » est revenu sans invitation', async () => {
    open('/sorties?invitation=indisponible');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invitation indisponible.');
    fireEvent.click(within(alert).getByRole('link', { name: 'Masquer' }));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('sans sortie, explique aux admins comment montrer les leurs', async () => {
    events = [];
    open();

    expect(await screen.findByText('Aucune sortie prévue pour l’instant')).toBeTruthy();
    expect(screen.getByText(/Active la page publique/)).toBeTruthy();
  });

  it('l’en-tête du site y mène', async () => {
    open('/forum');

    const nav = await screen.findByRole('navigation', { name: 'Principale' });
    expect(within(nav).getByRole('link', { name: 'Sorties' }).getAttribute('href')).toBe(
      '/sorties',
    );
  });
});
