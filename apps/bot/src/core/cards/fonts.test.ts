import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import {
  CARD_FONT_FAMILIES,
  CARD_FONT_FILES,
  CARD_FONT_STACKS,
  cardFontStack,
  registerCardFonts,
  type CardFontRole,
} from './fonts.js';

const WEIGHTS = [400, 500, 600, 700] as const;
const SAMPLE = 'Élite à l’arrêt';
/** Un fichier du sous-ensemble latin (pas latin-ext). */
const isLatin = (file: string) => /-latin-\d+-normal/.test(file);

/** Rendu de SAMPLE : quantité d'encre (pixels non transparents) et empreinte des pixels. */
function renderOf(family: string, weight: number): { ink: number; hash: string } {
  const canvas = createCanvas(400, 80);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.font = `${weight} 40px "${family}"`;
  ctx.fillText(SAMPLE, 10, 55);
  const { data } = ctx.getImageData(0, 0, 400, 80);
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) ink += 1;
  const hash = createHash('sha256').update(data).digest('hex');
  return { ink, hash };
}

describe('CARD_FONT_FAMILIES', () => {
  it('nomme les trois familles', () => {
    expect(CARD_FONT_FAMILIES).toEqual({
      title: 'Space Grotesk',
      body: 'Inter',
      mono: 'JetBrains Mono',
    });
  });
});

describe('registerCardFonts', () => {
  it('enregistre les trois familles auprès de GlobalFonts', () => {
    registerCardFonts();
    const names = GlobalFonts.families.map((f) => f.family);
    for (const family of Object.values(CARD_FONT_FAMILIES)) {
      expect(names).toContain(family);
    }
  });

  it('est idempotent : un enregistrement par fichier de CARD_FONT_FILES au premier appel, aucun au second', async () => {
    // GlobalFonts dédoublonne lui-même : seul un espion sur registerFromPath peut échouer.
    vi.resetModules();
    const { GlobalFonts: fresh } = await import('@napi-rs/canvas');
    const spy = vi.spyOn(fresh, 'registerFromPath');
    try {
      const mod = await import('./fonts.js');
      const expected = mod.CARD_FONT_FILES.length;
      expect(expected).toBeGreaterThan(0);
      mod.registerCardFonts();
      expect(spy).toHaveBeenCalledTimes(expected);
      mod.registerCardFonts();
      expect(spy).toHaveBeenCalledTimes(expected);
    } finally {
      spy.mockRestore();
      vi.resetModules();
    }
  });

  it('enregistre chaque fichier sous son alias, tous les fichiers latin d’abord', async () => {
    // Chaque fichier est aussi enregistré sous son nom interne (« Inter »…) : pour une graisse donnée,
    // le premier enregistré gagne. Un sous-ensemble étendu enregistré avant le latin prendrait sa place.
    vi.resetModules();
    const { GlobalFonts: fresh } = await import('@napi-rs/canvas');
    const spy = vi.spyOn(fresh, 'registerFromPath');
    try {
      const mod = await import('./fonts.js');
      mod.registerCardFonts();
      const calls = spy.mock.calls.map(([path, alias]) => ({ file: basename(path), alias }));
      expect(calls).toEqual(
        mod.CARD_FONT_FILES.map(({ slug, subset, weight, alias }) => ({
          file: `${slug}-${subset}-${weight}-normal.woff2`,
          alias,
        })),
      );
      const lastLatin = calls.findLastIndex(({ file }) => isLatin(file));
      const firstOther = calls.findIndex(({ file }) => !isLatin(file));
      expect(firstOther).toBeGreaterThan(lastLatin);
    } finally {
      spy.mockRestore();
      vi.resetModules();
    }
  });

  // Mise en garde : `GlobalFonts.families` inclut les polices système ; vérifier seulement
  // `toContain(famille)` ne prouve rien. On contrôle donc les graisses déclarées et le rendu.
  describe.each(Object.values(CARD_FONT_FAMILIES))('famille %s', (family) => {
    it('déclare les graisses 400, 500, 600 et 700', () => {
      registerCardFonts();
      const entry = GlobalFonts.families.find((f) => f.family === family);
      expect(entry).toBeDefined();
      const weights = entry!.styles.map((st) => st.weight);
      for (const w of WEIGHTS) expect(weights).toContain(w);
    });

    it.each(WEIGHTS)(
      'rend « Élite à l’arrêt » autrement qu’une famille inexistante en graisse %i',
      (weight) => {
        registerCardFonts();
        const real = renderOf(family, weight);
        const fallback = renderOf('Police Inexistante XYZ', weight);
        expect(real.ink).toBeGreaterThan(0);
        expect(real.hash).not.toBe(fallback.hash);
        expect(real.ink).not.toBe(fallback.ink);
      },
    );
  });

  it('utilise réellement la police : une famille inconnue donne un rendu différent', () => {
    registerCardFonts();
    const real = renderOf(CARD_FONT_FAMILIES.title, 700);
    const fallback = renderOf('Police Inexistante XYZ', 700);
    expect(real.hash).not.toBe(fallback.hash);
  });
});

