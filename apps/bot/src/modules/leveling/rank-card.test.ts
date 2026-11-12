import zlib from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { totalXpForLevel, xpToNextLevel } from '@phenix/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CARD_FONT_FAMILIES,
  cardFontStack,
  registerCardFonts,
  type CardFontRole,
} from '../../core/cards/fonts.js';
import { MAX_AVATAR_SIDE } from '../../core/cards/image-size.js';

// loadImage espionné (il appelle toujours le vrai) : prouve qu'un avatar refusé n'est jamais décodé.
vi.mock('@napi-rs/canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
  return { ...actual, loadImage: vi.fn(actual.loadImage) };
});
import {
  formatNumber,
  progressBar,
  RANK_CARD_SIZE,
  rankEmbed,
  rankReply,
  renderRankCard,
  ringSweep,
  type RankCardData,
  type RankCardInput,
} from './rank-card.js';

describe('progressBar', () => {
  it('remplit la barre selon l’avancement, sans déborder', () => {
    expect(progressBar(0, 4)).toBe('▱▱▱▱');
    expect(progressBar(0.5, 4)).toBe('▰▰▱▱');
    expect(progressBar(1.4, 4)).toBe('▰▰▰▰');
  });
});

describe('rankEmbed', () => {
  it('montre le niveau, la place et l’XP restante', () => {
    const embed = rankEmbed({
      rank: { xp: 355, messages: 18, rank: 2, total: 40 },
      displayName: 'Agent',
      avatarUrl: 'https://cdn/avatar.png',
    }).toJSON();

    expect(embed.fields?.map((field) => field.value)).toEqual([
      '**2**',
      '**#2** sur 40',
      '355',
      '▰▰▰▰▰▱▱▱▱▱▱▱  100 / 220 XP',
    ]);
    expect(embed.fields?.[3]?.name).toBe('Vers le niveau 3');
  });
});

describe('ringSweep', () => {
  it('0 % : rien à dessiner, l’arc part du haut', () => {
    const { percent, endAngle } = ringSweep(0);
    expect(percent).toBe(0);
    expect(endAngle).toBeCloseTo(-Math.PI / 2);
  });

  it('50 % : un demi-tour horaire, la fin est en bas', () => {
    const { percent, endAngle } = ringSweep(0.5);
    expect(percent).toBe(50);
    expect(endAngle).toBeCloseTo(Math.PI / 2);
  });

  it('100 % : un tour complet', () => {
    const { percent, endAngle } = ringSweep(1);
    expect(percent).toBe(100);
    expect(endAngle).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('borne les ratios hors de 0..1 et NaN', () => {
    expect(ringSweep(1.4)).toEqual(ringSweep(1));
    expect(ringSweep(-0.2)).toEqual(ringSweep(0));
    expect(ringSweep(Number.NaN)).toEqual(ringSweep(0));
    expect(ringSweep(Number.POSITIVE_INFINITY)).toEqual(ringSweep(1));
  });

  it('arrondit le pourcentage à l’entier le plus proche', () => {
    expect(ringSweep(0.644).percent).toBe(64);
    expect(ringSweep(0.995).percent).toBe(100);
    expect(ringSweep(0.004).percent).toBe(0);
  });

  it('l’angle de fin suit le ratio, pas le pourcentage arrondi', () => {
    expect(ringSweep(0.25).endAngle).toBeCloseTo(0);
    expect(ringSweep(0.644).endAngle).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI * 0.644);
  });
});

// --- Dessin ---------------------------------------------------------------------------------

const ACCENT = '#f5aa04';
const TRACK = '#2b1b12';
const BACKGROUND = '#140c08';
const INITIAL_DISC = '#50260b';

/**
 * Géométrie de la maquette : la carte a une bordure de 2 px et `padding: 0 48px`, donc le contenu
 * démarre à x = 50. La boîte de l'anneau (224 × 224) est à left = 50, top = 38 : centre de l'anneau
 * et de l'avatar = (162, 150), rayon d'anneau 104, trait 12 (de 98 à 110), disque d'avatar de
 * rayon 88 (carré de l'avatar : x de 74 à 250, y de 62 à 238).
 * La pastille de niveau fait 64 × 64 (right 2, bottom 6) : x de 208 à 272, y de 192 à 256,
 * centre (240, 224), disque accent de rayon 26 à l'intérieur.
 */
const RING_CENTER = { x: 162, y: 150 };
const RING_RIGHT = { x: 266, y: 150 };
const RING_LEFT = { x: 58, y: 150 };
const AVATAR_CENTER = RING_CENTER;
/** Dans le disque (à 75 px du centre), hors de la lettre d'initiale (72 px de haut, centrée) et de la pastille. */
const DISC_BELOW_INITIAL = { x: 162, y: 225 };
/** Dans la pastille de niveau (centre (240, 224), rayon intérieur 26), au-dessus du chiffre. */
const LEVEL_BADGE = { x: 240, y: 201 };
/** Le bord de l'anneau est à 98 (intérieur) et 110 (extérieur) du centre, le disque d'avatar à 88. */
const ringPoint = (direction: 'right' | 'left' | 'bottom', distance: number): Point => {
  if (direction === 'right') return { x: RING_CENTER.x + distance, y: RING_CENTER.y };
  if (direction === 'left') return { x: RING_CENTER.x - distance, y: RING_CENTER.y };
  return { x: RING_CENTER.x, y: RING_CENTER.y + distance };
};
/** Bande à droite du contenu (il s'arrête à x = 950), sous les coins arrondis et hors de la bordure. */
const RIGHT_BAND: Region = { x: 955, y: 40, width: 41, height: 220 };

/** Progression de 64 % au niveau 24 : « Faye » de la maquette. */
const LEVEL_24 = totalXpForLevel(24);
const NEEDED_24 = xpToNextLevel(24);
const faye: RankCardData = {
  rank: { xp: LEVEL_24 + Math.round(0.64 * NEEDED_24), messages: 2431, rank: 3, total: 412 },
  displayName: 'Faye',
  guildName: 'Les Agents',
  avatar: null,
};
/**
 * Valeurs de référence de `faye`, écrites en dur. Sur la carte, l'espace des milliers est l'espace
 * insécable U+00A0 (l'U+202F de toLocaleString est trop étroite en Inter 16 px) :
 * 5 × 24² + 50 × 24 + 100 = 4 180 XP pour passer au niveau 25, dont 2 675 (64 %) déjà gagnés.
 */
const FAYE_TOTAL_XP = '40 495';
const FAYE_MESSAGES = '2 431';
const FAYE_REMAINING_XP = '1 505';

type Point = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };

