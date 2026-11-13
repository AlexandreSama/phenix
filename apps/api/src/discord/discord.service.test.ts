import { REST } from '@discordjs/rest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { DiscordService } from './discord.service.js';

const env = { DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: '123456789012345678' } as Env;
const GUILD = '300000000000000001';

afterEach(() => vi.restoreAllMocks());

describe('DiscordService.searchGuildMembers', () => {
  it('transmet l’échéance (AbortSignal) à la requête', async () => {
    const get = vi.spyOn(REST.prototype, 'get').mockResolvedValue([]);
    const signal = AbortSignal.timeout(1_500);

    await new DiscordService(env).searchGuildMembers(GUILD, 'Fa', 25, signal);

    expect(get).toHaveBeenCalledWith(`/guilds/${GUILD}/members/search`, {
      query: new URLSearchParams({ query: 'Fa', limit: '25' }),
      signal,
    });
  });

  it('sans échéance, garde le comportement existant (10 résultats par défaut)', async () => {
    const get = vi.spyOn(REST.prototype, 'get').mockResolvedValue([]);

    await new DiscordService(env).searchGuildMembers(GUILD, 'Fa');

    expect(get).toHaveBeenCalledWith(`/guilds/${GUILD}/members/search`, {
      query: new URLSearchParams({ query: 'Fa', limit: '10' }),
      signal: undefined,
    });
  });
});
