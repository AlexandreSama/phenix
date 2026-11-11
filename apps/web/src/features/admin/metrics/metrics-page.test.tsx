import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../../router';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const botBeat = {
  at: '2026-11-11T11:59:40.000Z',
  cpu: 3.2,
  memory: 180 * 1024 * 1024,
  memoryLimit: 512 * 1024 * 1024,
  uptime: 93_784,
  version: 'abc123',
  eventLoopDelayMs: 1.4,
  guilds: 12,
  ping: 42,
};
const totals = { count: 1234, errors: 5, guilds: 3 };

const overview = {
  services: { bot: { online: true, heartbeat: botBeat }, api: { online: false } },
  commands: { '24h': totals, '7d': { count: 9000, errors: 40, guilds: 8 }, '30d': totals },
  storage: {
    takenAt: '2026-11-11T11:55:00.000Z',
    postgres: { bytes: 10 * 1024 * 1024, tables: [{ name: 'ForumPost', bytes: 4 * 1024 * 1024 }] },
    valkey: { bytes: 2 * 1024 * 1024, maxBytes: null },
    garage: [{ name: 'media', bytes: 1536, objects: 2 }],
  },
};

const series = (range: string, names: string[], withPoints: boolean) => ({
  range,
  binMinutes: range === '24h' ? 5 : 60,
  series: names.map((name) => ({
    name,
    points: withPoints
      ? [
          { at: '2026-11-11T11:50:00.000Z', value: name.endsWith('cpu') ? 4 : 100 * 1024 * 1024 },
          { at: '2026-11-11T11:55:00.000Z', value: name.endsWith('cpu') ? 6 : 120 * 1024 * 1024 },
        ]
      : [],
  })),
});

const processNames = ['bot.cpu', 'api.cpu', 'bot.memory', 'api.memory'];
const storageNames = ['postgres.bytes', 'valkey.bytes', 'garage.media.bytes'];
const seriesUrl = (names: string[], range: string) =>
  `/api/admin/metrics/series?${new URLSearchParams({ names: names.join(','), range }).toString()}`;

/** Ce que l'API répond, adresse par adresse ; toute autre adresse répond 404. */
let API: Record<string, unknown>;

