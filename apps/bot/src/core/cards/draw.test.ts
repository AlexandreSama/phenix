import type { SKRSContext2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { ALT_TEXT_MAX, cardText, fitAltText, fitText, initialOf, sanitizeLabel } from './draw.js';

/** Faux contexte : chaque unité UTF-16 mesure 10 de large. */
const ctx = {
  measureText: (t: string) =>
    ({ width: t.length * 10 }) as ReturnType<SKRSContext2D['measureText']>,
};
const width = (t: string) => ctx.measureText(t).width;

describe('fitText', () => {
  it('laisse inchangé un texte qui tient', () => {
    expect(fitText(ctx, 'Bonjour', 100)).toBe('Bonjour');
  });

  it('laisse inchangé un texte dont la largeur est exactement maxWidth', () => {
    expect(fitText(ctx, 'abcde', 50)).toBe('abcde');
  });

  it('coupe avec « … » un texte trop long d’un caractère', () => {
    const out = fitText(ctx, 'abcdef', 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toBe('abcdef');
    expect(width(out)).toBeLessThanOrEqual(50);
  });

  it('garde le plus de texte possible', () => {
    expect(fitText(ctx, 'abcdefghij', 50)).toBe('abcd…');
  });

  it('renvoie une chaîne vide pour un texte vide', () => {
    expect(fitText(ctx, '', 100)).toBe('');
  });

  it.each([0, 1, 5, 9])('termine avec maxWidth minuscule (%s)', (max) => {
    const out = fitText(ctx, 'abcdef', max);
    expect(['…', '']).toContain(out);
  });

  it('ne coupe pas une paire de substituts (😀)', () => {
    const out = fitText(ctx, 'ab😀cd', 40);
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(out).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(width(out)).toBeLessThanOrEqual(40);
  });

  it('ne coupe pas un emoji composé (👩‍🚀) en deux moitiés invalides', () => {
    const text = 'a👩‍🚀b👩‍🚀c';
    for (const max of [20, 30, 40, 50, 60, 70]) {
      const out = fitText(ctx, text, max);
      expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
      expect(out).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
      expect(width(out)).toBeLessThanOrEqual(max);
      const kept = out.replace(/…$/, '');
      expect(text.startsWith(kept)).toBe(true);
      // Jamais de joiner (ZWJ) orphelin en fin de texte conservé.
      expect(kept.endsWith('‍')).toBe(false);
    }
  });
});

describe('fitText : frontières', () => {
  it('maxWidth = largeur exacte de « … » → « … »', () => {
    expect(fitText(ctx, 'abcdef', 10)).toBe('…');
  });

  it('maxWidth = 20 → « a… »', () => {
    expect(fitText(ctx, 'abcdef', 20)).toBe('a…');
  });

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY])(
    'se termine sans lever (maxWidth = %s)',
    (max) => {
      expect(() => fitText(ctx, 'abcdef', max)).not.toThrow();
    },
  );

  describe('mesure non uniforme (W = 20, i = 5, autres 10)', () => {
    const uneven = {
      measureText: (t: string) =>
        ({
          width: [...t].reduce((sum, c) => sum + (c === 'W' ? 20 : c === 'i' ? 5 : 10), 0),
        }) as ReturnType<SKRSContext2D['measureText']>,
    };

    it.each([
      [60, 'WiW…'],
      [40, 'Wi…'],
      [30, 'W…'],
    ])('maxWidth %i → « %s » (plus long préfixe qui tient)', (max, expected) => {
      expect(fitText(uneven, 'WiWbcdefgh', max)).toBe(expected);
    });
  });
});

describe('fitText : graphèmes', () => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const corpus = ['👩‍🚀', '🇫🇷', '👍🏽', 'é', '👨‍👩‍👧‍👦'];
  const texts = [...corpus, corpus.join('x')];

  it.each(texts)('ne garde que des graphèmes complets (%s)', (text) => {
    const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
    const validPrefixes = new Set(graphemes.map((_, i) => graphemes.slice(0, i + 1).join('')));
    validPrefixes.add('');
    for (let max = 0; max <= width(text); max += 1) {
      const out = fitText(ctx, text, max);
      const kept = out.endsWith('…') && out !== text ? out.slice(0, -1) : out;
      expect(validPrefixes.has(kept), `maxWidth ${max} → « ${out} »`).toBe(true);
    }
  });
});

type Measurer = Pick<SKRSContext2D, 'measureText'>;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemesOf = (text: string) =>
  Array.from(graphemeSegmenter.segment(text), (part) => part.segment);

