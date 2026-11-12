import type { CasePage, CaseSummary, MemberModeration } from '@phenix/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../../router';

const GUILD = '100000000000000001';
const ROOK = '600000000000000001';
const MODO = '600000000000000002';
const GHOST = '600000000000000003';
const base = `/dashboard/${GUILD}/moderation`;
const CASES = `/api/guilds/${GUILD}/moderation/cases`;

const rook = { id: ROOK, name: 'Rook', avatarUrl: null };
const modo = { id: MODO, name: 'Modo', avatarUrl: null };
/** Discord n'a pas répondu : l'API renvoie l'identifiant en guise de nom. */
const ghost = { id: GHOST, name: GHOST, avatarUrl: null };

const ban: CaseSummary = {
  number: 12,
  type: 'BAN',
  status: 'active',
  target: rook,
  moderator: modo,
  reason: 'Spam dans #général',
  createdAt: '2026-11-10T18:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
};
const mute: CaseSummary = {
  ...ban,
  number: 11,
  type: 'MUTE',
  status: 'ended',
  reason: null,
  expiresAt: '2026-11-09T18:00:00.000Z',
};
const warn: CaseSummary = {
  ...ban,
  number: 10,
  type: 'WARN',
  status: 'revoked',
  target: ghost,
  reason: 'Pub',
  revokedAt: '2026-11-11T08:00:00.000Z',
  revokedBy: modo,
};

const page = (items: CaseSummary[], total = items.length): CasePage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
});
const member: MemberModeration = {
  user: rook,
  total: 3,
  byType: { WARN: 2, MUTE: 0, UNMUTE: 0, KICK: 0, BAN: 1, UNBAN: 0 },
  activeWarns: 2,
  activeMute: { number: 9, expiresAt: '2099-01-01T12:00:00.000Z' },
  activeBan: { number: 12 },
};

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
      modules: ['GENERAL', 'TICKETS', 'MODERATION'],
    },
  ],
  [`${CASES}?page=1`]: page([ban, mute, warn]),
  [`${CASES}?targetId=${ROOK}&page=1`]: page([ban]),
  [`/api/guilds/${GUILD}/moderation/members/${ROOK}`]: member,
};

const urls = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const body = API[String(input)];
    return body === undefined
      ? new Response('{"statusCode":404,"message":"Introuvable"}', { status: 404 })
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
  return router;
}

