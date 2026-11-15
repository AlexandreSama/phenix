import zlib from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { EmbedBuilder } from 'discord.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseEmbed } from '../../core/embeds.js';
import { registerCardFonts } from '../../core/cards/fonts.js';
import { MAX_AVATAR_SIDE } from '../../core/cards/image-size.js';

// loadImage espionné (il appelle toujours le vrai) : prouve qu'un avatar refusé n'est jamais décodé.
// createCanvas aussi : chaque canvas créé a encode et toBuffer espionnés, pour prouver lequel sert.
const created = vi.hoisted(() => ({ canvases: [] as import('@napi-rs/canvas').Canvas[] }));

vi.mock('@napi-rs/canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
  return {
    ...actual,
    loadImage: vi.fn(actual.loadImage),
    createCanvas: vi.fn((width: number, height: number) => {
      const canvas = actual.createCanvas(width, height);
      vi.spyOn(canvas, 'encode');
      vi.spyOn(canvas, 'toBuffer');
      created.canvases.push(canvas);
      return canvas;
    }),
  };
});

// Le téléchargement par défaut de l'avatar : jamais de réseau, et on prouve qu'il est bien le défaut.
vi.mock('../../core/cards/avatar.js', () => ({ fetchAvatar: vi.fn().mockResolvedValue(null) }));

import { fetchAvatar } from '../../core/cards/avatar.js';
import { levelUpReply, renderLevelCard, type LevelCardInput } from './level-card.js';

// --- Maquette 1000 × 300 : valeurs relevées au pixel --------------------------------

const ACCENT = '#ff6b25';
const GOLD = '#f5aa04';
const BACKGROUND = '#1d110c';
const INITIAL_BG = '#50260b';
const CONFETTI_ORANGE = '#f66a07';
const CONFETTI_GOLD = '#f5aa04';
const CONFETTI_DARK = '#a04008';

const LEVEL_CARD_SIZE = { width: 1000, height: 300 } as const;

/** Hexagone à sommet pointu : centre, rayon du tracé (milieu du contour) et épaisseur du contour. */
const HEX = { x: 700, y: 150, radius: 101, stroke: 20 } as const;
/** Bord gauche extérieur de l'hexagone (côté vertical) : x = 700 - (101·cos 30° + 10). */
const HEX_OUTER_LEFT = HEX.x - (HEX.radius * Math.cos(Math.PI / 6) + HEX.stroke / 2);
/** Bord gauche intérieur de l'hexagone (côté vertical). */
const HEX_INNER_LEFT = HEX.x - (HEX.radius * Math.cos(Math.PI / 6) - HEX.stroke / 2);

/** Début du texte (BRAVO, pseudo, sous-titre). */
const TEXT_LEFT = 167;
/** Le pseudo s'arrête au plus tard 24 px avant l'hexagone. */
const NAME_RIGHT_LIMIT = HEX_OUTER_LEFT - 24;

/** Les confettis fixes de la carte : centre, angle (degrés), taille, couleur. */
const CONFETTI = [
  { x: 38, y: 28, color: CONFETTI_DARK },
  { x: 156, y: 20, color: CONFETTI_GOLD },
  { x: 337, y: 36, color: CONFETTI_GOLD },
  { x: 424, y: 16, color: CONFETTI_DARK },
  { x: 628, y: 22, color: CONFETTI_ORANGE },
  { x: 780, y: 44, color: CONFETTI_GOLD },
  { x: 888, y: 32, color: CONFETTI_GOLD },
  { x: 965, y: 123, color: CONFETTI_GOLD },
  { x: 920, y: 252, color: CONFETTI_DARK },
  { x: 690, y: 281, color: CONFETTI_ORANGE },
  { x: 527, y: 264, color: CONFETTI_GOLD },
  { x: 307, y: 272, color: CONFETTI_GOLD },
  { x: 127, y: 258, color: CONFETTI_DARK },
  { x: 24, y: 152, color: CONFETTI_ORANGE },
  { x: 860, y: 100, color: CONFETTI_ORANGE },
  { x: 850, y: 205, color: CONFETTI_GOLD },
] as const;

type Rgba = readonly [number, number, number, number];
type Region = { x: number; y: number; width: number; height: number };
type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const hex = (value: number) => value.toString(16).padStart(2, '0');
const css = ([r, g, b]: Rgba) => `#${hex(r)}${hex(g)}${hex(b)}`;