/** Définition de référence (l'ancienne, linéaire) : on retire un graphème à la fois depuis la fin. */
function naiveFitText(measurer: Measurer, text: string, maxWidth: number): string {
  if (text === '' || measurer.measureText(text).width <= maxWidth) return text;
  const graphemes = graphemesOf(text);
  for (let length = graphemes.length - 1; length >= 0; length -= 1) {
    const candidate = `${graphemes.slice(0, length).join('')}…`;
    if (measurer.measureText(candidate).width <= maxWidth) return candidate;
  }
  return '';
}

/** Faux contexte qui compte ses appels à measureText (10 par unité UTF-16). */
function countingCtx() {
  const counter = { calls: 0 };
  const measurer = {
    measureText: (t: string) => {
      counter.calls += 1;
      return { width: t.length * 10 } as ReturnType<SKRSContext2D['measureText']>;
    },
  };
  return { counter, measurer };
}

describe('fitText : coût (pseudo démesuré venu d’une API externe)', () => {
  it('sur 10 000 caractères, measureText est appelé au plus ~100 fois (pas une fois par caractère)', () => {
    const text = 'abcdefghij'.repeat(1000);
    const { counter, measurer } = countingCtx();
    const out = fitText(measurer, text, 5000);
    expect(counter.calls).toBeLessThanOrEqual(100);
    expect(out).toBe(naiveFitText(ctx, text, 5000));
    expect(out).toBe(`${'abcdefghij'.repeat(50).slice(0, 499)}…`);
  });

  it('sur 10 000 emojis composés, même borne et même résultat que la référence', () => {
    const text = '👩‍🚀'.repeat(10_000);
    const { counter, measurer } = countingCtx();
    const out = fitText(measurer, text, 1234);
    expect(counter.calls).toBeLessThanOrEqual(100);
    expect(out).toBe(naiveFitText(ctx, text, 1234));
  });
});

describe('fitText : même résultat que la définition de référence', () => {
  const uneven: Measurer = {
    measureText: (t: string) =>
      ({
        width: [...t].reduce((sum, c) => sum + (c === 'W' ? 20 : c === 'i' ? 5 : 10), 0),
      }) as ReturnType<SKRSContext2D['measureText']>,
  };
  const corpus = [
    'a',
    'abcdef',
    'WiWbcdefgh',
    'ab😀cd',
    'a👩‍🚀b👩‍🚀c',
    '🇫🇷👍🏽é👨‍👩‍👧‍👦xWiW',
    'Les Agents de la Division '.repeat(4),
  ];

  it.each(corpus)('« %s » : pour toute largeur, mesure uniforme et non uniforme', (text) => {
    for (const measurer of [ctx, uneven]) {
      const full = measurer.measureText(text).width;
      const widths = [-5, Number.NaN, Number.POSITIVE_INFINITY];
      for (let max = 0; max <= full + 10; max += 1) widths.push(max);
      for (const max of widths) {
        expect(fitText(measurer, text, max), `maxWidth ${max}`).toBe(
          naiveFitText(measurer, text, max),
        );
      }
    }
  });
});

/** Définition de référence (l'ancienne) : on retire un graphème du pseudo tant que c'est trop long. */
function naiveFitAltText(build: (name: string) => string, name: string): string {
  const graphemes = graphemesOf(name);
  while (build(graphemes.join('')).length > ALT_TEXT_MAX && graphemes.length > 0) graphemes.pop();
  return build(graphemes.join(''));
}

/** Phrase d'essai de fitAltText : le pseudo y figure une seule fois. */
const altSentence = (name: string) => `Carte de ${name} : niveau 24`;