describe('liste des sanctions', () => {
  it('affiche chaque sanction : numéro, type, statut, personnes, raison', async () => {
    open(base);

    const list = await screen.findByRole('list', { name: 'Sanctions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const first = within(rows[0]!);
    expect(first.getByText('#12')).toBeTruthy();
    expect(first.getByText('Bannissement')).toBeTruthy();
    expect(first.getByText('Active')).toBeTruthy();
    expect(first.getByRole('link', { name: 'Rook' })).toBeTruthy();
    expect(first.getByRole('link', { name: 'Modo' })).toBeTruthy();
    expect(first.getByText('Spam dans #général')).toBeTruthy();
    expect(first.getByText(/10\/11\/2026/)).toBeTruthy();
    // sans raison, une sourdine terminée, puis une sanction levée par quelqu'un
    expect(within(rows[1]!).getByText('Aucune raison fournie')).toBeTruthy();
    expect(within(rows[1]!).getByText('Terminée')).toBeTruthy();
    expect(within(rows[1]!).getByText(/jusqu’au 09\/11\/2026/)).toBeTruthy();
    expect(within(rows[2]!).getByText('Levée')).toBeTruthy();
    expect(within(rows[2]!).getByText(/Levée le 11\/11\/2026.* par Modo/)).toBeTruthy();
  });

  it('affiche l’identifiant tel quel quand Discord n’a pas donné de nom', async () => {
    open(base);

    expect(await screen.findByRole('link', { name: GHOST })).toBeTruthy();
  });

  it('mène à la fiche du membre et filtre sur un modérateur', async () => {
    open(base);

    const [target] = await screen.findAllByRole('link', { name: 'Rook' });
    expect(target?.getAttribute('href')).toBe(`${base}/membres/${ROOK}`);
    const [moderator] = screen.getAllByRole('link', { name: 'Modo' });
    // le routeur met l'identifiant entre guillemets : sinon l'adresse le lirait comme un nombre
    expect(moderator?.getAttribute('href')).toContain(`moderatorId=%22${MODO}%22`);
  });

  it('demande la page 1 sans filtre, et lit tous les filtres de l’adresse', async () => {
    API[
      `${CASES}?type=BAN&status=active&moderatorId=${MODO}&targetId=${ROOK}&q=spam&from=2026-11-01&to=2026-11-09&page=2`
    ] = page([ban], 45);
    open(
      `${base}?page=2&to=2026-11-09&from=2026-11-01&q=spam&targetId=%22${ROOK}%22&moderatorId=%22${MODO}%22&status=active&type=BAN`,
    );

    expect(await screen.findByText('Spam dans #général')).toBeTruthy();
    expect(urls()).toContain(
      `${CASES}?type=BAN&status=active&moderatorId=${MODO}&targetId=${ROOK}&q=spam&from=2026-11-01&to=2026-11-09&page=2`,
    );
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('BAN');
    expect((screen.getByLabelText('Statut') as HTMLSelectElement).value).toBe('active');
    expect((screen.getByLabelText('Rechercher') as HTMLInputElement).value).toBe('spam');
    expect((screen.getByLabelText('Du') as HTMLInputElement).value).toBe('2026-11-01');
  });

  it('revient à la valeur par défaut pour un filtre invalide de l’adresse', async () => {
    open(
      `${base}?type=NOPE&status=x&page=0&from=hier&to=2026-02-30&targetId=12&q=${'a'.repeat(101)}`,
    );

    expect(await screen.findByText('Spam dans #général')).toBeTruthy();
    expect(urls().filter((url) => url.includes('/moderation/cases'))).toEqual([`${CASES}?page=1`]);
  });

  it('ignore la fin d’une période à l’envers, au lieu d’afficher une erreur sans issue', async () => {
    API[`${CASES}?from=2026-11-10&page=1`] = page([ban]);
    open(`${base}?from=2026-11-10&to=2026-11-05`);

    expect(await screen.findByText('Spam dans #général')).toBeTruthy();
    expect(urls().filter((url) => url.includes('/moderation/cases'))).toEqual([
      `${CASES}?from=2026-11-10&page=1`,
    ]);
  });

  it('empêche de choisir une fin avant le début, et un début après la fin', async () => {
    API[`${CASES}?from=2026-11-01&to=2026-11-09&page=1`] = page([ban]);
    open(`${base}?from=2026-11-01&to=2026-11-09`);
    await screen.findByText('Spam dans #général');

    expect(screen.getByLabelText('Du').getAttribute('max')).toBe('2026-11-09');
    expect(screen.getByLabelText('Au').getAttribute('min')).toBe('2026-11-01');
  });

  it('traite une recherche vide de l’adresse comme l’absence de recherche', async () => {
    open(`${base}?q=`);

    expect(await screen.findByText('Spam dans #général')).toBeTruthy();
    expect(urls().filter((url) => url.includes('/moderation/cases'))).toEqual([`${CASES}?page=1`]);
    expect(screen.queryByRole('link', { name: 'Réinitialiser les filtres' })).toBeNull();
  });

  it('dit qu’une page n’existe plus, plutôt que « aucune sanction », et mène à la dernière', async () => {
    API[`${CASES}?page=50`] = { items: [], total: 45, page: 50, pageSize: 20 };
    open(`${base}?page=50`);

    expect(await screen.findByText('Cette page n’existe plus')).toBeTruthy();
    expect(screen.queryByText('Aucune sanction pour l’instant')).toBeNull();
    const last = screen.getByRole('link', { name: 'Aller à la dernière page' });
    expect(last.getAttribute('href')).toContain('page=3');
  });

  it('change de filtre : la page repart de 1 et l’adresse suit', async () => {
    API[`${CASES}?type=BAN&page=1`] = page([ban]);
    const router = open(`${base}?page=3`);
    await screen.findByLabelText('Type');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'BAN' } });

    await waitFor(() => expect(urls()).toContain(`${CASES}?type=BAN&page=1`));
    expect(router.state.location.search).toEqual({ type: 'BAN' });
  });

  it('cherche à l’envoi du formulaire', async () => {
    API[`${CASES}?q=%2312&page=1`] = page([ban]);
    open(base);
    const input = await screen.findByLabelText('Rechercher');

    fireEvent.change(input, { target: { value: '  #12 ' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(urls()).toContain(`${CASES}?q=%2312&page=1`));
  });

  it('dit qu’aucune sanction ne correspond, et propose de réinitialiser les filtres', async () => {
    API[`${CASES}?type=KICK&page=1`] = page([]);
    open(`${base}?type=KICK`);

    expect(await screen.findByText('Aucune sanction ne correspond')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Réinitialiser les filtres' }).getAttribute('href'),
    ).toBe(base);
  });

  it('dit qu’il n’y a encore aucune sanction quand aucun filtre n’est posé', async () => {
    API[`${CASES}?page=1`] = page([]);
    open(base);

    expect(await screen.findByText('Aucune sanction pour l’instant')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Réinitialiser les filtres' })).toBeNull();
  });

  it('pagine : 45 sanctions font 3 pages, en gardant les filtres', async () => {
    API[`${CASES}?type=BAN&page=1`] = page([ban], 45);
    open(`${base}?type=BAN`);

    expect(await screen.findByText('Page 1 / 3')).toBeTruthy();
    expect(screen.getByText('45 sanctions')).toBeTruthy();
    const next = screen.getByRole('link', { name: /Suivante/ });
    expect(next.getAttribute('href')).toContain('type=BAN');
    expect(next.getAttribute('href')).toContain('page=2');
  });

  it('dit ce qui a échoué et propose de réessayer', async () => {
    delete API[`${CASES}?page=1`];
    open(base);

    expect(await screen.findByText('Chargement impossible')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});

describe('fiche d’un membre', () => {
  it('montre qui il est, ses compteurs et ce qui est encore actif', async () => {
    open(`${base}/membres/${ROOK}`);

    expect(await screen.findByRole('heading', { level: 2, name: 'Rook' })).toBeTruthy();
    expect(screen.getByText(ROOK)).toBeTruthy();
    expect(screen.getByText('3 sanctions')).toBeTruthy();
    expect(screen.getByText('2 avertissements actifs')).toBeTruthy();
    expect(screen.getByText(/Sourdine active jusqu’au 01\/01\/2099/)).toBeTruthy();
    expect(screen.getByText('Bannissement actif (#12)')).toBeTruthy();
  });

  it('compte ses sanctions par type', async () => {
    open(`${base}/membres/${ROOK}`);

    expect(await screen.findByText('Avertissement : 2 · Bannissement : 1')).toBeTruthy();
  });

  it('encode l’identifiant de l’adresse : il ne peut pas viser une autre route de l’API', async () => {
    open(`${base}/membres/${encodeURIComponent('../../admin?x')}`);

    expect(await screen.findByText('Chargement impossible')).toBeTruthy();
    expect(urls()).toContain(`/api/guilds/${GUILD}/moderation/members/..%2F..%2Fadmin%3Fx`);
    expect(urls().some((url) => url.startsWith('/api/admin'))).toBe(false);
  });

  it('dit qu’il n’y a rien d’actif pour un membre sans sanction en cours', async () => {
    API[`/api/guilds/${GUILD}/moderation/members/${ROOK}`] = {
      ...member,
      total: 1,
      byType: { ...member.byType, WARN: 1, BAN: 0 },
      activeWarns: 0,
      activeMute: null,
      activeBan: null,
    };
    open(`${base}/membres/${ROOK}`);

    expect(await screen.findByText('Aucun avertissement actif')).toBeTruthy();
    expect(screen.getByText('Aucune sourdine active')).toBeTruthy();
    expect(screen.getByText('Aucun bannissement actif')).toBeTruthy();
  });

  it('liste son historique : les sanctions dont il est la cible', async () => {
    open(`${base}/membres/${ROOK}`);

    const list = await screen.findByRole('list', { name: 'Sanctions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(urls()).toContain(`${CASES}?targetId=${ROOK}&page=1`);
  });

  it('revient à la liste', async () => {
    open(`${base}/membres/${ROOK}`);

    const back = await screen.findByRole('link', { name: /Toutes les sanctions/ });
    expect(back.getAttribute('href')).toBe(base);
  });

  it('signale un membre que l’API ne connaît pas', async () => {
    open(`${base}/membres/abc`);

    expect(await screen.findByText('Chargement impossible')).toBeTruthy();
  });
});
