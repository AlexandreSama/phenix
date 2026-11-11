import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  /** Le bouton qui sort de l'état vide : créer, régler… */
  action?: ReactNode;
}

/** Une liste vide : ce qui manque, et comment le remplir. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-flame/12 text-flame">
        <Icon name={icon} className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
        {children && <p className="text-sm text-pretty text-stone-400">{children}</p>}
      </div>
      {action}
    </div>
  );
}