describe('fitAltText', () => {
  const overhead = altSentence('').length;

  it('ALT_TEXT_MAX vaut 1 024 (limite de Discord)', () => {
    expect(ALT_TEXT_MAX).toBe(1024);
  });

  it('un pseudo court : la phrase entière, intacte', () => {
    expect(fitAltText(altSentence, 'Faye')).toBe('Carte de Faye : niveau 24');
  });

  it('exactement 1 024 caractères : intact', () => {
    const name = 'W'.repeat(ALT_TEXT_MAX - overhead);
    expect(fitAltText(altSentence, name)).toBe(altSentence(name));
  });

  it('1 025 caractères : le pseudo perd un caractère, la fin de la phrase reste', () => {
    const name = 'W'.repeat(ALT_TEXT_MAX + 1 - overhead);
    const out = fitAltText(altSentence, name);
    expect(out).toBe(altSentence(name.slice(0, -1)));
    expect(out).toHaveLength(ALT_TEXT_MAX);
  });

  it('ne coupe pas un emoji composé : on s’arrête au graphème entier qui précède', () => {
    // 11 unités UTF-16 par emoji : la limite tombe au milieu d'un graphème
    const name = '👨‍👩‍👧‍👦'.repeat(200);
    const out = fitAltText(altSentence, name);
    expect(out.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    const kept = out.slice('Carte de '.length, -' : niveau 24'.length);
    expect(name.startsWith(kept)).toBe(true);
    expect(graphemesOf(kept).every((g) => g === '👨‍👩‍👧‍👦')).toBe(true);
    // le plus long possible : un graphème de plus dépasserait
    expect(altSentence(`${kept}👨‍👩‍👧‍👦`).length).toBeGreaterThan(ALT_TEXT_MAX);
  });

  it.each([1000, 1007, 1013, 1100, 3000])(
    'même résultat que la référence (pseudo mixte de %i graphèmes)',
    (count) => {
      const pieces = ['a', '😀', '👩‍🚀', 'é', '🇫🇷'];
      const name = Array.from({ length: count }, (_, i) => pieces[i % pieces.length]).join('');
      expect(fitAltText(altSentence, name)).toBe(naiveFitAltText(altSentence, name));
    },
  );

  it('un pseudo de 100 000 caractères : ≤ 1 024, la fin de la phrase reste, en moins de 1 000 ms', () => {
    const start = performance.now();
    const out = fitAltText(altSentence, 'W'.repeat(100_000));
    const elapsed = performance.now() - start;
    expect(out.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(out.endsWith(' : niveau 24')).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('cardText (dessin seulement)', () => {
  it('remplace l’espace fine insécable U+202F par l’espace insécable U+00A0', () => {
    expect(cardText('1 505 XP')).toBe('1 505 XP');
    expect(cardText('9 999 999')).toBe('9 999 999');
  });

  it('laisse le reste intact (texte normal, U+00A0 déjà là, espace ordinaire)', () => {
    expect(cardText('Encore ')).toBe('Encore ');
    expect(cardText('64 %')).toBe('64 %');
    expect(cardText('')).toBe('');
  });
});

describe('sanitizeLabel', () => {
  it.each([
    ['U+202E (RLO)', 'Les\u202eAgents', 'LesAgents'],
    ['U+202A..U+202D', '\u202aa\u202bb\u202cc\u202dd', 'abcd'],
    ['U+200E et U+200F (LRM, RLM)', '\u200eFaye\u200f', 'Faye'],
    ['U+061C (ALM)', 'Fa\u061cye', 'Faye'],
    ['U+2066..U+2069 (isolats)', '\u2066a\u2067b\u2068c\u2069', 'abc'],
    ['NUL', 'Fa\u0000ye', 'Faye'],
    ['ESC', '\u001b[31mFaye', '[31mFaye'],
    ['CR LF', 'Faye\r\nHunter', 'FayeHunter'],
    ['tabulation, DEL et contrôle C1 (U+0085)', 'a\tb\u007fc\u0085d', 'abcd'],
  ])('retire %s', (_label, input, expected) => {
    expect(sanitizeLabel(input)).toBe(expected);
  });

  it.each([
    ['texte normal', 'Les Agents de Faye'],
    ['accents et apostrophe', "Tireur d'élite — Élodie"],
    ['emojis ZWJ (U+200D gardé)', '👩‍🚀👨‍👩‍👧‍👦'],
    ['drapeau et teinte', '🇫🇷👍🏽'],
    ['espaces insécables U+00A0 et U+202F', '1 505 et 2 431'],
    ['voisins des plages retirées (U+2010, U+2029, U+206A)', '\u2010\u2029\u206a'],
  ])('garde %s', (_label, input) => {
    expect(sanitizeLabel(input)).toBe(input);
  });

  it('un pseudo fait seulement de caractères retirés devient vide', () => {
    expect(sanitizeLabel('\u202e\u0000\u200f')).toBe('');
  });
});

describe('initialOf', () => {
  it.each([
    ['faye', 'F'],
    ['élodie', 'É'],
    ['😀x', '😀'],
    [' faye', 'F'],
    ['1abc', '1'],
    ['', '?'],
    ['  ', '?'],
  ])('« %s » → « %s »', (input, expected) => {
    expect(initialOf(input)).toBe(expected);
  });
});
