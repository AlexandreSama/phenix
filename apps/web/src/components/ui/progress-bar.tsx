interface ProgressBarProps {
  /** Avancement entre 0 et 1 */
  ratio: number;
  /** Texte lu par les lecteurs d'écran, ex. « 340 sur 520 XP » */
  label: string;
  className?: string;
}

/** Barre de progression aux couleurs du logo, de la flamme à l'or. */
export function ProgressBar({ ratio, label, className = '' }: ProgressBarProps) {
  const percent = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`h-2 overflow-hidden rounded-full bg-brown ${className}`}
    >
      <div
        className="h-full rounded-full bg-linear-to-r from-flame to-gold"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
