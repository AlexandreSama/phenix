import type { ComponentProps, ReactNode } from 'react';

type SwitchProps = Omit<ComponentProps<'input'>, 'type'> & {
  id: string;
  label: string;
  hint?: ReactNode;
};

/**
 * Un interrupteur : une vraie case à cocher (clavier, lecteurs d'écran, react-hook-form),
 * dessinée en glissière. Reçoit tel quel le résultat de register().
 */
export function Switch({ id, label, hint, ...input }: SwitchProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-6">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-100">{label}</span>
        {hint && <span className="text-[13px] leading-relaxed text-stone-400">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" {...input} />
        <span
          aria-hidden="true"
          className="h-6 w-11 rounded-full bg-white/15 transition peer-checked:bg-flame peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-stone-100 shadow-sm transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
