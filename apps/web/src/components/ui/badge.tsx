import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'gold' | 'flame' | 'muted';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-white/8 text-stone-300',
  gold: 'bg-gold/12 text-gold',
  // Orange éclairci : lisible sur son fond teinté (contraste 6:1)
  flame: 'bg-flame/15 text-[#ff8a4c]',
  muted: 'border border-white/10 text-stone-400',
};

interface BadgeProps {
  tone?: BadgeTone;
  /** Le point clignote : le bot travaille encore */
  pulse?: boolean;
  children: ReactNode;
}

/** Un état en un ou deux mots, précédé d'un point de sa couleur. */
export function Badge({ tone = 'neutral', pulse, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full bg-current ${pulse ? 'motion-safe:animate-pulse' : ''}`}
      />
      {children}
    </span>
  );
}
