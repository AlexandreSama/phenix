import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { GuildIcon } from '../../components/guild-icon';
import { guildsQuery } from './api';

type GuildTab =
  | '/dashboard/$guildId'
  | '/dashboard/$guildId/niveaux'
  | '/dashboard/$guildId/roles'
  | '/dashboard/$guildId/tickets'
  | '/dashboard/$guildId/giveaways'
  | '/dashboard/$guildId/td2';

/** Un onglet ; le Link marque l'onglet actif (classes + aria-current="page"). */
function Tab({ to, exact, children }: { to: GuildTab; exact?: boolean; children: ReactNode }) {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  return (
    <Link
      to={to}
      params={{ guildId }}
      activeOptions={{ exact }}
      className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-semibold whitespace-nowrap sm:px-4 text-stone-400 hover:text-white"
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tabs = useRef<HTMLElement>(null);

  // Sur téléphone, l'onglet actif peut être hors de la barre : on la fait défiler jusqu'à lui
  useEffect(() => {
    tabs.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

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
        {/* Sur téléphone, les onglets défilent dans leur barre au lieu d'élargir la page */}
        <nav
          ref={tabs}
          aria-label="Réglages du serveur"
          className="flex gap-1 overflow-x-auto border-b border-brown [scrollbar-width:none]"
        >
          <Tab to="/dashboard/$guildId" exact>
            Général
          </Tab>
          <Tab to="/dashboard/$guildId/niveaux">Niveaux</Tab>
          <Tab to="/dashboard/$guildId/roles">Rôles</Tab>
          <Tab to="/dashboard/$guildId/tickets">Tickets</Tab>
          <Tab to="/dashboard/$guildId/giveaways">Giveaways</Tab>
          <Tab to="/dashboard/$guildId/td2">TD2</Tab>
        </nav>
      </div>
      <Outlet />
    </section>
  );
}
