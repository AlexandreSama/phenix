const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  j: 86_400_000,
  d: 86_400_000,
} as const;

type Unit = keyof typeof UNIT_MS;

const DURATION_PATTERN = /^(?:\d+[smhjd])+$/;

/**
 * Lit une durée saisie par un modérateur : « 10m », « 2h », « 7j », « 1j12h ».
 * s = secondes, m = minutes, h = heures, j (ou d) = jours. Renvoie des millisecondes, ou null.
 */
export function parseDuration(input: string): number | null {
  const text = input.toLowerCase().replaceAll(/\s+/g, '');
  if (!DURATION_PATTERN.test(text)) return null;

  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([smhjd])/g)) {
    total += Number(amount) * UNIT_MS[unit as Unit];
  }
  return total > 0 ? total : null;
}

export const DAY_MS = UNIT_MS.j;
