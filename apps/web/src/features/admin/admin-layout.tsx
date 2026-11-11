import { Link, Outlet } from '@tanstack/react-router';
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

const TABS: {
  to: '/admin' | '/admin/signalements' | '/admin/forum' | '/admin/metriques';
  label: string;
  icon: IconName;
}[] = [
  { to: '/admin', label: 'Catalogue TD2', icon: 'crosshair' },
  { to: '/admin/signalements', label: 'Signalements', icon: 'flag' },
  { to: '/admin/forum', label: 'Forum', icon: 'forum' },
  { to: '/admin/metriques', label: 'Métriques', icon: 'pulse' },
];

/** La page des propriétaires du bot : ce qui vaut pour tous les serveurs à la fois. */
export function AdminLayout() {
  const nav = useActiveTabInView();

  return (
    <div className={sideLayoutClass}>
      <div className={sideGridClass}>
        <aside className={sideAsideClass}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-flame/12 text-flame">
              <Icon name="shield" className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold tracking-widest text-flame uppercase">
                Propriétaires du bot
              </span>
              <h1 className="font-display text-xl leading-tight font-semibold text-white">
                Administration
              </h1>
            </div>
          </div>
          <p className="text-sm text-stone-400">
            Tout ce qui change ici vaut pour tous les serveurs à la fois.
          </p>
          <nav ref={nav} aria-label="Administration" className={sideNavClass}>
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: true, includeSearch: false }}
                className={sideTabClass}
                activeProps={{ className: sideTabActiveClass }}
              >
                <Icon name={tab.icon} className={sideTabIconClass} />
                {tab.label}
              </Link>
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
