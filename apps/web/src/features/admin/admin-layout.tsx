import { Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';

function Tab({ to, children }: { to: '/admin' | '/admin/signalements'; children: ReactNode }) {
    return (
        <Link
            to={to}
            activeOptions={{ exact: true, includeSearch: false }}
            className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-semibold whitespace-nowrap sm:px-4 text-stone-400 hover:text-white"
            activeProps={{ className: 'border-flame! text-white!' }}
        >
            {children}
        </Link>
    );
}

/** La page des propriétaires du bot : ce qui vaut pour tous les serveurs à la fois. */
export function AdminLayout() {
    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold text-white">Administration</h1>
                <p className="text-sm text-stone-400">
                    Réservé aux propriétaires du bot. Tout ce qui change ici vaut pour tous les serveurs.
                </p>
            </div>
            <nav aria-label="Administration" className="flex overflow-x-auto border-b border-brown">
                <Tab to="/admin">Catalogue TD2</Tab>
                <Tab to="/admin/signalements">Signalements</Tab>
            </nav>
            <Outlet />
        </section>
    );
}