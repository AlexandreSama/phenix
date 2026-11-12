import http from 'node:http';
import https from 'node:https';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { TD2_PLATFORM_LABELS } from '@phenix/shared';
import { ButtonStyle, ComponentType } from 'discord.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CARD_FONT_FAMILIES,
  cardFontStack,
  registerCardFonts,
  type CardFontRole,
} from '../../../core/cards/fonts.js';
import { careerMessage, formatStat } from './messages.js';
import { TD2_STAT_KEYS, type Td2Career, type Td2StatKey } from './provider.js';
import {
  careerReply,
  profileButton,
  renderStatsCard,
  STATS_CARD_SIZE,
  timeSplit,
} from './stats-card.js';
import { TRACKER_GG_PROFILE_URL } from './tracker-gg.js';

const duration = (seconds: number) => ({ kind: 'duration' as const, seconds });
const count = (value: number) => ({ kind: 'number' as const, value });
const text = (value: string) => ({ kind: 'text' as const, value });

describe('timeSplit', () => {
  it('répartit le temps PvE et Dark Zone', () => {
    const split = timeSplit({ timePve: duration(3000), timeDarkZone: duration(1000) });
    expect(split?.pve).toBeCloseTo(0.75);
    expect(split?.darkZone).toBeCloseTo(0.25);
  });

  it('les deux parts somment toujours à 1', () => {
    for (const [pve, darkZone] of [
      [1234, 5678],
      [1, 2],
      [99_999, 1],
      [3600, 3600],
    ] as const) {
      const split = timeSplit({ timePve: duration(pve), timeDarkZone: duration(darkZone) });
      expect((split?.pve ?? 0) + (split?.darkZone ?? 0)).toBeCloseTo(1, 10);
    }
  });

  it('un seul des deux à zéro : l’autre prend tout', () => {
    expect(timeSplit({ timePve: duration(0), timeDarkZone: duration(100) })).toEqual({
      pve: 0,
      darkZone: 1,
    });
    expect(timeSplit({ timePve: duration(100), timeDarkZone: duration(0) })).toEqual({
      pve: 1,
      darkZone: 0,
    });
  });

  it('null si une des deux durées manque', () => {
    expect(timeSplit({ timePve: duration(3000) })).toBeNull();
    expect(timeSplit({ timeDarkZone: duration(1000) })).toBeNull();
    expect(timeSplit({})).toBeNull();
  });

  it('null si les durées sont nulles (somme nulle)', () => {
    expect(timeSplit({ timePve: duration(0), timeDarkZone: duration(0) })).toBeNull();
  });

  it.each([
    ['négative', -100],
    ['NaN', Number.NaN],
    ['infinie', Number.POSITIVE_INFINITY],
  ])(
    'null si une durée est %s (décision : pas de répartition plutôt qu’une répartition fausse)',
    (_name, seconds) => {
      expect(timeSplit({ timePve: duration(seconds), timeDarkZone: duration(1000) })).toBeNull();
      expect(timeSplit({ timePve: duration(3000), timeDarkZone: duration(seconds) })).toBeNull();
    },
  );

  it('null si une stat n’est pas une durée', () => {
    expect(timeSplit({ timePve: text('beaucoup'), timeDarkZone: duration(1000) })).toBeNull();
    expect(timeSplit({ timePve: duration(3000), timeDarkZone: count(1000) })).toBeNull();
  });
});

// --- Dessin ---------------------------------------------------------------------------------

const ACCENT = '#f65308';
const GOLD = '#f5aa04';
const PANEL = '#26170f';
const BACKGROUND = '#1d110c';
const INITIAL_SQUARE = '#50260b';

const career: Td2Career = {
  platform: 'PSN',
  handle: 'FayeHunter',
  avatarUrl: 'https://static.example.test/avatar.png',
  profileUrl: 'https://tracker.example.test/FayeHunter',
  stats: {
    level: count(40),
    gearScore: count(515),
    specialization: text("Tireur d'élite"),
    timePlayed: duration(1284 * 3600),
    timePve: duration(3000 * 60),
    timeDarkZone: duration(1000 * 60),
    npcKills: count(184302),
    eliteKills: count(41230),
    namedKills: count(6812),
    headshots: count(72455),
    dzRank: count(87),
    roguesKilled: count(1204),
    pvpKills: count(3117),
  },
};
const emptyCareer: Td2Career = { ...career, stats: {} };
const CREDIT = 'Powered by Tracker Network';
/** La marque du pied de page (à droite) : texte factorisé, sa valeur reste à décider. */
const FOOTER_BRAND = 'Phenix';

type Point = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };

async function decode(png: Buffer) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx;
}

const hex = (value: number) => value.toString(16).padStart(2, '0');

