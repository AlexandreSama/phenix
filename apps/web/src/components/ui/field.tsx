import type { ReactNode } from 'react';

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/** Un champ de formulaire : libellé, aide et message d'erreur reliés au contrôle. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-stone-100">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] leading-relaxed text-stone-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Champ texte, nombre, date ou liste. 16 px sur téléphone : en dessous, iOS zoome à la saisie.
 * `field-control` donne aux <select> leur flèche (index.css).
 */
export const inputClass =
  'field-control min-h-11 w-full rounded-lg border border-white/12 bg-ink px-3.5 py-2 text-base text-stone-100 transition placeholder:text-stone-500 hover:border-white/20 focus:border-flame/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-flame/25 disabled:opacity-50 sm:text-[15px]';
