import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useMatches, useParams } from '@tanstack/react-router';
import { GuildIcon } from '../../components/guild-icon';
import { Icon } from '../../components/icon';
import { buttonClass } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
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
import { canOpen, visibleTabs, type GuildTab } from './guild-tabs';
import { LoadError, PageSkeleton } from './query-state';

/** Un onglet ; le Link actif reçoit aria-current="page" et data-status="active". */
function Tab({ tab, guildId }: { tab: GuildTab; guildId: string }) {
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
  const guilds = useQuery(guildsQuery);
  const guild = guilds.data?.find((entry) => entry.id === guildId);
  // L'onglet de la page ouverte, déclaré par sa route (router.tsx)
  const required = useMatches({
    select: (matches) => matches.find((match) => match.staticData.module)?.staticData.module,
  });
  const nav = useActiveTabInView();
  const tabs = guild ? visibleTabs(guild) : [];

  let content = <Outlet />;
  if (guilds.error) {
    content = <LoadError error={guilds.error} onRetry={() => void guilds.refetch()} />;
  } else if (!guilds.data) {
    content = <PageSkeleton label="Chargement du serveur…" />;
  } else if (!guild) {
    content = (
      <EmptyState
        icon="lock"
        title="Tu n’as pas accès à ce serveur"
        action={
          <Link to="/dashboard" className={buttonClass('ghost', 'min-h-11')}>
            Voir tes serveurs
          </Link>
        }
      >
        Il faut « Gérer le serveur » sur Discord, ou qu’un de ses administrateurs t’ouvre des
        onglets depuis l’onglet Accès.
      </EmptyState>
    );
  } else if (required && !canOpen(guild, required)) {
    content = (
      <EmptyState
        icon="lock"
        title="Cet onglet ne t’est pas ouvert"
        action={
          tabs[0] && (
            <Link to={tabs[0].to} params={{ guildId }} className={buttonClass('ghost', 'min-h-11')}>
              Aller à l’onglet {tabs[0].label}
            </Link>
          )
        }
      >
        Un administrateur de {guild.name} t’a ouvert {tabs.length > 1 ? 'les onglets' : 'l’onglet'}{' '}
        {tabs.map((tab) => tab.label).join(', ')}. Pour le reste, demande-lui.
      </EmptyState>
    );
  }

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
                {guild?.access === 'delegate' ? 'Accès délégué' : 'Tableau de bord'}
              </span>
              <h1 className="line-clamp-2 font-display text-xl leading-tight font-semibold text-balance text-white">
                {guild?.name ?? 'Serveur'}
              </h1>
            </div>
          </div>
          {tabs.length > 0 && (
            <nav ref={nav} aria-label="Réglages du serveur" className={sideNavClass}>
              {tabs.map((tab) => (
                <Tab key={tab.to} tab={tab} guildId={guildId} />
              ))}
            </nav>
          )}
        </aside>
        <div className="min-w-0">{content}</div>
      </div>
    </div>
  );
}
