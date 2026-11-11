import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Texte foncé sur l'orange : contraste suffisant pour être lu par tous
  primary: 'bg-flame text-ink hover:bg-orange',
  ghost: 'border border-brown text-stone-200 hover:border-ember hover:text-white',
};

const SIZES: Record<Size, string> = {
  md: 'rounded-lg px-4 py-2 text-sm',
  // Les appels à l'action de la page d'accueil
  lg: 'min-h-12 rounded-xl px-6 text-base',
};

/** Classes d'un bouton, réutilisables sur un lien <a> ou un <Link>. */
export function buttonClass(variant: Variant = 'primary', extra = '', size: Size = 'md'): string {
  return `inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
