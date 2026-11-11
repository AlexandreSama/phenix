import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../router';

const slots = (DPS: number, HEAL: number, TANK: number, HEAL_TANK = 0) => ({
  DPS,
  HEAL,
  TANK,
  HEAL_TANK,
});

const report = {
  id: 7,
  guildId: '100000000000000001',
  guildName: 'Les Agents',
  playerName: 'Agent47',
  platform: 'PSN',
  reason: 'CHEAT',
  details: null,
  status: 'CONFIRMED',
  evidenceCount: 0,
  createdAt: '2026-11-10T18:00:00.000Z',
  reviewedAt: null,
};

/** Ce que l'API répond, adresse par adresse ; toute autre adresse répond 404. */
const API: Record<string, unknown> = {
  '/api/auth/me': {
    id: '1',
    username: 'Faye',
    avatarUrl: '/logo.png',
    isOwner: true,
    forumRole: 'ADMIN',
  },
  '/api/admin/td2/catalogue': [
    {
      id: 1,
      kind: 'RAID',
      name: 'Dark Hours',
      active: true,
      modes: [{ id: 1, name: 'Normal', slots: slots(6, 1, 1), eventCount: 4 }],
    },
    { id: 2, kind: 'INCURSION', name: 'Broken Rain', active: false, modes: [] },
  ],
  '/api/admin/td2/reports?': { reports: [report], nextCursor: null },
  '/api/admin/td2/reports?status=REJECTED': { reports: [], nextCursor: null },
  '/api/admin/forum/categories': [
    {
      id: 1,
      slug: 'entraide',
      name: 'Entraide',
      description: null,
      position: 0,
      threadCount: 3,
      lastActivityAt: null,
    },
  ],
  '/api/admin/forum/staff': [
    { id: '2', username: 'Rook', avatarUrl: '/logo.png', role: 'MODERATOR' },
  ],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const body = API[String(input)];
    return body === undefined
      ? new Response('{"statusCode":404,"message":"Introuvable"}', { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

/** Le vrai site, ouvert sur `url`, avec l'API ci-dessus. */
function open(url: string) {
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

describe('pages d’administration', () => {
  it('le catalogue range les activités par type, et une activité sans mode ouvre son formulaire', async () => {
    open('/admin');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Catalogue The Division 2' }),
    ).toBeTruthy();
    const raid = await screen.findByRole('article', { name: 'Dark Hours' });
    expect(within(raid).getByRole('form', { name: 'Mode Normal' })).toBeTruthy();
    expect(within(raid).getByText('A servi à 4 sorties.')).toBeTruthy();
    // Un mode existe déjà : le formulaire d'ajout attend qu'on le demande
    expect(within(raid).queryByRole('form', { name: 'Nouveau mode' })).toBeNull();
    fireEvent.click(within(raid).getByRole('button', { name: 'Ajouter un mode' }));
    expect(within(raid).getByRole('form', { name: 'Nouveau mode' })).toBeTruthy();

    const incursion = screen.getByRole('article', { name: 'Broken Rain' });
    expect(within(incursion).getByRole('form', { name: 'Nouveau mode' })).toBeTruthy();
    expect(within(incursion).getByText('Masquée')).toBeTruthy();
    expect(
      within(incursion).getByRole<HTMLInputElement>('switch', { name: 'Proposée dans /td2' })
        .checked,
    ).toBe(false);
  });

  it('les signalements se filtrent par statut, dans l’adresse', async () => {
    const router = open('/admin/signalements');

    expect(await screen.findByRole('listitem', { name: 'Signalement #7' })).toBeTruthy();
    const filters = screen.getByRole('navigation', { name: 'Filtrer par statut' });
    expect(within(filters).getByRole('link', { current: 'page' }).textContent).toBe('Tous');

    fireEvent.click(within(filters).getByRole('link', { name: 'Rejeté' }));
    expect(await screen.findByText('Aucun signalement ne correspond')).toBeTruthy();
    expect(router.state.location.search).toEqual({ status: 'REJECTED' });
    expect(within(filters).getByRole('link', { current: 'page' }).textContent).toBe('Rejeté');
  });

  it('le forum montre ses catégories, le formulaire d’ajout et l’équipe', async () => {
    open('/admin/forum');

    expect(await screen.findByRole('form', { name: 'Catégorie Entraide' })).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Nouvelle catégorie' });
    expect(within(form).getByLabelText('Nom')).toBeTruthy();
    expect(within(form).getByLabelText('Adresse')).toBeTruthy();
    const team = await screen.findByRole('list', { name: 'Équipe' });
    expect(
      within(team).getByRole<HTMLSelectElement>('combobox', { name: 'Rôle de Rook' }).value,
    ).toBe('MODERATOR');
  });

  it('la navigation marque la page ouverte', async () => {
    open('/admin/forum');

    const nav = await screen.findByRole('navigation', { name: 'Administration' });
    expect(within(nav).getByRole('link', { current: 'page' }).textContent).toBe('Forum');
  });
});
