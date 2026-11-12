import type { ManageableGuild } from '@phenix/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test-utils';
import { filterGuilds, GuildList } from './guild-list';

const guild = (id: string, name: string, botPresent: boolean): ManageableGuild => ({
  id,
  name,
  iconUrl: null,
  botPresent,
  access: 'admin',
  modules: ['GENERAL', 'LEVELING', 'ROLES', 'TICKETS', 'GIVEAWAYS', 'TD2', 'WELCOME'],
});

const GUILDS = [
  guild('100', 'Les Agents', true),
  guild('101', 'Raid du jeudi', true),
  guild('200', 'Élite Phénix', false),
];

describe('filterGuilds', () => {
  it('ignore les accents, les majuscules et les espaces autour', () => {
    expect(filterGuilds(GUILDS, '  elite phenix ').map((entry) => entry.id)).toEqual(['200']);
    expect(filterGuilds(GUILDS, 'RAID').map((entry) => entry.id)).toEqual(['101']);
  });

  it('rend toute la liste sans recherche', () => {
    expect(filterGuilds(GUILDS, '   ')).toBe(GUILDS);
  });
});

describe('GuildList', () => {
  it('sépare les serveurs avec le bot de ceux où l’inviter', async () => {
    renderWithProviders(<GuildList guilds={GUILDS} />);

    const withBot = await screen.findByRole('region', { name: 'Avec PhenixMG 2 serveurs' });
    expect(
      within(withBot)
        .getAllByRole('link')
        .map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')]),
    ).toEqual([
      ['Configurer Les Agents', '/dashboard/100'],
      ['Configurer Raid du jeudi', '/dashboard/101'],
    ]);

    const withoutBot = screen.getByRole('region', { name: 'Sans PhenixMG 1 serveur' });
    const invite = within(withoutBot).getByRole('link', {
      name: 'Inviter le bot sur Élite Phénix (nouvel onglet)',
    });
    expect(invite.getAttribute('href')).toBe('/api/invite?guildId=200');
    expect(invite.getAttribute('target')).toBe('_blank');
  });

  it('range à part les accès délégués, qui mènent au premier onglet ouvert', async () => {
    renderWithProviders(
      <GuildList
        guilds={[
          ...GUILDS,
          {
            ...guild('300', 'Escouade Delta', true),
            access: 'delegate',
            modules: ['TICKETS', 'TD2'],
          },
        ]}
      />,
    );

    const delegated = await screen.findByRole('region', { name: 'Accès délégués 1 serveur' });
    const card = within(delegated).getByRole('link', { name: 'Configurer Escouade Delta' });
    expect(card.getAttribute('href')).toBe('/dashboard/300/tickets');
    expect(card.textContent).toContain('Tickets, The Division 2');
    // Les serveurs qu'on gère restent dans leur groupe
    expect(screen.getByRole('region', { name: 'Avec PhenixMG 2 serveurs' })).toBeTruthy();
  });

  it('cache un groupe vide', async () => {
    renderWithProviders(<GuildList guilds={GUILDS} search="jeudi" />);

    expect(await screen.findByRole('region', { name: /Avec PhenixMG/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /Sans PhenixMG/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dit quand la recherche ne trouve rien', async () => {
    renderWithProviders(<GuildList guilds={GUILDS} search=" Inconnu " />);

    expect((await screen.findByRole('status')).textContent).toBe(
      'Aucun serveur ne correspond à «\u00a0Inconnu\u00a0».',
    );
    expect(screen.queryByRole('region')).toBeNull();
  });
});