/** Un PNG décodé : lecture de pixels, compte et boîte englobante par prédicat. */
interface Raster {
  at(x: number, y: number): Rgba;
  count(region: Region, test: (pixel: Rgba) => boolean): number;
  box(region: Region, test: (pixel: Rgba) => boolean): Box | null;
}

async function decode(png: Buffer): Promise<Raster> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  const at = (x: number, y: number): Rgba => {
    const i = (y * image.width + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
  };
  const box = (region: Region, test: (pixel: Rgba) => boolean): Box | null => {
    let left = Infinity;
    let top = Infinity;
    let right = -1;
    let bottom = -1;
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        if (!test(at(x, y))) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) return null;
    return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
  };
  const count = (region: Region, test: (pixel: Rgba) => boolean) => {
    let found = 0;
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) if (test(at(x, y))) found++;
    }
    return found;
  };
  return { at, count, box };
}

/** Opaque et exactement de cette couleur ; un pixel transparent n'est jamais accepté. */
const isColor = (color: string) => (pixel: Rgba) => pixel[3] === 255 && css(pixel) === color;
/** Blanc de texte (pseudo, chiffre du niveau). */
const isWhite = (pixel: Rgba) =>
  pixel[3] === 255 && pixel[0] > 0xf0 && pixel[1] > 0xf0 && pixel[2] > 0xf0;
/** Orange du contour de l'hexagone. */
const isStroke = (pixel: Rgba) => pixel[3] === 255 && pixel[0] > 200 && pixel[2] < 40;
/** Orange vif (BRAVO). */
const isOrange = (pixel: Rgba) =>
  pixel[3] === 255 && pixel[0] > 200 && pixel[1] < 140 && pixel[2] < 90;
/** Gris neutre de « NIVEAU » (ni blanc, ni fond, ni orange). */
const isGrey = (pixel: Rgba) =>
  pixel[3] === 255 &&
  pixel[0] > 110 &&
  pixel[0] < 200 &&
  Math.abs(pixel[0] - pixel[1]) < 20 &&
  Math.abs(pixel[1] - pixel[2]) < 20;
/** Écart au fond, en somme des écarts par canal. */
const farFromBackground = (pixel: Rgba) =>
  Math.abs(pixel[0] - 0x1d) + Math.abs(pixel[1] - 0x11) + Math.abs(pixel[2] - 0x0c) > 6;

/** Un avatar uni, 64×64, comme Discord en renverrait un (PNG). */
function solidAvatar(color: string): Buffer {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toBuffer('image/png');
}

/** Un avatar PNG rouge uni de largeur × hauteur. */
function redAvatar(width: number, height = width): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

// --- Données de test -----------------------------------------------------------

const testData = {
  displayName: 'Faye',
  level: 24,
  avatar: null,
};

/** La boîte englobante du blanc des chiffres dans l'hexagone (sous « NIVEAU »). */
const DIGITS_REGION: Region = { x: 603, y: 112, width: 194, height: 100 };

/** La boîte englobante des chiffres du niveau, dans une carte dessinée pour ce niveau. */
async function digitsBoxOf(level: number) {
  const raster = await decode(await renderLevelCard({ ...testData, level }));
  return raster.box(DIGITS_REGION, isWhite);
}

// --- Tests ---------------------------------------------------------------------