describe('CARD_FONT_FILES', () => {
  const SUBSETS: Record<string, string[]> = {
    inter: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    'space-grotesk': ['latin', 'latin-ext'],
    'jetbrains-mono': ['latin', 'latin-ext', 'cyrillic', 'greek'],
  };

  it('latin et latin-ext pour les trois familles, cyrillic et greek pour Inter et JetBrains Mono, en 400 à 700 ; rien de plus', () => {
    const expected = Object.entries(SUBSETS).flatMap(([slug, subsets]) =>
      subsets.flatMap((subset) => WEIGHTS.map((weight) => `${slug}-${subset}-${weight}`)),
    );
    const listed = CARD_FONT_FILES.map(({ slug, subset, weight }) => `${slug}-${subset}-${weight}`);
    expect(listed.toSorted()).toEqual(expected.toSorted());
  });

  it('le latin garde le nom de CARD_FONT_FAMILIES ; chaque autre sous-ensemble a son propre alias', () => {
    const latin = CARD_FONT_FILES.filter(({ subset }) => subset === 'latin');
    expect(new Set(latin.map(({ alias }) => alias))).toEqual(
      new Set(Object.values(CARD_FONT_FAMILIES)),
    );
    // un alias = une famille et un sous-ensemble, partagé par ses quatre graisses
    const byAlias = new Map<string, Set<string>>();
    for (const { alias, slug, subset } of CARD_FONT_FILES) {
      byAlias.set(alias, (byAlias.get(alias) ?? new Set()).add(`${slug}/${subset}`));
    }
    for (const sources of byAlias.values()) expect(sources.size).toBe(1);
    expect(byAlias.size).toBe(CARD_FONT_FILES.length / WEIGHTS.length);
  });
});

describe('CARD_FONT_STACKS et cardFontStack', () => {
  it('chaque pile commence par la famille du rôle, puis les sous-ensembles étendus', () => {
    expect(CARD_FONT_STACKS).toEqual({
      // Space Grotesk n'a ni cyrillique ni grec : ceux d'Inter prennent le relais
      title: ['Space Grotesk', 'Space Grotesk Latin Ext', 'Inter Cyrillic', 'Inter Greek'],
      body: ['Inter', 'Inter Latin Ext', 'Inter Cyrillic', 'Inter Greek'],
      mono: [
        'JetBrains Mono',
        'JetBrains Mono Latin Ext',
        'JetBrains Mono Cyrillic',
        'JetBrains Mono Greek',
      ],
    });
  });

  it('chaque famille d’une pile est un alias enregistré', () => {
    const aliases = new Set(CARD_FONT_FILES.map(({ alias }) => alias));
    for (const stack of Object.values(CARD_FONT_STACKS)) {
      for (const family of stack) expect(aliases).toContain(family);
    }
  });

  it('écrit la police CSS : graisse, taille, puis les familles entre guillemets', () => {
    expect(cardFontStack('title', 700, 44)).toBe(
      '700 44px "Space Grotesk", "Space Grotesk Latin Ext", "Inter Cyrillic", "Inter Greek"',
    );
    expect(cardFontStack('body', 400, 15)).toBe(
      '400 15px "Inter", "Inter Latin Ext", "Inter Cyrillic", "Inter Greek"',
    );
  });
});

