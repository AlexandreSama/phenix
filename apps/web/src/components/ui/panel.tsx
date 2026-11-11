import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from '../icon';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Les boutons de la page, à droite du titre (en dessous sur téléphone) */
  actions?: ReactNode;
}

/** Le titre d'une page du tableau de bord ; le nom du serveur est le h1 au-dessus. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      {/* Le texte cède la place aux boutons : ils restent à droite tant qu'il y a la largeur */}
      <div className="flex max-w-2xl min-w-0 flex-[1_1_20rem] flex-col gap-1.5">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {description && <p className="text-pretty text-stone-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

interface PanelProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  /** À droite du titre : un badge, un lien */
  aside?: ReactNode;
  children: ReactNode;
  /** Sans marge intérieure : pour une liste qui va d'un bord à l'autre */
  flush?: boolean;
}

/** Un bloc de la page : un titre, ce qu'il règle, puis son contenu. */
export function Panel({ title, description, icon, aside, children, flush }: PanelProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-white/8 bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/6 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          {icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-flame/12 text-flame">
              <Icon name={icon} className="size-4.5" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id={titleId} className="font-display text-base font-semibold text-white">
              {title}
            </h3>
            {description && <p className="text-sm text-pretty text-stone-400">{description}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      <div className={flush ? '' : 'flex flex-col gap-6 p-5 sm:p-6'}>{children}</div>
    </section>
  );
}
