import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettingsPage } from './general-settings-page';

const GUILD = '100000000000000001';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useParams: () => ({ guildId: GUILD }),
}));

const guild = (id: string, access: 'admin' | 'delegate') => ({
  id,
  name: 'Les Agents',
  iconUrl: null,
  botPresent: true,
  access,
  modules: ['GENERAL'],
});

/** L'API simulée : la liste des serveurs varie selon le cas, le reste est fixe. */
function mockApi(guilds: unknown[]) {
  const API: Record<string, unknown> = {
    '/api/guilds': guilds,
    [`/api/guilds/${GUILD}/config`]: {
      timezone: 'Europe/Paris',
      modLogChannelId: null,
      announceChannelId: null,
      staffRoleIds: [],
      caseRetentionMonths: 12,
    },
    [`/api/guilds/${GUILD}/channels`]: [],
    [`/api/guilds/${GUILD}/roles`]: [],
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const body = API[String(input)];
    return body === undefined
      ? new Response('{"statusCode":404,"message":"Introuvable"}', { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
}

async function open(guilds: unknown[]) {
  mockApi(guilds);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GeneralSettingsPage />
    </QueryClientProvider>,
  );
  return screen.findByLabelText<HTMLSelectElement>('Conservation des sanctions');
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('GeneralSettingsPage : conservation des sanctions', () => {
  it('est modifiable pour un administrateur du serveur', async () => {
    const select = await open([guild(GUILD, 'admin')]);
    expect(select.disabled).toBe(false);
  });

  it('est réservée aux administrateurs pour un délégué', async () => {
    const select = await open([guild(GUILD, 'delegate')]);
    expect(select.disabled).toBe(true);
    expect(screen.getByText('Réservé aux administrateurs du serveur.')).toBeTruthy();
  });

  it('est désactivée par prudence si le serveur est absent de la liste', async () => {
    const select = await open([guild('100000000000000999', 'admin')]);
    expect(select.disabled).toBe(true);
  });
});
