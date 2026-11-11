import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { GuildIcon } from '../../components/guild-icon';
import { Icon, type IconName } from '../../components/icon';
import {
  sideAsideClass,
  sideGridClass,
  sideLayoutClass,
  sideNavClass,
  sideTabActiveClass,
  sideTabClass,
  sideTabIconClass,
  useActiveTabInView,
} from '../../components/ui/side-nav';
import { guildsQuery } from './api';

type GuildTab =
  | '/dashboard/$guildId'
  | '/dashboard/$guildId/niveaux'
  | '/dashboard/$guildId/roles'
  | '/dashboard/$guildId/tickets'
  | '/dashboard/$guildId/giveaways'
  | '/dashboard/$guildId/td2';

const TABS: { to: GuildTab; label: string; short?: string; icon: IconName; exact?: boolean }[] = [
  { to: '/dashboard/$guildId', label: 'Général', icon: 'sliders', exact: true },
  { to: '/dashboard/$guildId/niveaux', label: 'Niveaux', icon: 'chart' },
  { to: '/dashboard/$guildId/roles', label: 'Rôles', icon: 'tag' },
  { to: '/dashboard/$guildId/tickets', label: 'Tickets', icon: 'ticket' },
  { to: '/dashboard/$guildId/giveaways', label: 'Giveaways', icon: 'gift' },
  { to: '/dashboard/$guildId/td2', label: 'The Division 2', short: 'TD2', icon: 'crosshair' },
];

/** Un onglet ; le Link actif reçoit aria-current="page" et data-status="active". */
function Tab({ tab, guildId }: { tab: (typeof TABS)[number]; guildId: string }) {
  return (
    <Link
      to={tab.to}
      params={{ guildId }}
      activeOptions={{ exact: tab.exact }}
      className={sideTabClass}
      activeProps={{ className: sideTabActiveClass }}
    >
      <Icon name={tab.icon} className={sideTabIconClass} />
      {tab.short ? (
        <>
          <span className="lg:hidden">{tab.short}</span>
          <span className="max-lg:hidden">{tab.label}</span>
        </>
      ) : (
        tab.label
      )}
    </Link>
  );
}

/** Le cadre des pages d'un serveur : son nom, la navigation entre réglages, puis la page. */
export function GuildLayout() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const { data: guilds } = useQuery(guildsQuery);
  const guild = guilds?.find((entry) => entry.id === guildId);
  const nav = useActiveTabInView();

  return (
    <div className={sideLayoutClass}>
      <div className={sideGridClass}>
        <aside className={sideAsideClass}>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
          >
            <Icon name="arrowLeft" className="size-4" />
            Tes serveurs
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <GuildIcon
              name={guild?.name ?? '?'}
              iconUrl={guild?.iconUrl ?? null}
              className="size-12"
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold tracking-widest text-flame uppercase">
                Tableau de bord
              </span>
              <h1 className="line-clamp-2 font-display text-xl leading-tight font-semibold text-balance text-white">
                {guild?.name ?? 'Serveur'}
              </h1>
            </div>
          </div>
          <nav ref={nav} aria-label="Réglages du serveur" className={sideNavClass}>
            {TABS.map((tab) => (
              <Tab key={tab.to} tab={tab} guildId={guildId} />
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
