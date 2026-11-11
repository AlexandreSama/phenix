import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * La navigation des pages à colonne (un serveur, l'administration) :
 * sur téléphone, des onglets soulignés qui défilent ; sur ordinateur, une liste à gauche.
 */
export const sideLayoutClass = 'mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10';
export const sideGridClass = 'grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10';
export const sideAsideClass = 'flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:self-start';
export const sideNavClass =
  '-mx-4 flex gap-1 overflow-x-auto border-b border-white/8 px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:border-b-0 lg:px-0';
export const sideTabClass =
  'group flex shrink-0 items-center gap-2.5 border-b-2 border-transparent px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-400 transition hover:text-white lg:rounded-lg lg:border-b-0 lg:py-2.5 lg:hover:bg-white/4';
/** Ajouté par le <Link> actif ; les « ! » passent devant les classes de base */
export const sideTabActiveClass = 'border-flame! text-white! lg:bg-white/8!';
/** L'icône d'un onglet : orange sur l'onglet actif (data-status="active" posé par le Link) */
export const sideTabIconClass =
  'size-4.5 text-stone-500 transition group-hover:text-stone-300 group-data-[status=active]:text-flame';

/**
 * Sur téléphone, l'onglet actif peut être hors de la barre : à chaque changement de page,
 * on la fait défiler jusqu'à lui. Renvoie la ref à poser sur le <nav>.
 */
export function useActiveTabInView() {
  const nav = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  return nav;
}
