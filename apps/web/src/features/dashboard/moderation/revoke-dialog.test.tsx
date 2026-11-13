import type { CasePage, CaseSummary } from '@phenix/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../../../router';

const GUILD = '100000000000000001';
const person = (id: string, name: string) => ({ id, name, avatarUrl: null });
const rook = person('600000000000000001', 'Rook');
const modo = person('600000000000000002', 'Modo');

const sanction = (over: Partial<CaseSummary>): CaseSummary => ({
  number: 1,
  type: 'WARN',
  status: 'active',
  target: rook,
  moderator: modo,
  reason: null,
  createdAt: '2026-11-10T18:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  ...over,
});

const ban = sanction({ number: 12, type: 'BAN' });
const mute = sanction({ number: 11, type: 'MUTE', expiresAt: '2099-01-01T00:00:00.000Z' });
const warn = sanction({ number: 10, type: 'WARN' });
const ended = sanction({ number: 9, type: 'MUTE', status: 'ended' });
const lifted = sanction({
  number: 8,
  type: 'BAN',
  status: 'revoked',
  revokedAt: '2026-11-11T08:00:00.000Z',
});
const kick = sanction({ number: 7, type: 'KICK', status: null });
// Un état impossible en base, mais le bouton ne doit pas dépendre que du statut
const kickActive = sanction({ number: 6, type: 'KICK', status: 'active' });

let items: CaseSummary[] = [];
const page = (): CasePage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  nameSearch: 'not-applicable',
});

interface Call {
  method: string;
  url: string;
  body: unknown;
}
let calls: Call[] = [];
/** La réponse du POST de levée ; peut être différée pour voir le bouton « en cours d'envoi ». */
let revokeResponse: () => Promise<Response>;

