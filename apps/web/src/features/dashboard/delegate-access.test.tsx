import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../router';

const GUILD = '100000000000000001';
const GUILD_WELCOME = '100000000000000002';
const GUILD_MODERATION = '100000000000000003';

/** Faye n'administre pas Les Agents : un admin lui a ouvert l'onglet TD2, et lui seul. */
const API: Record<string, unknown> = {
  '/api/auth/me': {
    id: '7',
    username: 'Faye',
    avatarUrl: '/logo.png',
    isOwner: false,
    forumRole: 'MEMBER',
  },
  '/api/guilds': [
    {
      id: GUILD,
      name: 'Les Agents',
      iconUrl: null,
      botPresent: true,
      access: 'delegate',
      modules: ['TD2'],
    },
    {
      id: GUILD_WELCOME,
      name: 'Escouade Delta',
      iconUrl: null,
      botPresent: true,
      access: 'delegate',
      modules: ['WELCOME'],
    },
    {
      id: GUILD_MODERATION,
      name: 'Brigade Sigma',
      iconUrl: null,
      botPresent: true,
      access: 'delegate',
      modules: ['MODERATION'],
    },
  ],
  [`/api/guilds/${GUILD_MODERATION}/moderation/cases?page=1`]: {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  },
  [`/api/guilds/${GUILD_WELCOME}/channels`]: [],
  [`/api/guilds/${GUILD_WELCOME}/roles`]: [],
  [`/api/guilds/${GUILD_WELCOME}/welcome`]: {
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeMessage: null,
    welcomeRoleId: null,
    goodbyeEnabled: false,
    goodbyeChannelId: null,
    goodbyeMessage: null,
  },
  [`/api/guilds/${GUILD}/channels`]: [],
  [`/api/guilds/${GUILD}/roles`]: [],
  [`/api/guilds/${GUILD}/td2/settings`]: {
    channelId: null,
    publicListing: false,
    reportChannelId: null,
    reportViewerRoleIds: [],
    reportFeedChannelId: null,
  },
  [`/api/guilds/${GUILD}/td2/events`]: [],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const body = API[String(input)];
    return body === undefined
      ? new Response('{"statusCode":403,"message":"Refusé"}', { status: 403 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

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
}

const requested = () => vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));

describe('accès délégué', () => {
  it('ne montre que les onglets ouverts, sans l’onglet Accès', async () => {
    open(`/dashboard/${GUILD}/td2`);

    expect(await screen.findByRole('heading', { level: 2, name: 'The Division 2' })).toBeTruthy();
    expect(screen.getByText('Accès délégué')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Réglages du serveur' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.getAttribute('href')).toBe(`/dashboard/${GUILD}/td2`);
  });

  it('un délégué « Bienvenue » voit cet onglet, et lui seul', async () => {
    open(`/dashboard/${GUILD_WELCOME}/bienvenue`);

    expect(await screen.findByRole('heading', { level: 2, name: 'Bienvenue' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Réglages du serveur' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toBe('Bienvenue');
    expect(tabs[0]?.getAttribute('href')).toBe(`/dashboard/${GUILD_WELCOME}/bienvenue`);
  });

  it('un délégué « Modération » voit cet onglet, et lui seul', async () => {
    open(`/dashboard/${GUILD_MODERATION}/moderation`);

    expect(await screen.findByRole('heading', { level: 2, name: 'Modération' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Réglages du serveur' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toBe('Modération');
    expect(tabs[0]?.getAttribute('href')).toBe(`/dashboard/${GUILD_MODERATION}/moderation`);
  });

  it('refuse la modération à un délégué qui n’a pas reçu l’onglet', async () => {
    open(`/dashboard/${GUILD}/moderation`);

    expect(await screen.findByText('Cet onglet ne t’est pas ouvert')).toBeTruthy();
    expect(requested().some((url) => url.includes('/moderation/'))).toBe(false);
  });

  it('un onglet fermé l’explique et mène au sien, sans rien demander à l’API', async () => {
    open(`/dashboard/${GUILD}`);

    expect(await screen.findByText('Cet onglet ne t’est pas ouvert')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Aller à l’onglet The Division 2' }).getAttribute('href'),
    ).toBe(`/dashboard/${GUILD}/td2`);
    expect(requested()).not.toContain(`/api/guilds/${GUILD}/config`);
  });

  it('l’onglet Accès reste aux administrateurs', async () => {
    open(`/dashboard/${GUILD}/acces`);

    expect(await screen.findByText('Cet onglet ne t’est pas ouvert')).toBeTruthy();
    expect(requested()).not.toContain(`/api/guilds/${GUILD}/delegates`);
  });

  it('un serveur hors de sa liste : pas d’accès', async () => {
    open('/dashboard/100000000000000099/td2');

    expect(await screen.findByText('Tu n’as pas accès à ce serveur')).toBeTruthy();
  });
});
