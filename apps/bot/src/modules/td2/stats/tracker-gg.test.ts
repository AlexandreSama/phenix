import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createTrackerGgProvider, toCareer, toStat } from './tracker-gg.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const PROFILE = fixture('tracker-profile.json');
const SEARCH = fixture('tracker-search.json');

const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

/** Le strict minimum d'une réponse de profil : un pseudo, aucun segment */
const profileBody = (handle: string) => ({
  data: { platformInfo: { platformUserHandle: handle }, segments: [] },
});

function setup(respond: () => Promise<Response> | Response = () => json(PROFILE)) {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => respond());
  const provider = createTrackerGgProvider({
    apiKey: 'cle-de-test',
    baseUrl: 'https://trn.test/v2/',
    fetch: fetchImpl as unknown as typeof fetch,
  });
  const request = (index = 0) => {
    const [url, init] = fetchImpl.mock.calls[index] ?? [];
    return { url, headers: init?.headers as Record<string, string> | undefined };
  };
  return { provider, fetchImpl, request };
}

describe('la carrière d’un joueur', () => {
  it('interroge l’API avec la clé, la plateforme et le pseudo encodé', async () => {
    const { provider, request } = setup();

    await provider.career('UBI', ' Agent 47#FR ');

    expect(request().url).toBe(
      'https://trn.test/v2/division-2/standard/profile/ubi/Agent%2047%23FR',
    );
    expect(request().headers).toMatchObject({ 'TRN-Api-Key': 'cle-de-test' });
  });

  it('l’adresse du profil encode le pseudo et suit la plateforme', () => {
    expect(toCareer('UBI', profileBody('Agent 47/x#1')).profileUrl).toBe(
      'https://tracker.gg/division-2/profile/ubi/Agent%2047%2Fx%231/overview',
    );
    expect(toCareer('XBL', profileBody('Agent47')).profileUrl).toBe(
      'https://tracker.gg/division-2/profile/xbl/Agent47/overview',
    );
  });

  it('lit le pseudo exact, l’avatar et les stats du segment « overview »', async () => {
    const { provider } = setup();

    const result = await provider.career('PSN', 'agent47');

    expect(result).toMatchObject({
      status: 'ok',
      career: {
        platform: 'PSN',
        handle: 'Agent47',
        avatarUrl: 'https://avatar-cdn.tracker.gg/api/avatar/2/Agent47.png',
        profileUrl: 'https://tracker.gg/division-2/profile/psn/Agent47/overview',
      },
    });
    if (result.status !== 'ok') return;
    expect(result.career.stats).toEqual({
      level: { kind: 'number', value: 40 },
      gearScore: { kind: 'number', value: 515 },
      specialization: { kind: 'text', value: 'Firewall' },
      timePlayed: { kind: 'duration', seconds: 1_234_567 },
      timePve: { kind: 'duration', seconds: 864_000 },
      timeDarkZone: { kind: 'duration', seconds: 183_900 },
      npcKills: { kind: 'number', value: 48_213 },
      eliteKills: { kind: 'number', value: 9120 },
      namedKills: { kind: 'number', value: 1534 },
      headshots: { kind: 'number', value: 21_987 },
      dzRank: { kind: 'number', value: 87 },
      roguesKilled: { kind: 'number', value: 312 },
      pvpKills: { kind: 'number', value: 645 },
    });
  });

  it('une stat absente de la réponse est simplement absente', async () => {
    const body = JSON.parse(PROFILE) as {
      data: { segments: { stats: Record<string, unknown> }[] };
    };
    delete body.data.segments[0]?.stats.rankDZ;
    const { provider } = setup(() => json(JSON.stringify(body)));

    const result = await provider.career('PSN', 'Agent47');

    expect(result.status === 'ok' && 'dzRank' in result.career.stats).toBe(false);
  });

  it.each([
    [404, { status: 'not-found' }],
    [400, { status: 'not-found' }],
    [401, { status: 'unavailable', reason: 'refused' }],
    [403, { status: 'unavailable', reason: 'refused' }],
    [429, { status: 'unavailable', reason: 'rate-limited' }],
    [503, { status: 'unavailable', reason: 'down' }],
  ])('HTTP %i : %o', async (status, expected) => {
    const { provider } = setup(() => json('{"errors":[{"message":"…"}]}', status));

    expect(await provider.career('PSN', 'Agent47')).toEqual(expected);
  });

  it('délai dépassé ou réponse illisible : le service est en panne', async () => {
    const timeout = setup(() => Promise.reject(new DOMException('trop long', 'TimeoutError')));
    const garbage = setup(() => json('<html>Bad gateway</html>'));
    const unexpected = setup(() => json('{"data":{"segments":[]}}'));

    for (const { provider } of [timeout, garbage, unexpected]) {
      expect(await provider.career('PSN', 'Agent47')).toEqual({
        status: 'unavailable',
        reason: 'down',
      });
    }
  });
});

describe('toStat', () => {
  it('des minutes deviennent des secondes ; une unité inconnue garde le texte de l’API', () => {
    const minutes = { value: 1200, displayValue: '20h', displayType: 'TimeMinutes' };
    const unknown = { value: 1200, displayValue: '20h', displayType: 'Number' };

    expect(toStat('timePlayed', minutes)).toEqual({ kind: 'duration', seconds: 72_000 });
    expect(toStat('timePlayed', unknown)).toEqual({ kind: 'text', value: '20h' });
  });

  it('un nombre absent retombe sur le texte, et rien du tout donne undefined', () => {
    expect(toStat('level', { value: null, displayValue: '40' })).toEqual({
      kind: 'text',
      value: '40',
    });
    expect(toStat('level', { value: null, displayValue: ' ' })).toBeUndefined();
  });
});

describe('la recherche de pseudos', () => {
  it('rend les pseudos trouvés, sans doublon', async () => {
    const { provider, request } = setup(() => json(SEARCH));

    expect(await provider.search('PSN', 'agent4')).toEqual(['Agent47', 'Agent47_FR', 'Agent470']);
    expect(request().url).toBe(
      'https://trn.test/v2/division-2/standard/search?platform=psn&query=agent4',
    );
  });

  it('une erreur donne une liste vide : l’autocomplétion ne plante jamais', async () => {
    const refused = setup(() => json('{}', 401));
    const offline = setup(() => Promise.reject(new TypeError('fetch failed')));

    expect(await refused.provider.search('PSN', 'agent')).toEqual([]);
    expect(await offline.provider.search('PSN', 'agent')).toEqual([]);
  });
});
