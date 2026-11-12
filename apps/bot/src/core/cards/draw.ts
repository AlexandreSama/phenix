import type { SKRSContext2D } from '@napi-rs/canvas';

const ELLIPSIS = '…';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemesOf(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * Raccourcit `text` avec « … » pour tenir dans `maxWidth` : plus long préfixe de graphèmes + « … »
 * qui tient, trouvé par dichotomie (O(log n) mesures, au lieu d'une par graphème).
 */
export function fitText(
  ctx: Pick<SKRSContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
): string {
  if (text === '' || ctx.measureText(text).width <= maxWidth) return text;
  // ends[i] : fin (en unités UTF-16) du graphème i ; un préfixe de n graphèmes = text.slice(0, ends[n - 1])
  const ends = Array.from(segmenter.segment(text), (part) => part.index + part.segment.length);
  const candidate = (length: number) =>
    text.slice(0, length === 0 ? 0 : ends[length - 1]) + ELLIPSIS;
  // Invariant : le préfixe de `fits` graphèmes tient (-1 : aucun connu), celui de `tooLong` non.
  // Comme avant, le texte entier suivi de « … » n'est jamais proposé.
  let fits = -1;
  let tooLong = ends.length;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (ctx.measureText(candidate(middle)).width <= maxWidth) fits = middle;
    else tooLong = middle;
  }
  return fits < 0 ? '' : candidate(fits);
}

/** Limite de Discord pour le texte alternatif d'une pièce jointe. */
export const ALT_TEXT_MAX = 1024;

/**
 * Texte alternatif `build(name)` raccourci à ALT_TEXT_MAX : c'est `name` (qui figure une seule fois
 * dans la phrase) qui perd des graphèmes entiers, en une passe, jamais le reste de la phrase.
 */
export function fitAltText(build: (name: string) => string, name: string): string {
  const full = build(name);
  if (full.length <= ALT_TEXT_MAX) return full;
  let budget = ALT_TEXT_MAX - build('').length;
  let end = 0;
  // Le découpage est paresseux : on s'arrête au premier graphème qui ne tient plus
  for (const { segment } of segmenter.segment(name)) {
    if (segment.length > budget) break;
    budget -= segment.length;
    end += segment.length;
  }
  return build(name.slice(0, end));
}

/**
 * Texte à dessiner : l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')` ne fait que
 * 2,25 px en Inter 16 px ; on dessine l'espace insécable (U+00A0), deux fois plus large.
 */
export function cardText(text: string): string {
  return text.replaceAll('\u202f', '\u00a0');
}

/** Contrôles (Cc) et marques ou isolats de direction bidirectionnelle. */
const UNSAFE_CHARACTERS = /[\p{Cc}\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/gu;

/** Nom venu d'ailleurs (pseudo, serveur, spécialisation) sans contrôles ni marques de direction. */
export function sanitizeLabel(text: string): string {
  return text.replace(UNSAFE_CHARACTERS, '');
}

/** Première lettre du pseudo en majuscule, par graphème ; vide → « ? ». */
export function initialOf(name: string): string {
  const first = graphemesOf(name.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}
