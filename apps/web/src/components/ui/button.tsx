import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  // Texte foncé sur l'orange : contraste suffisant pour être lu par tous
  primary: 'bg-flame text-ink hover:bg-orange',
  ghost: 'border border-brown text-stone-200 hover:border-ember hover:text-white',
};

/** Classes d'un bouton, réutilisables sur un lien <a> ou un <Link>. */
export function buttonClass(variant: Variant = 'primary', extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