/** Rendu d'un texte dans une police CSS : encre, empreinte des pixels et largeur mesurée. */
function renderText(font: string, text: string) {
  const canvas = createCanvas(400, 80);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.font = font;
  ctx.fillText(text, 10, 55);
  const { data } = ctx.getImageData(0, 0, 400, 80);
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) ink += 1;
  const hash = createHash('sha256').update(data).digest('hex');
  return { ink, hash, width: ctx.measureText(text).width };
}

// Pas de famille système comme référence (Inter peut être installée sur la machine) : on compare à
// un alias inexistant, et à la famille latine seule (le nom du rôle), qui n'a pas ces lettres.
describe.each(Object.keys(CARD_FONT_FAMILIES) as CardFontRole[])(
  'pile %s : noms hors latin',
  (role) => {
    it.each([
      ['Łukasz', 400],
      ['Łukasz', 700],
      ['Дмитрий', 400],
      ['Дмитрий', 700],
      ['Ελένη', 400],
      ['Ελένη', 700],
    ] as const)('« %s » en %i : dessiné et mesuré avec le sous-ensemble étendu', (word, weight) => {
      registerCardFonts();
      const stack = renderText(cardFontStack(role, weight, 40), word);
      const missing = renderText(`${weight} 40px "Police Inexistante XYZ"`, word);
      const latinOnly = renderText(`${weight} 40px "${CARD_FONT_FAMILIES[role]}"`, word);
      expect(stack.ink).toBeGreaterThan(0);
      expect(stack.hash).not.toBe(missing.hash);
      expect(stack.hash).not.toBe(latinOnly.hash);
      // la mesure (fitText, colonnes) suit la police réellement dessinée
      expect(stack.width).not.toBe(missing.width);
    });
  },
);

async function loadWith(registerFromPath: (path: string, alias?: string) => unknown) {
  vi.resetModules();
  vi.doMock('@napi-rs/canvas', () => ({ GlobalFonts: { registerFromPath, families: [] } }));
  return import('./fonts.js');
}
const cleanup = () => {
  vi.doUnmock('@napi-rs/canvas');
  vi.resetModules();
};

describe('registerCardFonts : échec', () => {
  it('lève une erreur nommant le fichier si registerFromPath renvoie null', async () => {
    const paths: string[] = [];
    try {
      const mod = await loadWith((path) => {
        paths.push(path);
        return null;
      });
      // le chemin n'est connu qu'après l'appel : on lit le message d'abord, on le compare ensuite
      let message = '';
      try {
        mod.registerCardFonts();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(paths.length).toBeGreaterThan(0);
      expect(basename(paths[0]!)).toMatch(/\.woff2$/);
      expect(message).toContain(basename(paths[0]!));
    } finally {
      cleanup();
    }
  });

  it('(a) lève aussi au second appel : un échec ne laisse pas de drapeau « déjà fait »', async () => {
    try {
      const mod = await loadWith(() => null);
      expect(() => mod.registerCardFonts()).toThrowError(/\.woff2/);
      expect(() => mod.registerCardFonts()).toThrowError(/\.woff2/);
    } finally {
      cleanup();
    }
  });

  it('(b) 11 fichiers réussis puis le 12e à null : lève et nomme le fichier fautif', async () => {
    const paths: string[] = [];
    try {
      const mod = await loadWith((path) => {
        paths.push(path);
        return paths.length < 12 ? true : null;
      });
      let message = '';
      try {
        mod.registerCardFonts();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(paths).toHaveLength(12);
      expect(message).toContain(basename(paths[11]!));
    } finally {
      cleanup();
    }
  });
});
