import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { GlobalFonts } from '@napi-rs/canvas';

/** Familles de polices utilisées par les cartes. */
export const CARD_FONT_FAMILIES = {
  title: 'Space Grotesk',
  body: 'Inter',
  mono: 'JetBrains Mono',
} as const;

export type CardFontRole = keyof typeof CARD_FONT_FAMILIES;

/** Un fichier woff2 @fontsource et le nom sous lequel il est enregistré. */
export interface CardFontFile {
  alias: string;
  slug: string;
  subset: string;
  weight: number;
}

const FONT_WEIGHTS = [400, 500, 600, 700] as const;

type Subset = 'latin' | 'latin-ext' | 'cyrillic' | 'greek';
const EXTENDED_SUBSET_NAMES = {
  'latin-ext': 'Latin Ext',
  cyrillic: 'Cyrillic',
  greek: 'Greek',
} as const satisfies Record<Exclude<Subset, 'latin'>, string>;

/**
 * Les fichiers @fontsource sont des sous-ensembles d'une même famille. Enregistrés sous un même nom,
 * Skia ne fusionne PAS leurs glyphes : chaque sous-ensemble hors latin a donc son propre alias
 * (« Inter Cyrillic »…), et les cartes demandent une liste de familles (CARD_FONT_STACKS).
 */
const aliasOf = (family: string, subset: Subset) =>
  subset === 'latin' ? family : `${family} ${EXTENDED_SUBSET_NAMES[subset]}`;

/** Famille affichée → paquet @fontsource et sous-ensembles chargés en plus du latin. */
const FONT_SOURCES: readonly { family: string; slug: string; extended: readonly Subset[] }[] = [
  { family: CARD_FONT_FAMILIES.body, slug: 'inter', extended: ['latin-ext', 'cyrillic', 'greek'] },
  // Space Grotesk n'existe ni en cyrillique ni en grec
  { family: CARD_FONT_FAMILIES.title, slug: 'space-grotesk', extended: ['latin-ext'] },
  {
    family: CARD_FONT_FAMILIES.mono,
    slug: 'jetbrains-mono',
    extended: ['latin-ext', 'cyrillic', 'greek'],
  },
];

const filesOf = (slug: string, subset: Subset, alias: string): CardFontFile[] =>
  FONT_WEIGHTS.map((weight) => ({ alias, slug, subset, weight }));

/**
 * Les fichiers enregistrés, dans l'ordre. Tous les fichiers latin d'abord : chaque fichier est aussi
 * connu sous son nom interne (« Inter »…) et, pour une graisse, le premier enregistré l'emporte.
 */
export const CARD_FONT_FILES: readonly CardFontFile[] = [
  ...FONT_SOURCES.flatMap(({ family, slug }) => filesOf(slug, 'latin', family)),
  ...FONT_SOURCES.flatMap(({ family, slug, extended }) =>
    extended.flatMap((subset) => filesOf(slug, subset, aliasOf(family, subset))),
  ),
];

const { title, body, mono } = CARD_FONT_FAMILIES;
const ALL_SUBSETS: readonly Subset[] = ['latin', 'latin-ext', 'cyrillic', 'greek'];

/** Familles essayées dans l'ordre, lettre par lettre, pour chaque rôle. */
export const CARD_FONT_STACKS: Readonly<Record<CardFontRole, readonly string[]>> = {
  // le cyrillique et le grec d'Inter prennent le relais de Space Grotesk
  title: [
    aliasOf(title, 'latin'),
    aliasOf(title, 'latin-ext'),
    aliasOf(body, 'cyrillic'),
    aliasOf(body, 'greek'),
  ],
  body: ALL_SUBSETS.map((subset) => aliasOf(body, subset)),
  mono: ALL_SUBSETS.map((subset) => aliasOf(mono, subset)),
};

/** La police CSS d'un rôle, ex. `700 44px "Space Grotesk", "Space Grotesk Latin Ext", …`. */
export function cardFontStack(role: CardFontRole, weight: number, size: number): string {
  const families = CARD_FONT_STACKS[role].map((family) => `"${family}"`).join(', ');
  return `${weight} ${size}px ${families}`;
}

const require = createRequire(import.meta.url);
let registered = false;

/** Enregistre les fichiers woff2 de CARD_FONT_FILES auprès de GlobalFonts. Idempotent. */
export function registerCardFonts(): void {
  if (registered) return;
  for (const { alias, slug, subset, weight } of CARD_FONT_FILES) {
    const path = require.resolve(
      `@fontsource/${slug}/files/${slug}-${subset}-${weight}-normal.woff2`,
    );
    if (GlobalFonts.registerFromPath(path, alias) === null) {
      throw new Error(`Police de carte introuvable ou illisible : ${basename(path)}`);
    }
  }
  // Le drapeau n'est posé qu'après un succès complet : un échec n'est jamais mémorisé.
  registered = true;
}