describe('renderLevelCard', () => {
  let png: Buffer;
  let card: Raster;

  beforeAll(async () => {
    registerCardFonts();
    png = await renderLevelCard(testData);
    card = await decode(png);
  });

  it('renvoie un PNG de 1000 × 300', () => {
    expect(png.readUInt32BE(0)).toBe(0x89504e47);
    expect(png.readUInt32BE(16)).toBe(LEVEL_CARD_SIZE.width);
    expect(png.readUInt32BE(20)).toBe(LEVEL_CARD_SIZE.height);
  });

  it('est déterministe : deux rendus identiques sont identiques octet pour octet', async () => {
    const again = await renderLevelCard(testData);
    expect(again.equals(png)).toBe(true);
  });

  // --- Cadre -----------------------------------------------------------------

  it('a des coins arrondis transparents et un fond opaque de la couleur attendue', () => {
    expect(card.at(0, 0)[3]).toBe(0);
    // au centre de la carte, loin de tout texte : opaque et de la couleur du fond, jamais transparent
    expect(card.at(500, 150)[3]).toBe(255);
    expect(css(card.at(500, 150))).toBe(BACKGROUND);
    expect(css(card.at(500, 5))).toBe(BACKGROUND);
  });

  it('ne dessine pas de bordure plus claire sur le pourtour', () => {
    for (const [x, y] of [
      [500, 0],
      [500, 1],
      [500, 2],
      [500, 3],
      [0, 150],
      [1, 150],
      [2, 150],
      [3, 150],
      [999, 150],
      [996, 150],
    ] as const) {
      expect(card.at(x, y).slice(0, 4), `pixel (${x}, ${y})`).toEqual([0x1d, 0x11, 0x0c, 255]);
    }
  });

  // --- Avatar / initiale -------------------------------------------------------

  it("dessine l'initiale du pseudo en or sur un disque de rayon 48 quand il n'y a pas d'avatar", () => {
    expect(card.count({ x: 85, y: 130, width: 26, height: 40 }, isColor(GOLD))).toBeGreaterThan(30);
    // dans le disque, sous la lettre ; juste dedans et juste dehors à gauche, en haut et en bas
    expect(css(card.at(97, 190))).toBe(INITIAL_BG);
    expect(css(card.at(52, 150))).toBe(INITIAL_BG);
    expect(css(card.at(97, 104))).toBe(INITIAL_BG);
    expect(css(card.at(45, 150))).toBe(BACKGROUND);
    expect(css(card.at(97, 98))).toBe(BACKGROUND);
    expect(css(card.at(97, 202))).toBe(BACKGROUND);
  });

  it("dessine l'avatar quand il est fourni, découpé en disque de rayon 48", async () => {
    const withAvatar = await decode(
      await renderLevelCard({ ...testData, avatar: solidAvatar('#ff0000') }),
    );
    expect(css(withAvatar.at(97, 106))).toBe('#ff0000');
    expect(css(withAvatar.at(97, 194))).toBe('#ff0000');
    expect(css(withAvatar.at(97, 98))).toBe(BACKGROUND);
    expect(css(withAvatar.at(147, 150))).toBe(BACKGROUND);
    // pas d'initiale par-dessus
    expect(withAvatar.count({ x: 60, y: 110, width: 74, height: 80 }, isColor(GOLD))).toBe(0);
  });

  // --- Texte de gauche -----------------------------------------------------------

  it('dessine « BRAVO » en capitales espacées, petit, en orange', () => {
    const bravo = card.box({ x: 160, y: 95, width: 140, height: 30 }, isOrange);
    expect(bravo).not.toBeNull();
    // 16 px (capitale de ~12 px) : le corps de 20 px de l'ancienne carte ferait 15 px
    expect(bravo?.height).toBeLessThanOrEqual(13);
    // les lettres espacées (la maquette : 68 px) ; sans espacement, ~48 px
    expect(bravo?.width).toBeGreaterThanOrEqual(62);
    expect(bravo?.width).toBeLessThanOrEqual(76);
    expect(bravo?.left).toBeGreaterThanOrEqual(TEXT_LEFT - 2);
    expect(bravo?.left).toBeLessThanOrEqual(TEXT_LEFT + 3);
    expect(card.count({ x: 160, y: 95, width: 140, height: 30 }, isColor(ACCENT))).toBeGreaterThan(
      20,
    );
  });

  it('dessine le pseudo en blanc gras, de la taille de la maquette (~42 px)', () => {
    const name = card.box({ x: 160, y: 118, width: 400, height: 62 }, isWhite);
    expect(name).not.toBeNull();
    expect(name?.left).toBeGreaterThanOrEqual(TEXT_LEFT);
    expect(name?.left).toBeLessThanOrEqual(TEXT_LEFT + 6);
    // « Faye » : 94 × 40 dans la maquette
    expect(name?.width).toBeGreaterThanOrEqual(88);
    expect(name?.width).toBeLessThanOrEqual(100);
    expect(name?.height).toBeGreaterThanOrEqual(36);
    expect(name?.height).toBeLessThanOrEqual(44);
  });

  it('dessine le sous-titre « passe au niveau supérieur » en gris clair de la maquette', () => {
    const subtitle = card.box({ x: 160, y: 178, width: 400, height: 30 }, isColor('#d6d3d1'));
    expect(subtitle).not.toBeNull();
    // 221 px de large dans la maquette
    expect(subtitle?.width).toBeGreaterThanOrEqual(205);
    expect(subtitle?.width).toBeLessThanOrEqual(235);
    expect(subtitle?.left).toBeGreaterThanOrEqual(TEXT_LEFT - 1);
  });

  // --- Hexagone ------------------------------------------------------------------

  it('dessine un hexagone à sommet pointu, au contour de 20 px, centré en x = 700', () => {
    // côtés verticaux à gauche et à droite : de 602,5 à 622,5, symétriques par rapport à 700
    for (const x of [606, 618, 782, 794]) expect(isStroke(card.at(x, 150)), `x = ${x}`).toBe(true);
    for (const x of [598, 630, 770, 802]) expect(isStroke(card.at(x, 150)), `x = ${x}`).toBe(false);
    // sommets pointus en haut et en bas (du haut y≈37 au bas y≈262)
    expect(isStroke(card.at(700, 40))).toBe(true);
    expect(isStroke(card.at(700, 260))).toBe(true);
    expect(isStroke(card.at(700, 34))).toBe(false);
    expect(isStroke(card.at(700, 266))).toBe(false);
    // un hexagone à sommet pointu n'a pas de côté horizontal : rien près du coin d'un côté plat
    expect(isStroke(card.at(660, 42))).toBe(false);
  });

  it('a un contour en dégradé : #f66a07 en haut à gauche, #f59405 en bas à droite', () => {
    // milieux des côtés haut-gauche et bas-droite, sur le trait
    const topLeft = card.at(656, 74);
    const bottomRight = card.at(744, 226);
    expect(topLeft[0]).toBeGreaterThanOrEqual(0xf0);
    expect(bottomRight[0]).toBeGreaterThanOrEqual(0xf0);
    expect(topLeft[2]).toBeLessThan(20);
    expect(bottomRight[2]).toBeLessThan(20);
    expect(topLeft[1]).toBeGreaterThan(0x66);
    expect(topLeft[1]).toBeLessThan(0x7e);
    expect(bottomRight[1]).toBeGreaterThan(0x80);
    expect(bottomRight[1]).toBeLessThan(0x98);
    expect(bottomRight[1] - topLeft[1]).toBeGreaterThanOrEqual(18);
  });

  it('dessine « NIVEAU » en petit, en capitales espacées et grises, centré au-dessus du chiffre', () => {
    const label = card.box({ x: 640, y: 88, width: 120, height: 30 }, isGrey);
    expect(label).not.toBeNull();
    // 13-14 px, lettres espacées : ~75 px de large dans la maquette, ~50 sans espacement
    expect(label?.width).toBeGreaterThanOrEqual(65);
    expect(label?.width).toBeLessThanOrEqual(90);
    expect(label?.height).toBeLessThanOrEqual(14);
    const centre = (label?.left ?? 0) + (label?.width ?? 0) / 2;
    expect(centre).toBeGreaterThanOrEqual(HEX.x - 6);
    expect(centre).toBeLessThanOrEqual(HEX.x + 6);
  });

  it("dessine le chiffre du niveau en gros (~96 px), blanc, centré dans l'hexagone", () => {
    const digits = card.box(DIGITS_REGION, isWhite);
    expect(digits).not.toBeNull();
    // « 24 » : 69 px de haut dans la maquette ; l'ancien corps de 72 px ne faisait que ~50 px
    expect(digits?.height).toBeGreaterThanOrEqual(62);
    expect(digits?.height).toBeLessThanOrEqual(74);
    const centre = (digits?.left ?? 0) + (digits?.width ?? 0) / 2;
    expect(centre).toBeGreaterThanOrEqual(HEX.x - 8);
    expect(centre).toBeLessThanOrEqual(HEX.x + 8);
    // l'intérieur de l'hexagone, à gauche du chiffre, est resté du fond
    expect(css(card.at(632, 150))).toBe(BACKGROUND);
  });

  it('dessine aussi le niveau 0', async () => {
    const zero = await decode(await renderLevelCard({ ...testData, level: 0 }));
    expect(zero.count(DIGITS_REGION, isWhite)).toBeGreaterThan(300);
  });

  it("le niveau 99 garde la taille du 24, le niveau 999 rétrécit et reste dans l'hexagone", async () => {
    const two = await digitsBoxOf(24);
    const ninetyNine = await digitsBoxOf(99);
    const big = await digitsBoxOf(999);
    expect(two).not.toBeNull();
    // même corps : la hauteur des glyphes ne varie que d'un pixel entre « 24 » et « 99 »
    expect(Math.abs((ninetyNine?.height ?? 0) - (two?.height ?? 0))).toBeLessThanOrEqual(2);
    // réellement plus petit : 999 en 96 px ferait ~165 px de large
    expect(big?.height).toBeLessThan((two?.height ?? 0) - 8);
    expect(big?.width).toBeLessThanOrEqual(140);
    // le chiffre ne touche jamais le contour : il reste en deçà du bord intérieur
    expect(big?.left).toBeGreaterThanOrEqual(HEX_INNER_LEFT + 4);
    expect(big?.right).toBeLessThanOrEqual(HEX.x * 2 - HEX_INNER_LEFT - 4);
  });

  it("n'écrase jamais le contour de l'hexagone avec 999 (le côté reste orange, sans blanc)", async () => {
    const big = await decode(await renderLevelCard({ ...testData, level: 999 }));
    const stroke = { x: 603, y: 112, width: 19, height: 76 };
    expect(big.count(stroke, isWhite)).toBe(0);
    expect(big.count({ x: 778, y: 112, width: 19, height: 76 }, isWhite)).toBe(0);
  });

  // --- Pseudo long : ne jamais entrer dans l'hexagone -----------------------------

  it.each([
    ['32 « W » (caractères larges)', 'W'.repeat(32)],
    ['100 « X »', 'X'.repeat(100)],
    ['un pseudo long en minuscules larges', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm'],
  ])("tronque le pseudo de %s avant l'hexagone", async (_label, displayName) => {
    const long = await decode(await renderLevelCard({ ...testData, displayName, level: 5 }));
    const nameBand = { x: 160, y: 118, width: 440, height: 62 };
    const drawn = long.box(nameBand, isWhite);
    expect(drawn).not.toBeNull();
    // le texte est bien dessiné jusqu'à près de la limite (pas tronqué à l'excès)…
    expect(drawn?.right).toBeGreaterThan(NAME_RIGHT_LIMIT - 80);
    // …mais jamais au-delà de la limite
    expect(drawn?.right).toBeLessThanOrEqual(NAME_RIGHT_LIMIT);
    // aucun blanc de texte entre la limite et l'intérieur de l'hexagone, sur toute la hauteur
    const gap = {
      x: Math.floor(NAME_RIGHT_LIMIT) + 1,
      y: 60,
      width: 628 - Math.floor(NAME_RIGHT_LIMIT),
      height: 180,
    };
    expect(long.count(gap, isWhite)).toBe(0);
    // le côté de l'hexagone reste orange, jamais traversé par le blanc du pseudo
    expect(css(long.at(606, 150))).not.toBe('#ffffff');
    expect(isOrange(long.at(612, 150))).toBe(true);
  });

  // --- Partie droite : plus de panneau ------------------------------------------

  it("ne dessine plus de panneau « RÔLE DÉBLOQUÉ » : à droite de l'hexagone, seulement du fond et des confettis", () => {
    const region = { x: 815, y: 50, width: 170, height: 200 };
    let drawn = 0;
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        if (!farFromBackground(card.at(x, y))) continue;
        drawn++;
        const nearConfetti = CONFETTI.some((piece) => Math.hypot(piece.x - x, piece.y - y) <= 11);
        expect(nearConfetti, `pixel (${x}, ${y}) = ${css(card.at(x, y))}`).toBe(true);
      }
    }
    // les confettis de cette zone sont bien là : le test ne passe pas à vide
    expect(drawn).toBeGreaterThan(40);
  });

  // --- Confettis -----------------------------------------------------------------

  it.each(CONFETTI.map((piece) => [`(${piece.x}, ${piece.y})`, piece] as const))(
    'dessine un confetti %s de sa couleur fixe',
    (_label, piece) => {
      expect(css(card.at(piece.x, piece.y))).toBe(piece.color);
    },
  );

  it("n'a aucun confetti sur le texte, sur l'avatar ni dans l'hexagone", () => {
    // apothème extérieur de l'hexagone (97,5) + 14 px de marge pour la demi-longueur d'un confetti
    const apothem = HEX.x - HEX_OUTER_LEFT + 14;
    for (const piece of CONFETTI) {
      const dx = Math.abs(piece.x - HEX.x);
      const dy = Math.abs(piece.y - HEX.y);
      const inHexagon = dx <= apothem && dx * 0.5 + dy * Math.cos(Math.PI / 6) <= apothem;
      const onText = piece.x > 150 && piece.x < 600 && piece.y > 95 && piece.y < 215;
      const onAvatar = Math.hypot(piece.x - 97, piece.y - 150) < 56;
      expect(inHexagon || onText || onAvatar, `confetti (${piece.x}, ${piece.y})`).toBe(false);
    }
  });

  // --- Sanitisation ------------------------------------------------------------

  it('ne dessine pas les marques bidi ni les contrôles du pseudo (rendu identique à « Faye »)', async () => {
    const dirty = await renderLevelCard({
      ...testData,
      displayName: 'Fa‎y‮\u0007e⁦',
    });
    const clean = await renderLevelCard({ ...testData, displayName: 'Faye' });
    expect(dirty.equals(clean)).toBe(true);
  });

  // --- encode ------------------------------------------------------------------

  it('encode le PNG avec canvas.encode (hors du thread principal), jamais toBuffer', async () => {
    created.canvases.length = 0;
    await renderLevelCard(testData);

    const canvases = created.canvases.filter((canvas) => canvas.width === LEVEL_CARD_SIZE.width);
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.encode).toHaveBeenCalledExactlyOnceWith('png');
    expect(canvases[0]?.toBuffer).not.toHaveBeenCalled();
  });

  // --- Sécurité : avatars trop grands ------------------------------------------

  it.each([
    ['dont la largeur dépasse MAX_AVATAR_SIDE', () => redAvatar(MAX_AVATAR_SIDE + 1, 8)],
    ['dont la hauteur dépasse MAX_AVATAR_SIDE', () => redAvatar(8, MAX_AVATAR_SIDE + 1)],
    ['sans taille lisible', () => Buffer.from('not-an-image')],
  ])(
    "rejette les avatars %s : jamais décodés, l'initiale à la place",
    async (_label, makeAvatar) => {
      vi.mocked(loadImage).mockClear();
      const refusedPng = await renderLevelCard({ ...testData, avatar: makeAvatar() });
      // avant decode() : le décodage de contrôle du test appelle lui aussi loadImage
      expect(loadImage).not.toHaveBeenCalled();
      const refused = await decode(refusedPng);
      // pas de rouge dans le disque : c'est le disque d'initiale
      expect(css(refused.at(97, 106))).toBe(INITIAL_BG);
      expect(refused.count({ x: 49, y: 102, width: 96, height: 96 }, isColor('#ff0000'))).toBe(0);
      expect(
        refused.count({ x: 85, y: 130, width: 26, height: 40 }, isColor(GOLD)),
      ).toBeGreaterThan(30);
    },
  );

  it("bombe PNG (en-tête 23 000 × 23 000, quelques octets) : jamais décodée, l'initiale", async () => {
    const bomb = pngBomb(23_000, 23_000);
    expect(bomb.length).toBeLessThan(100);
    vi.mocked(loadImage).mockClear();

    const pngSafe = await renderLevelCard({ ...testData, avatar: bomb });

    expect(loadImage).not.toHaveBeenCalled();
    // La carte est quand même rendue, avec l'initiale à la place de l'avatar
    expect(pngSafe.readUInt32BE(16)).toBe(LEVEL_CARD_SIZE.width);
    expect(css((await decode(pngSafe)).at(97, 190))).toBe(INITIAL_BG);
  });
});