/** Décode un PNG et rend un contexte d'où lire les pixels. */
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
  if (a === 0) return 'transparent';
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Combien de pixels de la zone sont opaques et ont exactement cette couleur. */
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

const area = ({ width, height }: Region) => width * height;

/** Un avatar uni, 64×64, comme Discord en renverrait un (PNG). */
function solidAvatar(color: string): Buffer {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toBuffer('image/png');
}

/** Un avatar de 256 px : moitié gauche rouge, moitié droite bleue. */
function twoHalvesCanvas() {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(128, 0, 128, 256);
  return canvas;
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

/** Un avatar PNG rouge uni de largeur × hauteur. */
function redAvatar(width: number, height = width) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width, height);
  return canvas.encode('png');
}

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
    Buffer.from(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(64))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Tout le texte que le rendu demande de dessiner, dans l'ordre : de quoi vérifier ce qui est
 * affiché sans lire des pixels de lettres. Le texte doit passer par `ctx.fillText`
 * (`ctx.letterSpacing` reste permis pour l'espacement ; pas de dessin lettre par lettre).
 */
async function drawnTexts(data: RankCardData) {
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
    fillText: (...params: unknown[]) => unknown;
  };
  const spy = vi.spyOn(proto, 'fillText');
  try {
    const png = await renderRankCard(data);
    return { png, texts: spy.mock.calls.map(([drawn]) => String(drawn)) };
  } finally {
    spy.mockRestore();
  }
}

/** Un des textes dessinés (espaces de bord ignorés) est exactement la chaîne, ou correspond au motif. */
const hasText = (texts: string[], expected: string | RegExp) =>
  texts.some((drawn) =>
    typeof expected === 'string' ? drawn.trim() === expected : expected.test(drawn.trim()),
  );

/** Tous les textes bout à bout, espaces ordinaires et retours réduits à un (l'espace insécable des nombres est gardée). */
const joined = (texts: string[]) => texts.join(' ').replace(/[ \n]+/g, ' ');