/** La couleur d'un pixel, « #rrggbb », ou « transparent » si le pixel n'est pas opaque. */
async function colorAt(png: Buffer, { x, y }: Point): Promise<string> {
  const ctx = await decode(png);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(x, y, 1, 1).data;
  return a === 0 ? 'transparent' : `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Combien de pixels de la zone ont exactement cette couleur. */
async function countColor(png: Buffer, region: Region, color: string): Promise<number> {
  const ctx = await decode(png);
  const { data } = ctx.getImageData(region.x, region.y, region.width, region.height);
  let found = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pixel = `#${hex(data[i] ?? 0)}${hex(data[i + 1] ?? 0)}${hex(data[i + 2] ?? 0)}`;
    if (data[i + 3] === 255 && pixel === color) found++;
  }
  return found;
}

/** Les octets RGBA d'une zone : de quoi vérifier qu'elle est (ou n'est pas) restée intacte. */
async function regionData(png: Buffer, region: Region): Promise<number[]> {
  const ctx = await decode(png);
  return [...ctx.getImageData(region.x, region.y, region.width, region.height).data];
}

/** Combien de bandes de la couleur du panneau traverse la ligne y, de gauche à droite. */
async function panelRuns(png: Buffer, y: number): Promise<number> {
  const ctx = await decode(png);
  const { data } = ctx.getImageData(0, y, STATS_CARD_SIZE.width, 1);
  let runs = 0;
  let inside = false;
  for (let i = 0; i < data.length; i += 4) {
    const isPanel =
      data[i + 3] === 255 &&
      `#${hex(data[i] ?? 0)}${hex(data[i + 1] ?? 0)}${hex(data[i + 2] ?? 0)}` === PANEL;
    if (isPanel && !inside) runs++;
    inside = isPanel;
  }
  return runs;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Signature PNG et dimensions lues dans l'IHDR (largeur puis hauteur, 32 bits gros-boutistes). */
function pngInfo(png: Buffer) {
  return {
    signature: [...png.subarray(0, 8)],
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

const pngOf = (width: number, height: number) => ({ signature: PNG_SIGNATURE, width, height });

/**
 * Tout le texte que le rendu demande de dessiner, dans l'ordre : de quoi vérifier ce qui est
 * affiché (et surtout ce qui ne l'est pas) sans lire des pixels de lettres.
 */
async function drawnTexts(...args: Parameters<typeof renderStatsCard>) {
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
    fillText: (...params: unknown[]) => unknown;
  };
  const spy = vi.spyOn(proto, 'fillText');
  try {
    const png = await renderStatsCard(...args);
    return { png, texts: spy.mock.calls.map(([drawn]) => String(drawn)) };
  } finally {
    spy.mockRestore();
  }
}

/** Un des textes dessinés (espaces de bord et apostrophe typographique ignorés) est exactement la chaîne. */
const normalize = (value: string) => value.replaceAll('’', "'").trim();
const hasText = (texts: string[], expected: string) =>
  texts.some((drawn) => normalize(drawn) === normalize(expected));
/** Ce que le rendu dessine juste après chaque occurrence du libellé (dans l'ordre des appels fillText). */
const drawnAfter = (texts: string[], label: string) =>
  texts.flatMap((drawn, index) =>
    normalize(drawn) === normalize(label) ? [normalize(texts[index + 1] ?? '')] : [],
  );
/** Une moitié de paire de substitution sans l'autre : un emoji coupé en deux. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Valeur telle que dessinée : l'espace fine U+202F des milliers devient l'espace insécable U+00A0. */
const onCard = (value: string) => value.replaceAll(' ', ' ');

/** Zone d'un bloc de stats : la première carte, de x = 40 à 333, de y = 198 à 497. */
const FIRST_CARD: Region = { x: 40, y: 198, width: 293, height: 299 };
/** Une ligne dans le haut des cartes (12 px sous leur bord, au-dessus de leur titre) : hors texte. */
const CARDS_ROW = 210;
/** La droite de l'en-tête, là où sont NIVEAU et le score d'équipement (le pseudo s'arrête avant). */
const HEADER_RIGHT: Region = { x: 700, y: 40, width: 260, height: 120 };
/** Le bas de la carte, hors des blocs : y = 505 à 555 (pied de page à ≈ 521–538 px). */
const footerLeft = (x = 60, width = 440): Region => ({ x, y: 520, width, height: 30 });

describe('STATS_CARD_SIZE', () => {
  it('fait 1000 × 560', () => {
    expect(STATS_CARD_SIZE).toEqual({ width: 1000, height: 560 });
  });
});

/** Ce qu'un appel réseau fait pendant le rendu : lever, pour qu'il ne parte jamais pour de vrai. */
const forbidden = () => {
  throw new Error('appel réseau interdit');
};

describe('renderStatsCard', () => {
  beforeAll(() => {
    registerCardFonts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produit un PNG de 1000 × 560', async () => {
    expect(pngInfo(await renderStatsCard(career, CREDIT))).toEqual(pngOf(1000, 560));
  });

  it('dessine le fond, l’en-tête et des coins arrondis', async () => {
    const png = await renderStatsCard(career, CREDIT);
    expect(await colorAt(png, { x: 990, y: 300 })).toBe(BACKGROUND);
    expect(await colorAt(png, { x: 500, y: 10 })).toBe(PANEL);
    expect(await colorAt(png, { x: 0, y: 0 })).toBe('transparent');
  });

  it('le bord bas de l’en-tête est accent, sur 2 px (32 + 104 + 32 = 168, puis la bordure)', async () => {
    // L'en-tête mesure 168 px (géométrie dérivée de l'avatar de 104 px + 2 × 32, assumée), puis
    // le bord de 2 px : lignes y = 168 et 169.
    const png = await renderStatsCard(career, CREDIT);
    expect(await colorAt(png, { x: 500, y: 160 })).toBe(PANEL);
    expect(await colorAt(png, { x: 500, y: 168 })).toBe(ACCENT);
    expect(await colorAt(png, { x: 500, y: 169 })).toBe(ACCENT);
    expect(await colorAt(png, { x: 500, y: 172 })).toBe(BACKGROUND);
  });

  it('l’initiale du pseudo est dans un carré arrondi, sans avatar', async () => {
    const png = await renderStatsCard(career, CREDIT);
    expect(await colorAt(png, { x: 60, y: 125 })).toBe(INITIAL_SQUARE);
    // le coin du carré est arrondi : le fond de l'en-tête reste visible
    expect(await colorAt(png, { x: 42, y: 34 })).toBe(PANEL);
  });

  it('ne télécharge jamais l’avatar du tracker (RGPD) : aucun appel réseau', async () => {
    expect(career.avatarUrl).toBe('https://static.example.test/avatar.png'); // précondition
    const spies = [
      vi.spyOn(globalThis, 'fetch').mockImplementation(forbidden),
      vi.spyOn(https, 'get').mockImplementation(forbidden),
      vi.spyOn(https, 'request').mockImplementation(forbidden),
      vi.spyOn(http, 'get').mockImplementation(forbidden),
      vi.spyOn(http, 'request').mockImplementation(forbidden),
    ];

    await renderStatsCard(career, CREDIT);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('dessine les trois cartes de stats', async () => {
    const png = await renderStatsCard(career, CREDIT);
    for (const x of [50, 360, 670]) expect(await colorAt(png, { x, y: 300 })).toBe(PANEL);
  });

  it('barre « Temps de jeu » : PvE en accent, Dark Zone en or, selon la répartition', async () => {
    const png = await renderStatsCard(career, CREDIT); // 75 % PvE, 25 % DZ
    const accent = await countColor(png, FIRST_CARD, ACCENT);
    const gold = await countColor(png, FIRST_CARD, GOLD);
    expect(gold).toBeGreaterThan(0);
    expect(accent / gold).toBeGreaterThan(2.85);
    expect(accent / gold).toBeLessThan(3.15);
  });

  it('pas de barre sans la répartition PvE / Dark Zone', async () => {
    const { timeDarkZone: _omitted, ...stats } = career.stats;
    const png = await renderStatsCard({ ...career, stats }, CREDIT);
    expect(await countColor(png, FIRST_CARD, ACCENT)).toBe(0);
    expect(await countColor(png, FIRST_CARD, GOLD)).toBe(0);
  });

  it('écrit l’en-tête : plateforme, pseudo, niveau, score, spécialisation', async () => {
    const { texts } = await drawnTexts(career, CREDIT);
    const all = texts.join('\n');
    expect(all).toContain(`${TD2_PLATFORM_LABELS.PSN.toUpperCase()} · THE DIVISION 2`);
    expect(all).toContain('FayeHunter');
    expect(all).toContain('NIVEAU');
    expect(all).toMatch(/SCORE D['’]ÉQUIPEMENT/);
    expect(all).toContain("Tireur d'élite");
  });

  describe('chaque valeur est dessinée juste après son libellé', () => {
    /** Libellé affiché pour chacune des 13 stats ; null : pas de libellé (pastille de spécialisation). */
    const LABELS: Record<Td2StatKey, string | null> = {
      level: 'NIVEAU',
      gearScore: "SCORE D'ÉQUIPEMENT",
      specialization: null,
      timePlayed: 'Total',
      timePve: 'PvE',
      timeDarkZone: 'Dark Zone',
      npcKills: 'Ennemis éliminés',
      eliteKills: 'Élites',
      namedKills: 'Nommés',
      headshots: 'Tirs à la tête',
      dzRank: 'Rang',
      roguesKilled: 'Renégats éliminés',
      pvpKills: 'Agents éliminés',
    };
    const LABELLED = TD2_STAT_KEYS.filter((key) => LABELS[key] !== null);

    it.each(LABELLED)('%s : libellé puis valeur formatée, dans cet ordre', async (key) => {
      const { texts } = await drawnTexts(career, CREDIT);
      const stat = career.stats[key];
      expect(stat).toBeDefined();
      // le libellé peut revenir (« PvE », « Dark Zone » sont aussi des titres de bloc) : une des fois suffit
      expect(drawnAfter(texts, LABELS[key] ?? '')).toContain(onCard(formatStat(stat!)));
    });

    it('une valeur n’est jamais rangée sous le libellé d’une autre (Élites ≠ Nommés)', async () => {
      const { texts } = await drawnTexts(career, CREDIT);
      // témoin : la forme dessinée est bien celle que l'on cherche
      expect(drawnAfter(texts, 'Élites')).toContain(onCard(formatStat(career.stats.eliteKills!)));
      expect(drawnAfter(texts, 'Élites')).not.toContain(
        onCard(formatStat(career.stats.namedKills!)),
      );
      expect(drawnAfter(texts, 'Nommés')).not.toContain(
        onCard(formatStat(career.stats.eliteKills!)),
      );
    });

    it('les milliers sont dessinés avec l’espace insécable U+00A0, jamais l’espace fine U+202F', async () => {
      const { texts } = await drawnTexts(career, CREDIT);
      expect(drawnAfter(texts, 'Ennemis éliminés')).toContain('184 302');
      expect(drawnAfter(texts, 'Total')).toContain('1 284 h 0 min');
      expect(texts.filter((drawn) => drawn.includes(' '))).toEqual([]);
    });

    it('NIVEAU est suivi de « 40 », SCORE D’ÉQUIPEMENT de « 515 »', async () => {
      const { texts } = await drawnTexts(career, CREDIT);
      expect(drawnAfter(texts, 'NIVEAU')).toContain('40');
      expect(drawnAfter(texts, "SCORE D'ÉQUIPEMENT")).toContain('515');
    });

    it('la spécialisation est écrite telle quelle', async () => {
      const { texts } = await drawnTexts(career, CREDIT);
      expect(hasText(texts, "Tireur d'élite")).toBe(true);
    });

    it('niveau 0 et rang Dark Zone 0 : le « 0 » est dessiné, pas sauté', async () => {
      const stats = { ...career.stats, level: count(0), dzRank: count(0) };
      const { texts } = await drawnTexts({ ...career, stats }, CREDIT);
      expect(drawnAfter(texts, 'NIVEAU')).toContain('0');
      expect(drawnAfter(texts, 'Rang')).toContain('0');
    });
  });

  it('écrit les stats présentes, formatées comme l’embed', async () => {
    const { texts } = await drawnTexts(career, CREDIT);
    const all = texts.join('\n');
    for (const label of [
      'Temps de jeu',
      'Dark Zone',
      'Ennemis éliminés',
      'Élites',
      'Nommés',
      'Tirs à la tête',
      'Renégats éliminés',
      'Agents éliminés',
    ]) {
      expect(all).toContain(label);
    }
  });

  it('une stat absente : sa ligne est sautée, sans « undefined » ni NaN', async () => {
    const { eliteKills: _elite, headshots: _headshots, ...stats } = career.stats;
    const { texts } = await drawnTexts({ ...career, stats }, CREDIT);
    const all = texts.join('\n');
    expect(all).not.toContain('Élites');
    expect(all).not.toContain('Tirs à la tête');
    expect(all).toContain('Nommés');
    expect(all).not.toMatch(/undefined|NaN/);
  });

  it('une carrière sans aucune stat se dessine quand même', async () => {
    const { png, texts } = await drawnTexts(emptyCareer, CREDIT);
    expect(pngInfo(png)).toEqual(pngOf(1000, 560));
    const all = texts.join('\n');
    expect(all).toContain('FayeHunter');
    expect(all).not.toMatch(/undefined|NaN/);
    expect(await colorAt(png, { x: 500, y: 169 })).toBe(ACCENT);
  });

  it('une carrière vide : pas de panneau vide, et le message qui le dit', async () => {
    const { png, texts } = await drawnTexts(emptyCareer, CREDIT);
    // les panneaux de stats (50, 360 et 670 sur y = 300) ne sont pas dessinés
    for (const x of [50, 360, 670]) expect(await colorAt(png, { x, y: 300 })).toBe(BACKGROUND);
    expect(await panelRuns(png, CARDS_ROW)).toBe(0);
    expect(hasText(texts, 'Aucune statistique publique pour cet agent.')).toBe(true);
  });

  it('avec des stats, le message « aucune statistique » n’apparaît pas', async () => {
    const { texts } = await drawnTexts(career, CREDIT);
    expect(texts.join('\n')).not.toContain('Aucune statistique');
  });

  it('un bloc sans aucune ligne n’est pas dessiné (PvE entièrement absent : deux panneaux, pas trois)', async () => {
    const { npcKills: _n, eliteKills: _e, namedKills: _m, headshots: _h, ...stats } = career.stats;
    const { png, texts } = await drawnTexts({ ...career, stats }, CREDIT);

    expect(await panelRuns(await renderStatsCard(career, CREDIT), CARDS_ROW)).toBe(3); // témoin
    expect(await panelRuns(png, CARDS_ROW)).toBe(2);
    const all = texts.join('\n');
    for (const label of ['Ennemis éliminés', 'Élites', 'Nommés', 'Tirs à la tête']) {
      expect(all).not.toContain(label);
    }
    expect(all).toContain('Renégats éliminés');
  });

  it('niveau et score absents : pas de chiffre inventé', async () => {
    const { texts } = await drawnTexts(emptyCareer, CREDIT);
    expect(texts.join('\n')).not.toMatch(/undefined|NaN|null/);
  });

  it('est déterministe : deux rendus identiques donnent les mêmes octets', async () => {
    const first = await renderStatsCard(career, CREDIT);
    const second = await renderStatsCard(career, CREDIT);
    expect(first.equals(second)).toBe(true);
  });

  describe('un pseudo trop long ne déborde pas', () => {
    it('200 « W » : raccourci par « … », sans toucher aux cartes ni au niveau / score', async () => {
      const normal = await renderStatsCard(career, CREDIT);
      const { png, texts } = await drawnTexts({ ...career, handle: 'W'.repeat(200) }, CREDIT);

      expect(pngInfo(png)).toEqual(pngOf(1000, 560));
      expect(texts.some((drawn) => drawn.includes('W'.repeat(200)))).toBe(false);
      expect(
        texts.some((drawn) => drawn.startsWith('W') && drawn.endsWith('…') && drawn.length < 200),
      ).toBe(true);
      expect(await regionData(png, FIRST_CARD)).toEqual(await regionData(normal, FIRST_CARD));
      expect(await regionData(png, HEADER_RIGHT)).toEqual(await regionData(normal, HEADER_RIGHT));
    });

    it('un pseudo d’emojis raccourci ne coupe aucun emoji en deux', async () => {
      const { texts } = await drawnTexts({ ...career, handle: '🔥'.repeat(100) }, CREDIT);
      expect(texts.some((drawn) => drawn.startsWith('🔥') && drawn.endsWith('…'))).toBe(true);
      expect(texts.filter((drawn) => LONE_SURROGATE.test(drawn))).toEqual([]);
    });
  });

  it('un pseudo avec des emojis, assez court : écrit en entier', async () => {
    const { texts } = await drawnTexts({ ...career, handle: '🔥🔥🔥 Faye 🎮👩‍🚀' }, CREDIT);
    expect(texts.some((drawn) => drawn.includes('🔥🔥🔥 Faye 🎮👩‍🚀'))).toBe(true);
  });

  it('un pseudo vide : l’initiale de repli « ? » dans le carré', async () => {
    const { png, texts } = await drawnTexts({ ...career, handle: '' }, CREDIT);
    expect(hasText(texts, '?')).toBe(true);
    expect(await colorAt(png, { x: 60, y: 125 })).toBe(INITIAL_SQUARE);
  });

  describe('noms nettoyés : caractères de contrôle et de direction retirés', () => {
    const CONTROL_OR_BIDI = /[\p{Cc}\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/u;

    it('NUL, ESC, CR LF et U+202E retirés du pseudo et de la spécialisation dessinés', async () => {
      const stats = { ...career.stats, specialization: text("Tireur\u202e d'élite\u0000") };
      const { texts } = await drawnTexts(
        { ...career, handle: '\u202eFaye\u0000Hun\u001bter\r\n', stats },
        CREDIT,
      );
      expect(hasText(texts, 'FayeHunter')).toBe(true);
      expect(hasText(texts, "Tireur d'élite")).toBe(true);
      expect(texts.filter((drawn) => CONTROL_OR_BIDI.test(drawn))).toEqual([]);
    });

    it('un pseudo fait seulement de caractères retirés : l’initiale de repli « ? »', async () => {
      const { png, texts } = await drawnTexts({ ...career, handle: '\u202e\u0000\r\n' }, CREDIT);
      expect(hasText(texts, '?')).toBe(true);
      expect(await colorAt(png, { x: 60, y: 125 })).toBe(INITIAL_SQUARE);
    });

    it('un pseudo avec un emoji ZWJ reste intact', async () => {
      const { texts } = await drawnTexts({ ...career, handle: 'Faye👩‍🚀' }, CREDIT);
      expect(hasText(texts, 'Faye👩‍🚀')).toBe(true);
    });
  });

  it('encode le PNG avec canvas.encode (hors du thread principal), jamais toBuffer', async () => {
    const proto = Object.getPrototypeOf(createCanvas(1, 1)) as {
      encode: (...params: unknown[]) => unknown;
      toBuffer: (...params: unknown[]) => unknown;
    };
    const encode = vi.spyOn(proto, 'encode');
    const toBuffer = vi.spyOn(proto, 'toBuffer');

    const png = await renderStatsCard(career, CREDIT);

    expect(encode).toHaveBeenCalledWith('png');
    expect(toBuffer).not.toHaveBeenCalled();
    expect(pngInfo(png)).toEqual(pngOf(1000, 560));
  });

  it('une spécialisation très longue ne fait pas échouer le dessin', async () => {
    const stats = { ...career.stats, specialization: text('Tireur d’élite '.repeat(30)) };
    expect(pngInfo(await renderStatsCard({ ...career, stats }, CREDIT))).toEqual(pngOf(1000, 560));
  });

  it('des nombres à 9 chiffres ne font pas échouer le dessin', async () => {
    const stats = {
      ...career.stats,
      npcKills: count(999_999_999),
      timePlayed: duration(99_999 * 3600),
      level: count(1000),
      gearScore: count(9999),
    };
    expect(pngInfo(await renderStatsCard({ ...career, stats }, CREDIT))).toEqual(pngOf(1000, 560));
  });

  it('la mention exigée par le service est dessinée à gauche du pied, telle quelle', async () => {
    const { png, texts } = await drawnTexts(career, CREDIT);
    expect(texts).toContain(CREDIT);
    expect(texts).toContain(FOOTER_BRAND);

    // avec / sans mention : seul le pied, à gauche, change
    const without = await renderStatsCard(career, '');
    expect(await regionData(png, footerLeft())).not.toEqual(
      await regionData(without, footerLeft()),
    );
    const above: Region = { x: 0, y: 0, width: 1000, height: 505 };
    const footerRight: Region = { x: 500, y: 505, width: 500, height: 55 };
    expect(await regionData(png, above)).toEqual(await regionData(without, above));
    expect(await regionData(png, footerRight)).toEqual(await regionData(without, footerRight));
  });

  it('sans mention, le pied est vide à gauche (la zone de contrôle est bien le pied)', async () => {
    const png = await renderStatsCard(career, '');
    expect(await countColor(png, footerLeft(), BACKGROUND)).toBe(440 * 30);
  });

  it('une mention longue n’est jamais tronquée en silence', async () => {
    const credit =
      'Données publiques du profil · Powered by Tracker Network (tracker.gg) · mise à jour récente';
    const { texts } = await drawnTexts(career, credit);
    expect(texts).toContain(credit);
  });

  it('une mention démesurée garde ses derniers mots (réduite ou sur plusieurs lignes, mais entière)', async () => {
    const credit = `${'Powered by Tracker Network '.repeat(12)}FINDELAMENTION`;
    const { png, texts } = await drawnTexts(career, credit);
    expect(pngInfo(png)).toEqual(pngOf(1000, 560));
    const all = texts.join('\n');
    expect(all).toContain('FINDELAMENTION');
    expect(all).not.toContain('…');
  });
});

// --- Réponse de /td2 stats ---------------------------------------------------------------------

const FAKE_PNG = Buffer.from('png factice');

function setup(render?: (career: Td2Career, credit: string) => Promise<Buffer>) {
  return {
    render: vi.fn(render ?? (async (_career: Td2Career, _credit: string) => FAKE_PNG)),
    logger: { warn: vi.fn() },
  };
}

const failingRender = async (): Promise<Buffer> => {
  throw new Error('canvas cassé');
};

type FileLike = { name?: string; description?: string; attachment: unknown };
const filesOf = (reply: unknown) => (reply as { files: FileLike[] }).files;

/** Le texte alternatif de la carte pour un pseudo donné. */
async function alt(handle: string): Promise<string> {
  const [file] = filesOf(await careerReply({ ...career, handle }, CREDIT, setup()));
  return file?.description ?? '';
}

/** Ce que la phrase ajoute autour du pseudo ; le pseudo n'y figure qu'une fois. */
const overheadOf = async () => {
  const one = (await alt('Ж')).length;
  expect((await alt('ЖЖ')).length - one).toBe(1);
  return one - 1;
};

describe('careerReply', () => {
  it('répond avec le fichier stats.png et un texte alternatif en français', async () => {
    const deps = setup();

    const reply = await careerReply(career, CREDIT, deps);

    expect(reply).toHaveProperty('files');
    expect(reply).not.toHaveProperty('embeds');
    const [file] = filesOf(reply);
    expect(filesOf(reply)).toHaveLength(1);
    expect(file?.name).toBe('stats.png');
    expect(file?.attachment).toBe(FAKE_PNG);
    expect(deps.render).toHaveBeenCalledWith(career, CREDIT);
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });

  it('le texte alternatif dit le pseudo, la plateforme, le niveau et le score d’équipement', async () => {
    const [file] = filesOf(await careerReply(career, CREDIT, setup()));
    const description = file?.description ?? '';
    expect(description).toContain('FayeHunter');
    expect(description).toContain(TD2_PLATFORM_LABELS.PSN);
    expect(description).toMatch(/niveau 40/i);
    expect(description).toMatch(/score d['’]équipement 515/i);
  });

  it('le texte alternatif saute ce qui manque, sans « undefined »', async () => {
    const [file] = filesOf(await careerReply(emptyCareer, CREDIT, setup()));
    const description = file?.description ?? '';
    expect(description).toContain('FayeHunter');
    expect(description).toContain(TD2_PLATFORM_LABELS.PSN);
    expect(description).not.toMatch(/niveau|score|undefined|NaN|null/i);
  });

  it('le texte alternatif : niveau sans score, ou score sans niveau', async () => {
    const levelOnly = filesOf(
      await careerReply({ ...career, stats: { level: count(40) } }, CREDIT, setup()),
    )[0]?.description;
    expect(levelOnly).toMatch(/niveau 40/i);
    expect(levelOnly).not.toMatch(/score|undefined|NaN|null/i);

    const scoreOnly = filesOf(
      await careerReply({ ...career, stats: { gearScore: count(515) } }, CREDIT, setup()),
    )[0]?.description;
    expect(scoreOnly).toMatch(/score d['’]équipement 515/i);
    expect(scoreOnly).not.toMatch(/niveau|undefined|NaN|null/i);
  });

  it('le texte alternatif dit un niveau 0 (pas sauté comme une valeur fausse)', async () => {
    const [file] = filesOf(
      await careerReply({ ...career, stats: { level: count(0) } }, CREDIT, setup()),
    );
    expect(file?.description).toMatch(/niveau 0\b/i);
  });

  describe('texte alternatif : 1 024 caractères au plus (limite de Discord)', () => {
    const LIMIT = 1024;
    it('exactement 1 024 caractères : intact', async () => {
      const handle = 'Ж'.repeat(LIMIT - (await overheadOf()));
      const description = await alt(handle);
      expect(description).toHaveLength(LIMIT);
      expect(description).toContain(handle);
    });

    it('1 025 caractères : c’est le pseudo qui est raccourci, pas la fin de la phrase', async () => {
      const handle = 'Ж'.repeat(LIMIT + 1 - (await overheadOf()));
      const description = await alt(handle);
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toContain('Ж');
      expect(description).toContain(TD2_PLATFORM_LABELS.PSN);
      expect(description).toMatch(/niveau 40/i);
      expect(description).toMatch(/score d['’]équipement 515/i);
    });

    it('un pseudo démesuré (3 000 caractères) : même résultat', async () => {
      const description = await alt('W'.repeat(3000));
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toMatch(/niveau 40/i);
      expect(description).toMatch(/score d['’]équipement 515/i);
    });

    it('un pseudo de 100 000 caractères : ≤ 1 024, le niveau reste, en moins de 1 000 ms', async () => {
      const start = performance.now();
      const description = await alt('W'.repeat(100_000));
      const elapsed = performance.now() - start;
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toMatch(/niveau 40/i);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  it('le texte alternatif garde l’espace fine U+202F des milliers (seul le dessin la remplace)', async () => {
    const [file] = filesOf(
      await careerReply({ ...career, stats: { gearScore: count(1515) } }, CREDIT, setup()),
    );
    expect(file?.description).toContain('1 515');
  });

  it('le texte alternatif : U+202E, NUL, ESC et CR LF retirés du pseudo', async () => {
    const description = await alt('\u202eFaye\u0000Hun\u001bter\r\n');
    expect(description).toContain('Carte de stats de FayeHunter (');
    expect(description).not.toMatch(/[\p{Cc}\u202e]/u);
  });

  it('un dessin qui échoue : exactement l’embed existant, et un seul avertissement', async () => {
    const deps = setup(async () => {
      throw new Error('canvas cassé');
    });

    const reply = await careerReply(career, CREDIT, deps);

    expect(reply).not.toHaveProperty('files');
    expect(reply).toEqual(careerMessage(career, CREDIT));
    expect(deps.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('l’avertissement ne contient ni le pseudo ni l’URL du profil', async () => {
    const deps = setup(async () => {
      throw new Error('canvas cassé');
    });

    await careerReply(career, CREDIT, deps);

    const [context, message] = deps.logger.warn.mock.calls[0] as [object, string];
    expect(typeof message).toBe('string');
    const logged = JSON.stringify([context, message]);
    expect(logged).not.toContain('FayeHunter');
    expect(logged).not.toContain('tracker.example.test');
    expect(logged).not.toContain('avatar.png');
  });

  it('sans logger : le repli marche quand même', async () => {
    expect(await careerReply(career, CREDIT, { render: failingRender })).toEqual(
      careerMessage(career, CREDIT),
    );
  });

  it('avec le vrai dessin : un vrai PNG de 1000 × 560', async () => {
    registerCardFonts();
    const [file] = filesOf(await careerReply(career, CREDIT));
    expect(pngInfo(file?.attachment as Buffer)).toEqual(pngOf(1000, 560));
  });
});

// --- Lien vers la page tracker.gg ----------------------------------------------------------------

const TRACKER_PROFILE = `${TRACKER_GG_PROFILE_URL}/psn/FayeHunter/overview`;
const BUTTON_LABEL = 'Voir sur tracker.gg';
/** La rangée attendue : un seul bouton lien, en JSON de l'API Discord. */
const linkRow = (url: string) => ({
  type: ComponentType.ActionRow,
  components: [{ type: ComponentType.Button, style: ButtonStyle.Link, url, label: BUTTON_LABEL }],
});

describe('profileButton', () => {
  it('le nom d’hôte de référence est celui de TRACKER_GG_PROFILE_URL : tracker.gg', () => {
    expect(new URL(TRACKER_GG_PROFILE_URL).hostname).toBe('tracker.gg');
  });

  it('un lien https vers tracker.gg : une rangée, un bouton lien « Voir sur tracker.gg »', () => {
    expect(profileButton(TRACKER_PROFILE)?.toJSON()).toEqual(linkRow(TRACKER_PROFILE));
  });

  it('512 caractères (limite de Discord pour l’URL d’un bouton) : accepté', () => {
    const url = `${TRACKER_PROFILE}?${'x'.repeat(512 - TRACKER_PROFILE.length - 1)}`;
    expect(url).toHaveLength(512);
    expect(profileButton(url)?.toJSON()).toEqual(linkRow(url));
  });

  it.each([
    ['null', null],
    ['chaîne vide', ''],
    ['http (non chiffré)', TRACKER_PROFILE.replace('https:', 'http:')],
    ['hôte étranger', 'https://evil.com/division-2/profile/psn/FayeHunter/overview'],
    ['sous-domaine piégé', 'https://tracker.gg.evil.com/division-2/profile/psn/x/overview'],
    ['tracker.gg dans le chemin seulement', 'https://evil.com/tracker.gg'],
    ['sous-domaine de tracker.gg (hôte pas exactement le même)', 'https://www.tracker.gg/x'],
    ['identifiants', 'https://user:pass@tracker.gg/division-2/profile/psn/x/overview'],
    ['nom d’utilisateur seul', 'https://user@tracker.gg/division-2/profile/psn/x/overview'],
    ['tracker.gg avant « @ » (l’hôte réel est evil.com)', 'https://tracker.gg@evil.com/x'],
    ['port non standard', 'https://tracker.gg:8443/division-2/profile/psn/x/overview'],
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: avec tracker.gg en hôte', 'javascript://tracker.gg/%0aalert(1)'],
    ['URL invalide', 'pas une url'],
    [
      '513 caractères (Discord refuserait toute la réponse)',
      `${TRACKER_PROFILE}?${'x'.repeat(513 - TRACKER_PROFILE.length - 1)}`,
    ],
  ])('%s : pas de bouton, sans exception', (_label, url) => {
    expect(() => profileButton(url)).not.toThrow();
    expect(profileButton(url)).toBeNull();
  });
});

describe('careerReply : le lien vers tracker.gg', () => {
  const linked: Td2Career = { ...career, profileUrl: TRACKER_PROFILE };
  type Row = { toJSON: () => unknown };

  it('lien valide : la carte, et un bouton lien juste en dessous', async () => {
    const reply = await careerReply(linked, CREDIT, setup());

    const { components } = reply as { components?: Row[] };
    expect(components).toHaveLength(1);
    expect(components?.[0]?.toJSON()).toEqual(linkRow(TRACKER_PROFILE));
    // la carte elle-même ne change pas
    expect(reply).not.toHaveProperty('embeds');
    const [file] = filesOf(reply);
    expect(filesOf(reply)).toHaveLength(1);
    expect(file?.name).toBe('stats.png');
    expect(file?.attachment).toBe(FAKE_PNG);
    const [withoutLink] = filesOf(
      await careerReply({ ...linked, profileUrl: null }, CREDIT, setup()),
    );
    expect(file?.description).toBe(withoutLink?.description);
  });

  it.each([
    ['absent (null)', null],
    ['hors tracker.gg', 'https://tracker.example.test/FayeHunter'],
    ['en http', TRACKER_PROFILE.replace('https:', 'http:')],
    ['javascript:', 'javascript:alert(1)'],
  ])('lien %s : la carte seule, sans components', async (_label, profileUrl) => {
    const reply = await careerReply({ ...career, profileUrl }, CREDIT, setup());
    expect(reply).not.toHaveProperty('components');
    expect(filesOf(reply)).toHaveLength(1);
  });

  it('dessin en échec, même avec un lien valide : exactement l’embed de repli, sans bouton', async () => {
    const reply = await careerReply(linked, CREDIT, { render: failingRender });
    expect(reply).toEqual(careerMessage(linked, CREDIT));
    expect(reply).not.toHaveProperty('components');
  });
});

// --- Polices : la pile de familles (latin, latin-ext, cyrillique, grec) ---------------------------

const ROLES = Object.keys(CARD_FONT_FAMILIES) as CardFontRole[];

/** Le rôle dont `font` est exactement la pile (graisse et taille comprises), sinon null. */
function stackRoleOf(font: string): CardFontRole | null {
  const match = /^(\d+) (\d+(?:\.\d+)?)px /.exec(font);
  if (!match) return null;
  const [weight, size] = [Number(match[1]), Number(match[2])];
  return ROLES.find((role) => cardFontStack(role, weight, size) === font) ?? null;
}

/** Toutes les valeurs affectées à `ctx.font` pendant le rendu. */
async function fontsSetDuring(render: () => Promise<unknown>): Promise<string[]> {
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as { font: string };
  const spy = vi.spyOn(proto, 'font', 'set');
  try {
    await render();
    return spy.mock.calls.map(([font]) => String(font));
  } finally {
    spy.mockRestore();
  }
}

describe('renderStatsCard : polices', () => {
  it('chaque police posée (mesure comme dessin) est une pile complète ; titre, texte et mono servent', async () => {
    registerCardFonts();
    const fonts = await fontsSetDuring(() =>
      renderStatsCard({ ...career, handle: 'Дмитрий' }, CREDIT),
    );
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.filter((font) => stackRoleOf(font) === null)).toEqual([]);
    expect(new Set(fonts.map(stackRoleOf))).toEqual(new Set(ROLES));
  });
});