// --- Tests de levelUpReply (intégration Discord) -------------------------------

/** La description (texte alternatif) de la pièce jointe renvoyée. */
const altTextOf = (result: Awaited<ReturnType<typeof levelUpReply>>) =>
  'files' in result ? result.files[0]?.description : undefined;

describe('levelUpReply', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const input: LevelCardInput = {
    displayName: 'Faye',
    level: 5,
    avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.png',
  };

  it('renvoie une pièce jointe PNG en cas de succès', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));
    const result = await levelUpReply(input, { render });

    expect(render).toHaveBeenCalledOnce();
    expect(result).toEqual({
      files: [expect.anything()],
    });
  });

  it("passe l'avatar chargé au rendu", async () => {
    const loadAvatar = vi.fn().mockResolvedValue(solidAvatar('#ff0000'));
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));

    await levelUpReply(input, { loadAvatar, render });

    expect(loadAvatar).toHaveBeenCalledWith(input.avatarUrl);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: solidAvatar('#ff0000') }),
    );
  });

  it("charge l'avatar avec fetchAvatar par défaut si loadAvatar n'est pas fourni", async () => {
    vi.mocked(fetchAvatar).mockResolvedValue(solidAvatar('#00ff00'));
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));

    await levelUpReply(input, { render });

    expect(fetchAvatar).toHaveBeenCalledExactlyOnceWith(input.avatarUrl);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: solidAvatar('#00ff00') }),
    );
  });

  it("rend quand même la carte, sans avatar (initiale), si le chargement de l'avatar échoue", async () => {
    const loadAvatar = vi.fn().mockRejectedValue(new Error('réseau coupé'));
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));

    const result = await levelUpReply(input, { loadAvatar, render });

    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ avatar: null }));
    expect(result).toEqual({ files: [expect.anything()] });
  });

  it("replie sur un embed en cas d'erreur de rendu, sans rien journaliser de personnel (comme la carte de rang)", async () => {
    const failure = new Error(`Canvas error pour ${input.displayName} ${input.avatarUrl}`);
    const render = vi.fn().mockRejectedValue(failure);
    const logger = { warn: vi.fn() };

    const result = await levelUpReply(input, { render, logger });

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith({}, expect.any(String));
    expect(result).toEqual({ embeds: [expect.anything()] });
  });

  it("l'embed de repli est un vrai EmbedBuilder aux couleurs du bot, avec le niveau et le pseudo", async () => {
    const render = vi.fn().mockRejectedValue(new Error('fail'));
    const result = await levelUpReply(input, { render });

    const embeds = 'embeds' in result ? result.embeds : undefined;
    expect(embeds).toHaveLength(1);
    expect(embeds?.[0]).toBeInstanceOf(EmbedBuilder);
    const json = embeds?.[0]?.toJSON();
    expect(json?.color).toBe(baseEmbed().toJSON().color);
    expect(json?.description).toContain('**Faye**');
    expect(json?.description).toContain('niveau 5');
  });

  it("assainit le pseudo dans l'embed de repli (marques bidi et contrôles retirés)", async () => {
    const render = vi.fn().mockRejectedValue(new Error('fail'));
    const result = await levelUpReply({ ...input, displayName: 'Fa‮y‎\u0007e' }, { render });

    const embeds = 'embeds' in result ? result.embeds : undefined;
    expect(embeds?.[0]?.toJSON().description).toBe('**Faye** est passé au **niveau 5** !');
  });

  it('le texte alternatif contient le pseudo et le niveau atteint', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));
    const five = altTextOf(await levelUpReply(input, { render }));
    const twentyFour = altTextOf(await levelUpReply({ ...input, level: 24 }, { render }));

    expect(five).toContain('Faye');
    expect(five).toContain('niveau 5');
    expect(five).not.toContain('niveau 24');
    expect(twentyFour).toContain('niveau 24');
    expect(twentyFour).not.toContain('niveau 5');
  });

  it('assainit le pseudo du texte alternatif', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));
    const description = altTextOf(
      await levelUpReply({ ...input, displayName: 'Fa‮y‎e' }, { render }),
    );

    expect(description).toContain('Faye');
    expect(description).not.toMatch(/[‎‮]/u);
  });

  it('gère un pseudo de 100 000 caractères : texte alternatif borné à 1 024, niveau conservé', async () => {
    const longInput: LevelCardInput = {
      ...input,
      displayName: 'X'.repeat(100_000),
    };

    const render = vi.fn().mockResolvedValue(Buffer.from('fake-png'));

    const result = await levelUpReply(longInput, { render });

    const description = altTextOf(result);
    expect(description?.length).toBeLessThanOrEqual(1_024);
    // le pseudo est raccourci, jamais le reste de la phrase
    expect(description).toContain('niveau 5');
  });
});

// --- Sécurité : bombes PNG -----------------------------------------------------

/** Un chunk PNG : longueur, type, données, CRC. */
function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Un PNG de quelques dizaines d'octets dont l'IHDR annonce largeur × hauteur (CRC valides). */
function pngBomb(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(64))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