/** Une moitié de paire de substitution sans l'autre : un emoji coupé en deux. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

describe('formatNumber', () => {
  it('sépare les milliers par une espace fine insécable (U+202F), à la française', () => {
    // valeur de référence écrite en dur : la ligne ci-dessous contient bien un U+202F
    expect(formatNumber(12345)).toBe('12 345');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('RANK_CARD_SIZE', () => {
  it('fait 1000 × 300', () => {
    expect(RANK_CARD_SIZE).toEqual({ width: 1000, height: 300 });
  });
});

describe('renderRankCard', () => {
  beforeAll(() => {
    registerCardFonts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produit un PNG de 1000 × 300', async () => {
    expect(pngInfo(await renderRankCard(faye))).toEqual(pngOf(1000, 300));
  });

  it('dessine le fond, la bordure de 2 px et des coins arrondis', async () => {
    const png = await renderRankCard(faye);
    expect(await colorAt(png, { x: 990, y: 150 })).toBe(BACKGROUND);
    expect(await colorAt(png, { x: 500, y: 1 })).toBe(TRACK);
    expect(await colorAt(png, { x: 0, y: 0 })).toBe('transparent');
  });

  it('64 % : l’anneau est accent à droite (arc) et piste à gauche', async () => {
    const png = await renderRankCard(faye);
    expect(await colorAt(png, RING_RIGHT)).toBe(ACCENT);
    expect(await colorAt(png, RING_LEFT)).toBe(TRACK);
  });

  it('presque 100 % : l’arc a passé la gauche', async () => {
    const png = await renderRankCard({
      ...faye,
      rank: { ...faye.rank, xp: LEVEL_24 + NEEDED_24 - 1 },
    });
    expect(await colorAt(png, RING_LEFT)).toBe(ACCENT);
  });

  it('0 % : l’arc n’est pas dessiné, même pas son bout rond', async () => {
    const png = await renderRankCard({ ...faye, rank: { ...faye.rank, xp: LEVEL_24 } });
    expect(await colorAt(png, RING_RIGHT)).toBe(TRACK);
    expect(await colorAt(png, { x: 162, y: 46 })).toBe(TRACK);
  });

  it('moins de 0,5 % (affiché « 0 % ») : pas d’arc non plus, même pas son bout rond', async () => {
    const png = await renderRankCard({
      ...faye,
      rank: { ...faye.rank, xp: LEVEL_24 + Math.round(0.004 * NEEDED_24) },
    });
    expect(await colorAt(png, { x: 162, y: 46 })).toBe(TRACK);
  });

  describe('géométrie de l’anneau (rayon 104, trait de 98 à 110)', () => {
    // 108 et non 109 : un pixel qui touche le bord extérieur exact du trait (rayon 110) perd ~2 %
    // de couverture à cause de la courbure, quel que soit le tracé (mesuré avec Skia)
    it.each([99, 108])(
      'à %i px du centre : accent sur l’arc (droite, bas), piste au-delà (gauche)',
      async (distance) => {
        const png = await renderRankCard(faye); // 64 % : de 0° à 230° dans le sens horaire depuis le haut
        expect(await colorAt(png, ringPoint('right', distance))).toBe(ACCENT);
        expect(await colorAt(png, ringPoint('bottom', distance))).toBe(ACCENT);
        expect(await colorAt(png, ringPoint('left', distance))).toBe(TRACK);
      },
    );

    it.each([94, 114])(
      'à %i px du centre (entre le disque et l’anneau, ou au-delà) : le fond',
      async (distance) => {
        const png = await renderRankCard(faye);
        for (const direction of ['right', 'bottom', 'left'] as const) {
          expect(await colorAt(png, ringPoint(direction, distance))).toBe(BACKGROUND);
        }
      },
    );
  });

  it('la pastille de niveau est accent, en bas à droite de l’avatar', async () => {
    expect(await colorAt(await renderRankCard(faye), LEVEL_BADGE)).toBe(ACCENT);
  });

  it('sans avatar : le disque de l’initiale', async () => {
    const png = await renderRankCard({ ...faye, avatar: null });
    expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
  });

  it('avec un avatar : son image remplit le disque, découpée en rond', async () => {
    const png = await renderRankCard({ ...faye, avatar: solidAvatar('#ff0000') });
    expect(await colorAt(png, AVATAR_CENTER)).toBe('#ff0000');
    expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe('#ff0000');
    // un coin du carré de l'avatar (x de 74 à 250, y de 62 à 238), hors du disque : le fond de la carte
    expect(await colorAt(png, { x: 76, y: 64 })).toBe(BACKGROUND);
  });

  describe('avatar à deux moitiés (gauche rouge, droite bleue, 256 px)', () => {
    const LEFT_EDGE = { x: AVATAR_CENTER.x - 80, y: AVATAR_CENTER.y };
    const RIGHT_EDGE = { x: AVATAR_CENTER.x + 80, y: AVATAR_CENTER.y };

    it('PNG : le bord gauche du disque est rouge, le bord droit bleu (ni miroir, ni décalage)', async () => {
      const png = await renderRankCard({
        ...faye,
        avatar: twoHalvesCanvas().toBuffer('image/png'),
      });
      expect(await colorAt(png, LEFT_EDGE)).toBe('#ff0000');
      expect(await colorAt(png, RIGHT_EDGE)).toBe('#0000ff');
    });

    it('WebP : dessiné pareil', async () => {
      // qualité 100 : à la qualité par défaut, l'encodage WebP est avec perte (le rouge devient #ff0100)
      const webp = await twoHalvesCanvas().encode('webp', 100);
      expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
      const png = await renderRankCard({ ...faye, avatar: webp });
      expect(await colorAt(png, LEFT_EDGE)).toBe('#ff0000');
      expect(await colorAt(png, RIGHT_EDGE)).toBe('#0000ff');
    });
  });

  it.each([
    ['du HTML', Buffer.from('<html>pas une image</html>')],
    ['un Buffer vide', Buffer.alloc(0)],
  ])(
    'un avatar illisible (%s) : la carte reste, seul l’avatar est perdu (le disque de l’initiale)',
    async (_name, avatar) => {
      const png = await renderRankCard({ ...faye, avatar });
      expect(pngInfo(png)).toEqual(pngOf(1000, 300));
      expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
    },
  );

  it('est déterministe : deux rendus identiques donnent les mêmes octets', async () => {
    const [first, second] = await Promise.all([renderRankCard(faye), renderRankCard(faye)]);
    expect(first.equals(second)).toBe(true);
  });

  describe('texte dessiné (via ctx.fillText)', () => {
    // un seul rendu pour tout le groupe ; s'il échoue, chaque test échoue avec la même cause
    let rendering: Promise<string[]> | undefined;
    const drawn = () => (rendering ??= drawnTexts(faye).then(({ texts }) => texts));

    it('en-tête : le nom du serveur en majuscules, puis « CLASSEMENT », chacun d’un seul tenant', async () => {
      const texts = await drawn();
      expect(texts.some((line) => line.includes('LES AGENTS'))).toBe(true);
      expect(texts.some((line) => line.includes('CLASSEMENT'))).toBe(true);
    });

    it('le pseudo, d’un seul tenant', async () => {
      const texts = await drawn();
      expect(texts.some((line) => line.includes('Faye'))).toBe(true);
    });

    it('le rang « #3 » et le total « 412 » (appels séparés tolérés)', async () => {
      const texts = await drawn();
      const all = joined(texts);
      expect(all).toContain('#3');
      expect(all).toContain('412');
    });

    it('la progression : « 64 » (le « % » peut être à part)', async () => {
      const texts = await drawn();
      expect(hasText(texts, /^64( ?%)?$/)).toBe(true);
    });

    it('l’XP totale et les messages, formatés à la française', async () => {
      const texts = await drawn();
      expect(hasText(texts, FAYE_TOTAL_XP)).toBe(true);
      expect(hasText(texts, FAYE_MESSAGES)).toBe(true);
    });

    it('le niveau « 24 » dans la pastille', async () => {
      const texts = await drawn();
      expect(hasText(texts, '24')).toBe(true);
    });

    it.each(['Classement', 'Progression', 'XP totale', 'Messages'])(
      'le libellé « %s »',
      async (label) => {
        const texts = await drawn();
        expect(hasText(texts, label)).toBe(true);
      },
    );

    it('la place au classement n’est jamais étiquetée « Rang » (glossaire : « rang » = palier Dark Zone)', async () => {
      const texts = await drawn();
      expect(texts.filter((drawnText) => /\brang\b/i.test(drawnText))).toEqual([]);
    });

    it('aucun texte dessiné ne contient l’espace fine U+202F (trop étroite en Inter 16 px)', async () => {
      const texts = await drawn();
      expect(texts.filter((drawnText) => drawnText.includes(' '))).toEqual([]);
      // témoin : il y a bien des nombres à milliers sur la carte
      expect(texts.some((drawnText) => drawnText.includes(' '))).toBe(true);
    });

    it('ce qu’il reste jusqu’au niveau suivant : « Encore 1 505 XP avant le niveau 25 »', async () => {
      const texts = await drawn();
      const all = joined(texts);
      expect(all).toContain('Encore');
      expect(all).toContain(`${FAYE_REMAINING_XP} XP`);
      expect(all).toMatch(/avant le niveau 25/);
    });

    it('aucun « undefined » ni NaN', async () => {
      const texts = await drawn();
      expect(joined(texts)).not.toMatch(/undefined|NaN|null/);
    });
  });

  it('niveau 0 : le « 0 » de la pastille est dessiné, pas sauté', async () => {
    // 50 XP : niveau 0 à 50 % ; aucun autre texte ne vaut exactement « 0 »
    const { texts } = await drawnTexts({
      ...faye,
      rank: { xp: 50, messages: 5, rank: 1, total: 1 },
    });
    expect(hasText(texts, '0')).toBe(true);
    expect(hasText(texts, /^50( ?%)?$/)).toBe(true);
  });

  it('un nom de serveur vide : aucun texte ne commence par « · »', async () => {
    const { texts } = await drawnTexts({ ...faye, guildName: '' });
    expect(texts.some((drawn) => drawn.startsWith(' · '))).toBe(false);
    expect(texts.some((drawn) => drawn.includes('CLASSEMENT'))).toBe(true);
  });

  describe('un pseudo trop long ne déborde pas', () => {
    it('200 « W » : raccourci par « … », et rien ne dépasse à droite', async () => {
      // témoin : la bande de droite est vide sur une carte normale, donc le contrôle a un sens
      expect(await countColor(await renderRankCard(faye), RIGHT_BAND, BACKGROUND)).toBe(
        area(RIGHT_BAND),
      );

      const { png, texts } = await drawnTexts({ ...faye, displayName: 'W'.repeat(200) });

      expect(texts.some((drawn) => drawn.includes('W'.repeat(200)))).toBe(false);
      expect(
        texts.some((drawn) => drawn.startsWith('W') && drawn.endsWith('…') && drawn.length < 200),
      ).toBe(true);
      expect(await countColor(png, RIGHT_BAND, BACKGROUND)).toBe(area(RIGHT_BAND));
    });

    it('un nom de serveur de 200 caractères : rien ne dépasse à droite non plus', async () => {
      const png = await renderRankCard({ ...faye, guildName: 'Les Agents '.repeat(20) });
      expect(pngInfo(png)).toEqual(pngOf(1000, 300));
      expect(await countColor(png, RIGHT_BAND, BACKGROUND)).toBe(area(RIGHT_BAND));
    });

    it('un pseudo d’emojis raccourci ne coupe aucun emoji en deux', async () => {
      const { texts } = await drawnTexts({ ...faye, displayName: '🔥'.repeat(100) });
      expect(texts.some((drawn) => drawn.startsWith('🔥') && drawn.endsWith('…'))).toBe(true);
      expect(texts.filter((drawn) => LONE_SURROGATE.test(drawn))).toEqual([]);
    });
  });

  it('un pseudo avec des emojis, assez court : écrit en entier', async () => {
    const { texts } = await drawnTexts({ ...faye, displayName: '🔥🔥🔥 Faye 🎮👩‍🚀' });
    expect(texts.some((drawn) => drawn.includes('🔥🔥🔥 Faye 🎮👩‍🚀'))).toBe(true);
  });

  it('un pseudo vide : l’initiale de repli « ? » dans le disque', async () => {
    const { png, texts } = await drawnTexts({ ...faye, displayName: '' });
    expect(hasText(texts, '?')).toBe(true);
    expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
  });

  it('dessine une carte pour un membre à 0 XP (niveau 0)', async () => {
    const png = await renderRankCard({ ...faye, rank: { xp: 0, messages: 0, rank: 1, total: 1 } });
    expect(pngInfo(png)).toEqual(pngOf(1000, 300));
    expect(await colorAt(png, RING_RIGHT)).toBe(TRACK);
  });

  it('dessine une carte pour un classement d’un seul membre', async () => {
    const { png, texts } = await drawnTexts({ ...faye, rank: { ...faye.rank, rank: 1, total: 1 } });
    expect(pngInfo(png)).toEqual(pngOf(1000, 300));
    expect(joined(texts)).toContain('#1');
  });

  it('nombres à 7 chiffres : écrits en entier (jamais tronqués), sans déborder', async () => {
    const { png, texts } = await drawnTexts({
      ...faye,
      rank: { xp: 9_999_999, messages: 9_999_999, rank: 9_999, total: 9_999 },
    });
    expect(pngInfo(png)).toEqual(pngOf(1000, 300));
    expect(texts.filter((drawn) => drawn.includes('9 999 999')).length).toBeGreaterThanOrEqual(2);
    expect(texts.filter((drawn) => drawn.includes('…'))).toEqual([]);
    expect(await countColor(png, RIGHT_BAND, BACKGROUND)).toBe(area(RIGHT_BAND));
  });

  it('encode le PNG avec canvas.encode (hors du thread principal), jamais toBuffer', async () => {
    const proto = Object.getPrototypeOf(createCanvas(1, 1)) as {
      encode: (...params: unknown[]) => unknown;
      toBuffer: (...params: unknown[]) => unknown;
    };
    const encode = vi.spyOn(proto, 'encode');
    const toBuffer = vi.spyOn(proto, 'toBuffer');

    const png = await renderRankCard(faye);

    expect(encode).toHaveBeenCalledWith('png');
    expect(toBuffer).not.toHaveBeenCalled();
    expect(pngInfo(png)).toEqual(pngOf(1000, 300));
  });

  describe('dimensions de l’avatar lues dans l’en-tête, avant tout décodage', () => {
    const loadImageMock = vi.mocked(loadImage);

    it('MAX_AVATAR_SIDE vaut 1 024', () => {
      expect(MAX_AVATAR_SIDE).toBe(1024);
    });

    it.each([1000, 1024])('un PNG de %i px de côté : accepté et dessiné', async (side) => {
      const avatar = await redAvatar(side);
      loadImageMock.mockClear();
      const png = await renderRankCard({ ...faye, avatar });
      expect(loadImageMock).toHaveBeenCalledTimes(1);
      expect(await colorAt(png, AVATAR_CENTER)).toBe('#ff0000');
    });

    it('un JPEG réel : accepté et dessiné (pas l’initiale)', async () => {
      const canvas = createCanvas(256, 256);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 256, 256);
      const png = await renderRankCard({ ...faye, avatar: await canvas.encode('jpeg', 100) });
      const center = await colorAt(png, AVATAR_CENTER);
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(center.slice(i, i + 2), 16));
      expect(r).toBeGreaterThan(240);
      expect(g).toBeLessThan(16);
      expect(b).toBeLessThan(16);
    });

    it.each([
      [1025, 1025],
      [1025, 64],
      [64, 1025],
    ])(
      '%i × %i : refusé sans décodage (loadImage jamais appelé), l’initiale à la place',
      async (width, height) => {
        const avatar = await redAvatar(width, height);
        loadImageMock.mockClear();
        const png = await renderRankCard({ ...faye, avatar });
        expect(loadImageMock).not.toHaveBeenCalled();
        expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
      },
    );

    it('bombe PNG (en-tête 23 000 × 23 000, quelques octets) : l’initiale, vite, sans allocation géante', async () => {
      const bomb = pngBomb(23_000, 23_000);
      expect(bomb.length).toBeLessThan(100);
      loadImageMock.mockClear();
      const rssBefore = process.memoryUsage().rss;
      const start = performance.now();

      const png = await renderRankCard({ ...faye, avatar: bomb });

      const elapsed = performance.now() - start;
      const grown = process.memoryUsage().rss - rssBefore;
      expect(loadImageMock).not.toHaveBeenCalled();
      expect(elapsed).toBeLessThan(1000);
      // décodée, cette image demanderait 23 000 × 23 000 × 4 octets ≈ 2,1 Go
      expect(grown).toBeLessThan(256 * 1024 * 1024);
      expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
    });

    it('un en-tête PNG valide (64 × 64) sans les données : décodage tenté, il échoue, l’initiale', async () => {
      // les avatars « illisibles » ci-dessus s'arrêtent désormais à l'en-tête : ce cas garde le
      // chemin où loadImage lève bel et bien
      const truncated = (await redAvatar(64)).subarray(0, 33);
      loadImageMock.mockClear();
      const png = await renderRankCard({ ...faye, avatar: truncated });
      expect(loadImageMock).toHaveBeenCalledTimes(1);
      await expect(loadImageMock.mock.results[0]?.value).rejects.toThrow('Unsupported image type');
      expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
    });

    it('un en-tête illisible (du HTML) : pas de décodage non plus', async () => {
      loadImageMock.mockClear();
      await renderRankCard({ ...faye, avatar: Buffer.from('<html>pas une image</html>') });
      expect(loadImageMock).not.toHaveBeenCalled();
    });
  });

  describe('noms nettoyés : caractères de contrôle et de direction retirés', () => {
    const CONTROL_OR_BIDI = /[\p{Cc}\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/u;

    it('U+202E dans le nom du serveur n’apparaît dans aucun appel fillText', async () => {
      const { texts } = await drawnTexts({ ...faye, guildName: 'Les\u202eAgents' });
      expect(texts.filter((drawn) => drawn.includes('\u202e'))).toEqual([]);
      expect(texts.some((drawn) => drawn.includes('LESAGENTS'))).toBe(true);
    });

    it('NUL, ESC, CR LF et U+202E retirés du pseudo dessiné (et de son initiale)', async () => {
      const { texts } = await drawnTexts({ ...faye, displayName: '\u202eFa\u0000y\u001be\r\n' });
      expect(hasText(texts, 'Faye')).toBe(true);
      expect(texts.filter((drawn) => CONTROL_OR_BIDI.test(drawn))).toEqual([]);
    });

    it('un pseudo fait seulement de caractères retirés : l’initiale de repli « ? »', async () => {
      const { png, texts } = await drawnTexts({ ...faye, displayName: '\u202e\u0000\r\n' });
      expect(hasText(texts, '?')).toBe(true);
      expect(await colorAt(png, DISC_BELOW_INITIAL)).toBe(INITIAL_DISC);
    });

    it('un nom de serveur fait seulement de caractères retirés : « CLASSEMENT » seul, sans « · »', async () => {
      const { texts } = await drawnTexts({ ...faye, guildName: '\u202e\u2066' });
      expect(texts.some((drawn) => drawn.startsWith(' · ') || drawn.includes('\u202e'))).toBe(
        false,
      );
      expect(hasText(texts, 'CLASSEMENT')).toBe(true);
    });
  });
});

// --- Réponse de /rank -------------------------------------------------------------------------

const input: RankCardInput = {
  rank: faye.rank,
  displayName: 'Faye',
  guildName: 'Les Agents',
  avatarUrl: 'https://cdn.discordapp.com/avatars/200000000000000001/abc123.png?size=256',
};
const FAKE_PNG = Buffer.from('png factice');
const AVATAR = Buffer.from('avatar factice');

function setup(
  overrides: Pick<NonNullable<Parameters<typeof rankReply>[1]>, 'loadAvatar' | 'render'> = {},
) {
  const deps = {
    loadAvatar: vi.fn(async (_url: string): Promise<Buffer | null> => AVATAR),
    render: vi.fn(async (_data: RankCardData) => FAKE_PNG),
    logger: { warn: vi.fn() },
    ...overrides,
  };
  return deps;
}

/** Le texte alternatif de la carte pour un pseudo donné. */
async function alt(displayName: string): Promise<string> {
  const reply = await rankReply({ ...input, displayName }, setup());
  const [file] = (reply as { files: { description?: string }[] }).files;
  return file?.description ?? '';
}

