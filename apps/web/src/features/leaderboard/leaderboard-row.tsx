import { levelProgress, type LeaderboardEntry } from '@phenix/shared';
import { ProgressBar } from '../../components/ui/progress-bar';

/** Couleurs du podium : or, argent, braise. */
const PODIUM: Record<number, { row: string; rank: string }> = {
  1: { row: 'border-gold bg-gold/10', rank: 'text-gold' },
  2: { row: 'border-stone-400/60 bg-stone-400/5', rank: 'text-stone-200' },
  3: { row: 'border-ember bg-ember/10', rank: 'text-orange' },
};

const formatNumber = (value: number) => value.toLocaleString('fr-FR');

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="size-10 shrink-0 rounded-full" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brown font-bold">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const progress = levelProgress(entry.xp);
  const podium = PODIUM[entry.rank];

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 sm:gap-4 sm:px-4 ${podium?.row ?? 'border-brown bg-brown/20'}`}
    >
      <span
        className={`w-8 shrink-0 text-center text-lg font-bold tabular-nums ${podium?.rank ?? 'text-stone-400'}`}
      >
        {entry.rank}
      </span>
      <Avatar url={entry.avatarUrl} name={entry.displayName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-white">{entry.displayName}</span>
          <span className="shrink-0 text-sm text-stone-300 tabular-nums">
            {formatNumber(entry.xp)} XP
          </span>
        </div>
        <ProgressBar
          ratio={progress.ratio}
          label={`Niveau ${progress.level} : ${formatNumber(progress.current)} sur ${formatNumber(progress.needed)} XP`}
          className="mt-2"
        />
      </div>
      <div className="flex w-12 shrink-0 flex-col items-center leading-none">
        <span className="text-[10px] tracking-wide text-stone-400 uppercase">Niveau</span>
        <span className="text-xl font-bold text-gold tabular-nums">{entry.level}</span>
      </div>
    </li>
  );
}
