import type { CasePage } from '@phenix/shared';
import type { ReactNode } from 'react';
import { CaseRow } from './case-row';

/** Les lignes d'une page de sanctions, ou de quoi comprendre pourquoi il n'y en a pas. */
export function CaseList({
  guildId,
  data,
  stale,
  empty,
}: {
  guildId: string;
  data: CasePage;
  /** Les données précédentes, affichées le temps que la page suivante arrive */
  stale: boolean;
  /** Ce qu'on montre quand il n'y a aucune sanction à lister */
  empty: ReactNode;
}) {
  if (data.items.length === 0) return <>{empty}</>;
  return (
    <ul
      aria-label="Sanctions"
      className={`flex flex-col divide-y divide-white/6 rounded-2xl border border-white/8 bg-surface transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      {data.items.map((sanction) => (
        <CaseRow key={sanction.number} guildId={guildId} sanction={sanction} />
      ))}
    </ul>
  );
}
