/** Les filtres d'une liste (« En cours » / « Terminés ») : un groupe de liens en pastilles. */
export const segmentedClass = 'inline-flex gap-1 rounded-xl border border-white/10 bg-surface p-1';
export const segmentClass =
  'inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-medium text-stone-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-gold';
/** Ajouté par le <Link> actif ; les « ! » passent devant les classes de base */
export const segmentActiveClass = 'bg-white/10! text-white!';

/** Les liens « Précédente » / « Suivante » ; grisés au bout de la liste. */
export const pagerLinkClass = (disabled: boolean) =>
  `inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3.5 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:text-white ${
    disabled ? 'pointer-events-none opacity-40' : ''
  }`;
