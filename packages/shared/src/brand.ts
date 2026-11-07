/** Couleurs du logo PhenixMG : la seule source pour le bot et le site. */
export const BRAND = {
  /** Orange flamme, la couleur principale */
  flame: '#F65308',
  orange: '#F17600',
  gold: '#F5AA04',
  yellow: '#FFC500',
  /** Orange brûlé, les ombres du phénix */
  ember: '#BA4B04',
  brown: '#50260B',
  /** Contour du logo, presque noir */
  ink: '#1D110C',
} as const;

export type BrandColor = keyof typeof BRAND;