function defaultApi(): Record<string, unknown> {
  return {
    '/api/auth/me': {
      id: '1',
      username: 'Faye',
      avatarUrl: '/logo.png',
      isOwner: true,
      forumRole: 'ADMIN',
    },
    '/api/admin/metrics/overview': overview,
    '/api/admin/metrics/commands?range=24h': {
      range: '24h',
      commands: [
        { command: 'td2 mission', count: 800, errors: 3, avgDurationMs: 120 },
        { command: 'ping', count: 434, errors: 2, avgDurationMs: 15 },
      ],
      daily: [
        { day: '2026-11-10', count: 500, errors: 2 },
        { day: '2026-11-11', count: 734, errors: 3 },
      ],
    },
    '/api/admin/metrics/guilds?range=24h': {
      range: '24h',
      guilds: [
        {
          id: '100000000000000001',
          name: 'Les Agents',
          iconUrl: null,
          count: 1200,
          topCommand: 'td2 mission',
          lastActiveAt: '2026-11-11T11:00:00.000Z',
        },
        {
          id: '',
          name: null,
          iconUrl: null,
          count: 34,
          topCommand: 'ping',
          lastActiveAt: '2026-11-11T10:00:00.000Z',
        },
      ],
    },
    '/api/admin/metrics/commands?range=7d': { range: '7d', commands: [], daily: [] },
    '/api/admin/metrics/guilds?range=7d': { range: '7d', guilds: [] },
    [seriesUrl(processNames, '24h')]: series('24h', processNames, true),
    [seriesUrl(storageNames, '24h')]: series('24h', storageNames, true),
    [seriesUrl(processNames, '7d')]: series('7d', processNames, false),
    [seriesUrl(storageNames, '7d')]: series('7d', storageNames, false),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  API = defaultApi();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const body = API[String(input)];
    return body === undefined
      ? new Response('{"statusCode":404,"message":"Introuvable"}', { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

describe('page Métriques', () => {
  it('montre les chiffres clés, l’état en direct et un service hors ligne', async () => {
    open('/admin/metriques');

    expect(await screen.findByRole('heading', { level: 2, name: 'Métriques' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Métriques' }).getAttribute('href')).toBe(
      '/admin/metriques',
    );
    expect(await screen.findByText('1 234')).toBeTruthy();
    expect(screen.getByText('5 en erreur')).toBeTruthy();
    expect(screen.getByText('sur 12')).toBeTruthy();

    const bot = screen.getByRole('region', { name: 'Bot' });
    expect(within(bot).getByText('En ligne')).toBeTruthy();
    expect(within(bot).getByText('3,2 %')).toBeTruthy();
    expect(within(bot).getByText('180 Mo sur 512 Mo')).toBeTruthy();
    expect(within(bot).getByText('1 j 2 h')).toBeTruthy();
    expect(within(bot).getByText('42 ms')).toBeTruthy();
    const api = screen.getByRole('region', { name: 'API' });
    expect(within(api).getByText('Hors ligne')).toBeTruthy();
    expect(within(api).getByText(/Pas de battement depuis 90 secondes/)).toBeTruthy();
  });

  it('trace le CPU et la RAM, avec leur tableau de valeurs', async () => {
    open('/admin/metriques');

    const cpu = await screen.findByRole('img', { name: /CPU du bot et de l’API/ });
    expect(cpu.getAttribute('aria-label')).toContain('Bot : 6 %');
    const table = screen.getByRole('table', { name: 'CPU du bot et de l’API' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByText('6 %')).toHaveLength(2);

    // Au clavier : la flèche gauche montre le dernier relevé dans l'infobulle
    fireEvent.keyDown(cpu, { key: 'ArrowLeft' });
    expect(cpu.textContent).toContain('6 %');
    fireEvent.keyDown(cpu, { key: 'Escape' });
    expect(cpu.textContent).toBe('');

    expect(screen.getByRole('table', { name: 'Mémoire du bot et de l’API' })).toBeTruthy();
  });

  it('détaille le stockage, les commandes et les serveurs', async () => {
    open('/admin/metriques');

    expect(await screen.findByText('10 Mo')).toBeTruthy();
    expect(screen.getByText('Sans plafond')).toBeTruthy();
    const buckets = screen.getByRole('table', { name: 'Volume de chaque bucket Garage' });
    expect(within(buckets).getByText('1,5 Ko (2 objets)')).toBeTruthy();
    expect(
      await screen.findByRole('table', { name: 'Volume du stockage dans le temps' }),
    ).toBeTruthy();

    const commands = screen.getByRole('table', { name: 'Les commandes les plus utilisées' });
    expect(within(commands).getByText('/td2 mission')).toBeTruthy();
    expect(within(commands).getByText('800 (3 erreurs · 120 ms en moyenne)')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Commandes lancées par jour' })).toBeTruthy();

    const guilds = screen.getByRole('table', { name: 'Serveurs les plus actifs' });
    const rows = within(guilds).getAllByRole('row');
    expect(within(rows[1]!).getByRole('rowheader').textContent).toContain('Les Agents');
    expect(within(rows[2]!).getByRole('rowheader').textContent).toContain('Messages privés');
  });

  it('garde la période dans l’adresse, avec des états vides propres', async () => {
    const router = open('/admin/metriques');
    await screen.findByText('1 234');

    fireEvent.click(screen.getByRole('link', { name: '7 jours' }));

    await vi.waitFor(() => expect(router.state.location.search).toEqual({ range: '7d' }));
    expect(await screen.findByText('9 000')).toBeTruthy();
    expect(
      await screen.findAllByText('Pas encore de relevé : le premier arrive dans 5 minutes.'),
    ).toHaveLength(3);
    expect(screen.getAllByText('Aucune commande lancée sur cette période.')).toHaveLength(2);
    expect(screen.getByText('Aucun serveur n’a lancé de commande sur cette période.')).toBeTruthy();
  });

  it('une plage inconnue dans l’adresse retombe sur 24 h', async () => {
    open('/admin/metriques?range=1an');
    expect(await screen.findByText('1 234')).toBeTruthy();
  });

  it('affiche l’erreur de l’API et relance la requête', async () => {
    delete API['/api/admin/metrics/overview'];
    open('/admin/metriques');

    expect(await screen.findByText('Chargement impossible')).toBeTruthy();
    API['/api/admin/metrics/overview'] = overview;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('1 234')).toBeTruthy();
  });

  it('rafraîchit l’état en direct toutes les 30 secondes', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    open('/admin/metriques');
    await screen.findByText('1 234');
    const calls = () =>
      vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/admin/metrics/overview').length;
    const before = calls();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(calls()).toBe(before + 1);
  });
});
