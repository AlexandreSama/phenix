import type { ReactNode } from 'react';
import { Icon } from '../../../components/icon';
import { pagerLinkClass } from '../list-controls';

interface PagerLinkProps {
  page: number;
  className: string;
  disabled: boolean;
  children: ReactNode;
}

/** « Précédente » et « Suivante » ; la page qui l'affiche sait construire ses liens. */
export function Pager({
  label,
  page,
  pageCount,
  link,
}: {
  label: string;
  page: number;
  pageCount: number;
  link: (props: PagerLinkProps) => ReactNode;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4">
      {link({
        page: page - 1,
        className: pagerLinkClass(page <= 1),
        disabled: page <= 1,
        children: (
          <>
            <Icon name="arrowLeft" className="size-4" />
            Précédente
          </>
        ),
      })}
      <span className="text-sm text-stone-400 tabular-nums">
        Page {page} / {pageCount}
      </span>
      {link({
        page: page + 1,
        className: pagerLinkClass(page >= pageCount),
        disabled: page >= pageCount,
        children: (
          <>
            Suivante
            <Icon name="arrowRight" className="size-4" />
          </>
        ),
      })}
    </nav>
  );
}
