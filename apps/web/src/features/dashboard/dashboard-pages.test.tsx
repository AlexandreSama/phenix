import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { routeTree } from '../../router';

const GUILD = '100000000000000001';
const CHANNEL = '400000000000000001';
const ROLE = '500000000000000001';
const CATEGORY = '300000000000000001';

/** Ce que l'API répond, adresse par adresse ; toute autre adresse répond 404. */
const API: Record<string, unknown> = {
  '/api/auth/me': {
    id: '1',
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
      access: 'admin',
      modules: ['GENERAL', 'LEVELING', 'ROLES', 'TICKETS', 'GIVEAWAYS', 'TD2', 'WELCOME'],
    },
  ],
  [`/api/guilds/${GUILD}/channels`]: [{ id: CHANNEL, name: 'général', parentName: 'Discussion' }],
  [`/api/guilds/${GUILD}/roles`]: [
    { id: ROLE, name: 'Modérateur', color: '#f5aa04', assignable: true, blockedReason: null },
  ],
  [`/api/guilds/${GUILD}/categories`]: [{ id: CATEGORY, name: 'Support' }],
  [`/api/guilds/${GUILD}/config`]: {
    timezone: 'Europe/Paris',
    modLogChannelId: CHANNEL,
    announceChannelId: null,
    staffRoleIds: [ROLE],
  },
  [`/api/guilds/${GUILD}/leveling`]: {
    xpEnabled: true,
    xpMin: 15,
    xpMax: 25,
    xpCooldownSec: 60,
    levelUpChannelId: null,
    leaderboardPublic: true,
  },
  [`/api/guilds/${GUILD}/role-panels`]: [
    {
      id: 1,
      title: 'Choisis ton équipe',
      channelId: CHANNEL,
      mode: 'UNIQUE',
      optionCount: 1,
      status: 'published',
      publishError: null,
    },
  ],
  [`/api/guilds/${GUILD}/role-panels/1`]: {
    id: 1,
    title: 'Choisis ton équipe',
    description: null,
    channelId: CHANNEL,
    mode: 'UNIQUE',
    options: [{ roleId: ROLE, label: 'Modérateur', emoji: null }],
    status: 'published',
    publishError: null,
  },
  [`/api/guilds/${GUILD}/giveaways?status=active&page=1`]: {
    giveaways: [
      {
        id: 12,
        prize: 'Nitro 1 mois',
        channelId: CHANNEL,
        winnersCount: 1,
        requiredRoleId: null,
        endsAt: '2099-01-01T20:00:00.000Z',
        endedAt: null,
        announced: false,
        entryCount: 18,
        winners: [],
        publication: 'published',
        publishError: null,
      },
    ],
    page: 1,
    pageCount: 1,
    total: 1,
  },
  [`/api/guilds/${GUILD}/td2/settings`]: {
    channelId: null,
    publicListing: false,
    reportChannelId: null,
    reportViewerRoleIds: [],
    reportFeedChannelId: null,
  },
  [`/api/guilds/${GUILD}/td2/events`]: [
    {
      id: 42,
      kind: 'RAID',
      activity: 'Dark Hours',
      mode: 'Normal',
      difficulty: null,
      directives: [],
      scheduledAt: '2099-01-03T20:00:00.000Z',
      channelId: CHANNEL,
      confirmed: 6,
      capacity: 8,
      reserve: 1,
    },
  ],
  [`/api/guilds/${GUILD}/welcome`]: {
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeMessage: null,
    welcomeRoleId: null,
    goodbyeEnabled: false,
    goodbyeChannelId: null,
    goodbyeMessage: null,
  },
  [`/api/guilds/${GUILD}/tickets/settings`]: { settings: null },
  [`/api/guilds/${GUILD}/delegates`]: [],
  [`/api/guilds/${GUILD}/tickets?status=open&page=1`]: {
    tickets: [
      {
        id: 7,
        number: 31,
        ownerId: '600000000000000001',
        ownerName: 'Rook',
        status: 'OPEN',
        createdAt: '2026-11-10T18:00:00.000Z',
        closedAt: null,
        closedByName: null,
        messageCount: null,
        hasTranscript: false,
      },
    ],
    page: 1,
    pageCount: 1,
    total: 1,
  },
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
}

const base = `/dashboard/${GUILD}`;

describe('pages du tableau de bord', () => {
  it.each([
    [base, 'Général', () => screen.findByLabelText('Salon de logs de modération')],
    [`${base}/niveaux`, 'Niveaux', () => screen.findByRole('switch', { name: /Gagner de l'XP/ })],
    [
      `${base}/roles`,
      'Rôles en libre-service',
      () => screen.findByRole('heading', { level: 3, name: 'Choisis ton équipe' }),
    ],
    [`${base}/roles/1`, 'Modifier le panel', () => screen.findByDisplayValue('Choisis ton équipe')],
    [`${base}/roles/nouveau`, 'Nouveau panel', () => screen.findByLabelText('Titre')],
    [`${base}/giveaways`, 'Giveaways', () => screen.findByText('Nitro 1 mois')],
    [`${base}/giveaways/nouveau`, 'Nouveau giveaway', () => screen.findByLabelText('Lot')],
    [`${base}/td2`, 'The Division 2', () => screen.findByText('Raid Dark Hours · Normal')],
    [
      `${base}/bienvenue`,
      'Bienvenue',
      () => screen.findByRole('switch', { name: /message d’arrivée/ }),
    ],
    [`${base}/tickets`, 'Tickets', () => screen.findByText('Rook')],
    [
      `${base}/tickets/reglages`,
      'Réglages des tickets',
      () => screen.findByLabelText('Catégorie des tickets'),
    ],
    [`${base}/tickets/7`, 'Transcript', () => screen.findByTitle('Transcript du ticket')],
    [`${base}/acces`, 'Accès', () => screen.findByText('Personne n’a d’accès délégué')],
  ])('%s : « %s », chargée avec ses données', async (url, title, loaded) => {
    open(url);

    expect(await screen.findByRole('heading', { level: 2, name: title })).toBeTruthy();
    expect(await loaded()).toBeTruthy();
    expect(screen.queryByText('Chargement impossible')).toBeNull();
  });

  it('nomme le serveur et marque l’onglet de la page ouverte', async () => {
    open(`${base}/tickets/reglages`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Les Agents' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Réglages du serveur' });
    const current = within(nav).getByRole('link', { current: 'page' });
    expect(current.textContent).toBe('Tickets');
    // Un administrateur voit tous les onglets, « Bienvenue » puis l'onglet Accès en dernier
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels.slice(-2)).toEqual(['Bienvenue', 'Accès']);
  });

  it('propose de régler les tickets tant que rien ne l’est', async () => {
    open(`${base}/tickets`);

    expect(await screen.findByText('Les tickets ne sont pas encore réglés')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Régler les tickets' }).getAttribute('href')).toBe(
      `${base}/tickets/reglages`,
    );
  });

  it('dit ce qui a échoué et propose de réessayer', async () => {
    const leveling = API[`/api/guilds/${GUILD}/leveling`];
    delete API[`/api/guilds/${GUILD}/leveling`];
    onTestFinished(() => {
      API[`/api/guilds/${GUILD}/leveling`] = leveling;
    });
    open(`${base}/niveaux`);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Chargement impossible');
    expect(alert.textContent).toContain('Introuvable');
    expect(within(alert).getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});