beforeEach(() => {
  items = [ban, mute, warn, ended, lifted, kick, kickActive];
  calls = [];
  revokeResponse = async () =>
    new Response(JSON.stringify({ alreadyRevoked: false }), { status: 200 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          id: '1',
          username: 'Faye',
          avatarUrl: '/logo.png',
          isOwner: false,
          forumRole: 'MEMBER',
        }),
      );
    }
    if (url === '/api/guilds') {
      return new Response(
        JSON.stringify([
          {
            id: GUILD,
            name: 'Les Agents',
            iconUrl: null,
            botPresent: true,
            access: 'admin',
            modules: ['GENERAL', 'MODERATION'],
          },
        ]),
      );
    }
    if (method === 'POST' && url.includes('/revoke')) return revokeResponse();
    if (url.includes('/moderation/cases')) return new Response(JSON.stringify(page()));
    return new Response('{"message":"Introuvable"}', { status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/dashboard/${GUILD}/moderation`] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const rowOf = async (number: number) => {
  const list = await screen.findByRole('list', { name: 'Sanctions' });
  const row = within(list)
    .getAllByRole('listitem')
    .find((entry) => within(entry).queryByText(`#${number}`));
  return within(row!);
};
const loads = () =>
  calls.filter((call) => call.method === 'GET' && call.url.includes('/moderation/cases')).length;
const posts = () => calls.filter((call) => call.method === 'POST');
const dialog = () => screen.findByRole('dialog');

describe('lever une sanction', () => {
  it('propose le bouton seulement sur ce qui peut être levé, avec le bon libellé', async () => {
    open();

    expect((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' })).toBeTruthy();
    expect((await rowOf(11)).getByRole('button', { name: 'Lever la sourdine' })).toBeTruthy();
    expect((await rowOf(10)).getByRole('button', { name: 'Retirer l’avertissement' })).toBeTruthy();
    // sourdine terminée, sanction déjà levée, expulsion (même « active ») : rien à lever
    for (const number of [9, 8, 7, 6]) {
      expect((await rowOf(number)).queryByRole('button')).toBeNull();
    }
  });

  it('demande confirmation et n’envoie rien tant qu’on n’a pas confirmé', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));

    const confirm = within(await dialog());
    expect(confirm.getByRole('heading', { name: 'Lever le bannissement #12 ?' })).toBeTruthy();
    expect(confirm.getByText(/Rook/)).toBeTruthy();
    expect(posts()).toEqual([]);
  });

  it('annule sans rien envoyer, par le bouton ou par la touche Échap', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    fireEvent.keyDown(await dialog(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts()).toEqual([]);
  });

  it('envoie la levée avec la raison, puis recharge la liste et ferme', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    const confirm = within(await dialog());
    fireEvent.change(confirm.getByLabelText('Raison (facultative)'), {
      target: { value: '  Erreur de modération ' },
    });

    const before = calls.filter(
      (call) => call.method === 'GET' && call.url.includes('/moderation/cases'),
    ).length;
    fireEvent.click(confirm.getByRole('button', { name: 'Lever la sanction' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts()).toEqual([
      {
        method: 'POST',
        url: `/api/guilds/${GUILD}/moderation/cases/12/revoke`,
        body: { reason: 'Erreur de modération' },
      },
    ]);
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'GET' && call.url.includes('/moderation/cases'))
          .length,
      ).toBeGreaterThan(before),
    );
  });

  it('envoie une levée sans raison quand le champ est vide', async () => {
    open();
    fireEvent.click((await rowOf(10)).getByRole('button', { name: 'Retirer l’avertissement' }));

    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lever la sanction' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({});
  });

  it('ne demande pas de raison pour un avertissement : elle ne serait enregistrée nulle part', async () => {
    open();
    fireEvent.click((await rowOf(10)).getByRole('button', { name: 'Retirer l’avertissement' }));

    const confirm = within(await dialog());
    expect(confirm.queryByLabelText('Raison (facultative)')).toBeNull();
    expect(confirm.getByText(/reste dans l’historique/)).toBeTruthy();
  });

  it('donne le focus à « Annuler » pour un avertissement, qui n’a pas de champ : Échap le ferme', async () => {
    open();
    fireEvent.click((await rowOf(10)).getByRole('button', { name: 'Retirer l’avertissement' }));

    const confirm = within(await dialog());
    await waitFor(() =>
      expect(document.activeElement).toBe(confirm.getByRole('button', { name: 'Annuler' })),
    );
    // Dans un navigateur, la touche part de l'élément qui a le focus
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts()).toEqual([]);
  });

  it('dit où la raison sera visible : journal d’audit Discord et salon de logs', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));

    expect(
      within(await dialog()).getByText(/journal d’audit de Discord et le salon de logs/),
    ).toBeTruthy();
  });

  it('envoie une levée sans raison quand la raison d’un ban est vide ou blanche', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    const confirm = within(await dialog());
    fireEvent.change(confirm.getByLabelText('Raison (facultative)'), { target: { value: '   ' } });

    fireEvent.click(confirm.getByRole('button', { name: 'Lever la sanction' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({});
  });

  it('compte les caractères de la raison, 512 au plus', async () => {
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    const confirm = within(await dialog());
    const field = confirm.getByLabelText('Raison (facultative)') as HTMLTextAreaElement;

    fireEvent.change(field, { target: { value: 'Erreur' } });

    expect(field.maxLength).toBe(512);
    expect(confirm.getByText('6 / 512')).toBeTruthy();
  });

  it('désactive le bouton pendant l’envoi : un double clic ne lève qu’une fois', async () => {
    let finish!: () => void;
    revokeResponse = () =>
      new Promise((resolve) => {
        finish = () => resolve(new Response(JSON.stringify({ alreadyRevoked: false })));
      });
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    const button = within(await dialog()).getByRole('button', { name: 'Lever la sanction' });

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(posts()).toHaveLength(1);
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('garde la fenêtre quand on annule ou presse Échap pendant l’envoi', async () => {
    let finish!: () => void;
    revokeResponse = () =>
      new Promise((resolve) => {
        finish = () => resolve(new Response(JSON.stringify({ alreadyRevoked: false })));
      });
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lever la sanction' }));
    await waitFor(() => expect(posts()).toHaveLength(1));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('permet de réessayer après un refus : un second clic envoie une seconde levée', async () => {
    revokeResponse = async () =>
      new Response(JSON.stringify({ message: 'Discord ne répond pas.' }), { status: 503 });
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lever la sanction' }));
    await screen.findByRole('alert');

    revokeResponse = async () => new Response(JSON.stringify({ alreadyRevoked: false }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lever la sanction' }),
    );

    await waitFor(() => expect(posts()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('recharge la liste même après un refus : la sanction a pu changer entre-temps', async () => {
    revokeResponse = async () =>
      new Response(JSON.stringify({ message: 'Cette sanction ne peut pas être levée' }), {
        status: 409,
      });
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));
    await dialog();
    // Laisse finir les chargements de la page avant de compter : seul le rechargement d'après compte
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = loads();

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lever la sanction' }),
    );

    await screen.findByRole('alert');
    await waitFor(() => expect(loads()).toBe(before + 1));
  });

  it('dit qu’une sanction était déjà levée par quelqu’un d’autre, au lieu de se fermer sans rien dire', async () => {
    revokeResponse = async () => new Response(JSON.stringify({ alreadyRevoked: true }));
    open();
    fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));

    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lever la sanction' }));

    expect((await screen.findByRole('status')).textContent).toContain('déjà levée');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    [409, 'Le bot n’a pas le droit d’agir sur ce membre.'],
    [503, 'Discord ne répond pas, réessaie dans un instant.'],
    [403, 'Il te manque la permission Discord « Bannir des membres » sur ce serveur.'],
  ])(
    'affiche le refus (%i) et garde la fenêtre ouverte pour réessayer',
    async (status, message) => {
      revokeResponse = async () => new Response(JSON.stringify({ message }), { status });
      open();
      fireEvent.click((await rowOf(12)).getByRole('button', { name: 'Lever le bannissement' }));

      fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lever la sanction' }));

      expect((await screen.findByRole('alert')).textContent).toContain(message);
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(
        (
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Lever la sanction',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    },
  );
});
