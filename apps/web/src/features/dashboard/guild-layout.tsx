import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { GuildIcon } from '../../components/guild-icon';
import { guildsQuery } from './api';

type GuildTab = '/dashboard/$guildId' | '/dashboard/$guildId/niveaux' | '/dashboard/$guildId/roles';

/** Un onglet ; le Link marque l'onglet actif (classes + aria-current="page"). */
function Tab({ to, exact, children }: { to: GuildTab; exact?: boolean; children: ReactNode }) {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  return (
    <Link
      to={to}
      params={{ guildId }}
      activeOptions={{ exact }}
      className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-semibold text-stone-400 hover:text-white"
      activeProps={{ className: 'border-flame! text-white!' }}
    >
      {children}
    </Link>
  );
}

/** En-tête commun aux pages d'un serveur : son nom et les onglets de réglages. */
export function GuildLayout() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const { data: guilds } = useQuery(guildsQuery);
  const guild = guilds?.find((entry) => entry.id === guildId);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link to="/dashboard" className="text-sm text-stone-400 hover:text-white">
          ← Tes serveurs
        </Link>
        <div className="flex items-center gap-3">
          <GuildIcon
            name={guild?.name ?? '?'}
            iconUrl={guild?.iconUrl ?? null}
            className="size-10"
          />
          <h1 className="text-2xl font-bold text-white">{guild?.name ?? 'Serveur'}</h1>
        </div>
        <nav aria-label="Réglages du serveur" className="flex gap-1 border-b border-brown">
          <Tab to="/dashboard/$guildId" exact>
            Général
          </Tab>
          <Tab to="/dashboard/$guildId/niveaux">Niveaux</Tab>
          <Tab to="/dashboard/$guildId/roles">Rôles</Tab>
        </nav>
      </div>
      <Outlet />
    </section>
  );
}