/** Ce que la phrase ajoute autour du pseudo : un pseudo de n lettres donne `overhead + n`. */
const overheadOf = async () => (await alt('W')).length - 1;

describe('rankReply', () => {
  it('répond avec le fichier rank.png et son texte alternatif en français', async () => {
    const deps = setup();

    const reply = await rankReply(input, deps);

    expect(reply).toHaveProperty('files');
    const [file] = (
      reply as { files: { name?: string; description?: string; attachment: unknown }[] }
    ).files;
    expect(file?.name).toBe('rank.png');
    expect(file?.attachment).toBe(FAKE_PNG);
    expect(file?.description).toBe(
      'Carte de rang de Faye : niveau 24, classement 3 sur 412, 64 % vers le niveau 25',
    );
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });

  it('formate le total du classement dans le texte alternatif', async () => {
    const deps = setup();
    const reply = await rankReply({ ...input, rank: { ...input.rank, total: 12345 } }, deps);
    const [file] = (reply as { files: { description?: string }[] }).files;
    expect(file?.description).toContain('sur 12 345');
  });

  it('télécharge l’avatar à l’URL donnée et le passe au dessin', async () => {
    const deps = setup();

    await rankReply(input, deps);

    expect(deps.loadAvatar).toHaveBeenCalledWith(input.avatarUrl);
    expect(deps.render).toHaveBeenCalledWith({
      rank: input.rank,
      displayName: 'Faye',
      guildName: 'Les Agents',
      avatar: AVATAR,
    });
  });

  it('pas d’avatar (null) : dessine quand même, avec l’initiale', async () => {
    const deps = setup({ loadAvatar: vi.fn(async () => null) });

    const reply = await rankReply(input, deps);

    expect(reply).toHaveProperty('files');
    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ avatar: null }));
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });

  it('un téléchargement d’avatar qui lève vaut null, sans repli embed', async () => {
    const deps = setup({
      loadAvatar: vi.fn(async () => {
        throw new Error('réseau coupé');
      }),
    });

    const reply = await rankReply(input, deps);

    expect(reply).toHaveProperty('files');
    expect(reply).not.toHaveProperty('embeds');
    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ avatar: null }));
  });

  it('un dessin qui échoue : l’embed d’avant, et un seul avertissement', async () => {
    const deps = setup({
      render: vi.fn(async () => {
        throw new Error('canvas cassé');
      }),
    });

    const reply = await rankReply(input, deps);

    expect(reply).not.toHaveProperty('files');
    const { embeds } = reply as { embeds: { toJSON(): unknown }[] };
    expect(embeds).toHaveLength(1);
    expect(embeds[0]?.toJSON()).toEqual(rankEmbed(input).toJSON());
    expect(deps.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('l’avertissement ne contient ni l’URL d’avatar ni d’identifiant en clair', async () => {
    const deps = setup({
      render: vi.fn(async () => {
        throw new Error('canvas cassé');
      }),
    });

    await rankReply(input, deps);

    const [context, message] = deps.logger.warn.mock.calls[0] as [object, string];
    expect(typeof message).toBe('string');
    const logged = JSON.stringify([context, message]);
    expect(logged).not.toContain('200000000000000001');
    expect(logged).not.toContain('abc123');
    expect(logged).not.toContain('cdn.discordapp.com');
    // le pseudo est une donnée personnelle : ni dans le message, ni dans le contexte structuré
    expect(logged).not.toContain(input.displayName);
  });

  it('sans logger : le repli marche quand même', async () => {
    const render = vi.fn(async () => {
      throw new Error('canvas cassé');
    });
    const reply = await rankReply(input, { loadAvatar: async () => null, render });
    expect(reply).toHaveProperty('embeds');
  });

  describe('texte alternatif : 1 024 caractères au plus (limite de Discord)', () => {
    const LIMIT = 1024;
    it('exactement 1 024 caractères : intact', async () => {
      const name = 'W'.repeat(LIMIT - (await overheadOf()));
      const description = await alt(name);
      expect(description).toHaveLength(LIMIT);
      expect(description).toBe(
        `Carte de rang de ${name} : niveau 24, classement 3 sur 412, 64 % vers le niveau 25`,
      );
    });

    it('1 025 caractères : c’est le pseudo qui est raccourci, pas la fin de la phrase', async () => {
      const name = 'W'.repeat(LIMIT + 1 - (await overheadOf()));
      const description = await alt(name);
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toContain('niveau 24, classement 3 sur 412');
      expect(description.endsWith('64 % vers le niveau 25')).toBe(true);
      expect(description.startsWith('Carte de rang de W')).toBe(true);
    });

    it('un pseudo démesuré (3 000 caractères) : même résultat', async () => {
      const description = await alt('W'.repeat(3000));
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toContain('niveau 24, classement 3 sur 412');
      expect(description.endsWith('64 % vers le niveau 25')).toBe(true);
    });

    it('un pseudo de 100 000 caractères : ≤ 1 024, le niveau reste, en moins de 1 000 ms', async () => {
      const start = performance.now();
      const description = await alt('W'.repeat(100_000));
      const elapsed = performance.now() - start;
      expect(description.length).toBeLessThanOrEqual(LIMIT);
      expect(description).toContain('niveau 24, classement 3 sur 412');
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('texte alternatif : pseudo nettoyé (contrôle et direction)', () => {
    it('U+202E, NUL, ESC et CR LF ne passent pas dans la description', async () => {
      const reply = await rankReply(
        { ...input, displayName: '\u202eFa\u0000y\u001be\r\n', guildName: 'Les\u202eAgents' },
        setup(),
      );
      const [file] = (reply as { files: { description?: string }[] }).files;
      expect(file?.description).toBe(
        'Carte de rang de Faye : niveau 24, classement 3 sur 412, 64 % vers le niveau 25',
      );
    });
  });

  describe('sans loadAvatar : le téléchargement par défaut (fetch lu à l’appel)', () => {
    const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const stubFetch = () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () =>
          new Response(IMAGE_BYTES, { status: 200, headers: { 'content-type': 'image/png' } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('une URL hors de la liste blanche : fetch n’est jamais appelé, l’avatar vaut null', async () => {
      const fetchMock = stubFetch();
      const render = vi.fn(async (_data: RankCardData) => FAKE_PNG);

      await rankReply({ ...input, avatarUrl: 'https://evil.example/a.png' }, { render });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledWith(expect.objectContaining({ avatar: null }));
    });

    it('une URL du CDN de Discord : fetch est appelé une fois avec elle, le Buffer reçu part au dessin', async () => {
      const fetchMock = stubFetch();
      const render = vi.fn(async (_data: RankCardData) => FAKE_PNG);
      const url = 'https://cdn.discordapp.com/avatars/1/a.png';

      await rankReply({ ...input, avatarUrl: url }, { render });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(url);
      const [data] = render.mock.calls[0] ?? [];
      expect(Buffer.isBuffer(data?.avatar)).toBe(true);
      expect([...(data?.avatar ?? [])]).toEqual([...IMAGE_BYTES]);
    });
  });

  it('avec le vrai dessin : un vrai PNG de 1000 × 300', async () => {
    registerCardFonts();
    const reply = await rankReply(input, { loadAvatar: async () => null });

    const [file] = (reply as { files: { attachment: Buffer }[] }).files;
    expect(pngInfo(file?.attachment as Buffer)).toEqual(pngOf(1000, 300));
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

describe('renderRankCard : polices', () => {
  it('chaque police posée (mesure comme dessin) est une pile complète ; titre, texte et mono servent', async () => {
    registerCardFonts();
    // sans avatar : l'initiale est dessinée aussi
    const fonts = await fontsSetDuring(() =>
      renderRankCard({ ...faye, displayName: 'Łukasz', avatar: null }),
    );
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.filter((font) => stackRoleOf(font) === null)).toEqual([]);
    expect(new Set(fonts.map(stackRoleOf))).toEqual(new Set(ROLES));
  });
});
