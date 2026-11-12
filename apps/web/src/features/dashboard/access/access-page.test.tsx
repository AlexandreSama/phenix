import type { GuildDelegate } from '@phenix/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../../router';

const GUILD = '100000000000000001';
const FAYE = '700000000000000009';
const ROOK = '700000000000000010';
const ALL = [
  'GENERAL',
  'LEVELING',
  'ROLES',
  'TICKETS',
  'GIVEAWAYS',
  'TD2',
  'WELCOME',
  'MODERATION',
] as const;

const rook: GuildDelegate = {
  userId: ROOK,
  username: 'rook',
  avatarUrl: '/logo.png',
  modules: ['TD2'],
  grantedById: '1',
  updatedAt: '2026-11-10T12:00:00.000Z',
};

/** Les accès du serveur, tels que l'API les garde pendant le test. */
let delegates: GuildDelegate[] = [];
const calls: { method: string; url: string; body: unknown }[] = [];

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  delegates = [rook];
  calls.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url === '/api/auth/me') {
      return json({
        id: '1',
        username: 'Admin',
        avatarUrl: '/logo.png',
        isOwner: false,
        forumRole: 'MEMBER',
      });
    }
    if (url === '/api/guilds') {
      return json([
        {
          id: GUILD,
          name: 'Les Agents',
          iconUrl: null,
          botPresent: true,
          access: 'admin',
          modules: ALL,
        },
      ]);
    }
    if (url === `/api/guilds/${GUILD}/delegates`) return json(delegates);
    if (url.startsWith(`/api/guilds/${GUILD}/members?q=`)) {
      return json([
        { id: FAYE, username: 'faye', displayName: 'Faye', avatarUrl: '/logo.png' },
        { id: ROOK, username: 'rook', displayName: null, avatarUrl: '/logo.png' },
      ]);
    }
    const target = url.match(/\/delegates\/(\d+)$/)?.[1];
    if (target && method === 'PUT') {
      const saved = {
        ...rook,
        userId: target,
        username: target === FAYE ? 'faye' : 'rook',
        modules: body.modules,
      };
      delegates = [...delegates.filter((entry) => entry.userId !== target), saved];
      return json(saved);
    }
    if (target && method === 'DELETE') {
      delegates = delegates.filter((entry) => entry.userId !== target);
      return json(undefined, 204);
    }
    return json({ statusCode: 404, message: 'Introuvable' }, 404);
  });
});
afterEach(() => vi.restoreAllMocks());

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/dashboard/${GUILD}/acces`] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const writes = () => calls.filter((call) => call.method !== 'GET');

describe('onglet Accès', () => {
  it('liste les membres qui ont un accès, avec leurs onglets', async () => {
    open();

    expect(await screen.findByRole('heading', { level: 2, name: 'Accès' })).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Membres avec un accès' });
    expect(
      within(within(list).getByRole('list', { name: 'Onglets de rook' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['The Division 2']);
  });

  it('cherche un membre, coche des onglets et lui donne l’accès', async () => {
    open();
    fireEvent.change(await screen.findByLabelText('Chercher un membre'), {
      target: { value: 'fa' },
    });

    const found = await screen.findByRole('list', { name: 'Membres trouvés' });
    // rook a déjà un accès : on le modifie plutôt que d'en créer un second
    expect(within(found).getByRole('button', { name: 'Modifier rook' })).toBeTruthy();
    fireEvent.click(within(found).getByRole('button', { name: 'Choisir Faye' }));

    const form = screen.getByRole('form', { name: 'Onglets ouverts à Faye' });
    const submit = within(form).getByRole<HTMLButtonElement>('button', { name: 'Donner l’accès' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(form).getByLabelText('Tickets'));
    fireEvent.click(within(form).getByLabelText('The Division 2'));
    fireEvent.click(submit);

    expect((await screen.findByRole('status')).textContent).toBe('Accès enregistré pour Faye.');
    expect(writes()).toEqual([
      {
        method: 'PUT',
        url: `/api/guilds/${GUILD}/delegates/${FAYE}`,
        body: { modules: ['TICKETS', 'TD2'] },
      },
    ]);
    expect(await screen.findByRole('list', { name: 'Onglets de faye' })).toBeTruthy();
  });

  it('modifie les onglets d’un membre, puis lui retire tout', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les onglets de rook' }));
    const form = screen.getByRole('form', { name: 'Onglets ouverts à rook' });
    fireEvent.click(within(form).getByLabelText('Giveaways'));
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() =>
      expect(writes().at(-1)).toMatchObject({
        method: 'PUT',
        body: { modules: ['GIVEAWAYS', 'TD2'] },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Retirer l’accès de rook' }));
    const confirm = screen.getByRole('group', { name: 'Retirer l’accès de rook' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retirer l’accès' }));

    expect(await screen.findByText('Personne n’a d’accès délégué')).toBeTruthy();
    expect(writes().at(-1)).toMatchObject({
      method: 'DELETE',
      url: `/api/guilds/${GUILD}/delegates/${ROOK}`,
    });
  });
});
