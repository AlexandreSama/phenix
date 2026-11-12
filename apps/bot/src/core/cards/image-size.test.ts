import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { MAX_AVATAR_SIDE, readImageSize } from './image-size.js';

// En-têtes fabriqués à la main : seuls les octets lus pour les dimensions sont réalistes.

const ascii = (text: string) => [...Buffer.from(text, 'ascii')];
const u16le = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const u16be = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const u24le = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
const u32le = (value: number) => [...u16le(value & 0xffff), ...u16le(value >>> 16)];
const u32be = (value: number) => [...u16be(value >>> 16), ...u16be(value & 0xffff)];
const bytes = (...parts: number[][]) => Buffer.from(parts.flat());

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Signature, longueur de l'IHDR (13), « IHDR », largeur, hauteur (32 bits gros-boutistes), suite de l'IHDR. */
const pngHeader = (width: number, height: number, type = 'IHDR') =>
  bytes(PNG_SIGNATURE, u32be(13), ascii(type), u32be(width), u32be(height), [8, 6, 0, 0, 0]);

const gifHeader = (version: '87a' | '89a', width: number, height: number) =>
  bytes(ascii(`GIF${version}`), u16le(width), u16le(height), [0xf7, 0, 0]);

const riff = (chunk: string, payload: number[]) =>
  bytes(
    ascii('RIFF'),
    u32le(4 + 8 + payload.length),
    ascii('WEBP'),
    ascii(chunk),
    u32le(payload.length),
    payload,
  );

/** VP8 (avec perte) : 3 octets d'en-tête de trame, code de début 9d 01 2a, largeur et hauteur sur 14 bits (+ 2 bits d'échelle). */
const vp8 = (width: number, height: number, scale = 0) =>
  riff('VP8 ', [
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...u16le(width | (scale << 14)),
    ...u16le(height | (scale << 14)),
  ]);

/** VP8L (sans perte) : signature 0x2f, puis (largeur - 1) et (hauteur - 1) sur 14 bits chacun. */
const vp8l = (width: number, height: number) =>
  riff('VP8L', [0x2f, ...u32le(((width - 1) | ((height - 1) << 14) | (1 << 28)) >>> 0)]);

/** VP8X (étendu) : 4 octets de drapeaux, puis (largeur - 1) et (hauteur - 1) sur 24 bits. */
const vp8x = (width: number, height: number) =>
  riff('VP8X', [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);

const APP0 = [0xff, 0xe0, ...u16be(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
/** Un segment non SOF dont le contenu, lu à tort comme un SOF, donnerait 9 999 × 9 999. */
const decoy = (marker: number) => [0xff, marker, ...u16be(8), 8, ...u16be(9999), ...u16be(9999), 0];
/** SOFn : longueur, précision, HAUTEUR puis LARGEUR (16 bits gros-boutistes), composantes. */
const sof = (marker: number, width: number, height: number) => [
  0xff,
  marker,
  ...u16be(17),
  8,
  ...u16be(height),
  ...u16be(width),
  3,
  1,
  0x22,
  0,
  2,
  0x11,
  1,
  3,
  0x11,
  1,
];
const jpeg = (...segments: number[][]) => bytes([0xff, 0xd8], ...segments);

/** Les longueurs de coupe, plus courtes que les octets utiles, qui ne renvoient PAS null (attendu : aucune). */
function truncationsNotNull(full: Buffer, usefulLength: number): number[] {
  return Array.from({ length: usefulLength }, (_, length) => length).filter(
    (length) => readImageSize(full.subarray(0, length)) !== null,
  );
}

describe('MAX_AVATAR_SIDE', () => {
  it('vaut 1 024 px', () => {
    expect(MAX_AVATAR_SIDE).toBe(1024);
  });
});

describe('readImageSize : PNG (IHDR)', () => {
  it('lit largeur et hauteur', () => {
    expect(readImageSize(pngHeader(1000, 640))).toEqual({ width: 1000, height: 640 });
  });

  it('lit des dimensions énormes sans rien allouer (bombe : 23 000 × 23 000)', () => {
    expect(readImageSize(pngHeader(23_000, 23_000))).toEqual({ width: 23_000, height: 23_000 });
  });

  it('un premier chunk qui n’est pas IHDR → null', () => {
    expect(readImageSize(pngHeader(10, 10, 'IDAT'))).toBeNull();
  });

  it('tronqué avant la fin de la hauteur → null', () => {
    expect(truncationsNotNull(pngHeader(1000, 640), 24)).toEqual([]);
  });
});

describe('readImageSize : GIF', () => {
  it.each(['87a', '89a'] as const)(
    'GIF%s : largeur et hauteur (16 bits petit-boutistes)',
    (version) => {
      expect(readImageSize(gifHeader(version, 300, 0x1234))).toEqual({
        width: 300,
        height: 0x1234,
      });
    },
  );

  it('tronqué → null', () => {
    expect(truncationsNotNull(gifHeader('89a', 300, 200), 10)).toEqual([]);
  });

  it('une autre version (GIF90a) → null', () => {
    expect(readImageSize(bytes(ascii('GIF90a'), u16le(1), u16le(1)))).toBeNull();
  });
});

describe('readImageSize : WebP', () => {
  it('VP8 (avec perte) : 14 bits, les 2 bits d’échelle sont ignorés', () => {
    expect(readImageSize(vp8(1000, 600))).toEqual({ width: 1000, height: 600 });
    expect(readImageSize(vp8(1000, 600, 3))).toEqual({ width: 1000, height: 600 });
  });

  it('VP8 sans le code de début 9d 01 2a → null', () => {
    const broken = Buffer.from(vp8(10, 10));
    broken[23] = 0;
    expect(readImageSize(broken)).toBeNull();
  });

  it('VP8L (sans perte) : largeur et hauteur sur 14 bits, plus un', () => {
    expect(readImageSize(vp8l(1000, 600))).toEqual({ width: 1000, height: 600 });
    expect(readImageSize(vp8l(16_384, 1))).toEqual({ width: 16_384, height: 1 });
  });

  it('VP8L sans la signature 0x2f → null', () => {
    const broken = Buffer.from(vp8l(10, 10));
    broken[20] = 0;
    expect(readImageSize(broken)).toBeNull();
  });

  it('VP8X (étendu) : 24 bits, plus un', () => {
    expect(readImageSize(vp8x(1000, 600))).toEqual({ width: 1000, height: 600 });
    expect(readImageSize(vp8x(23_000, 23_000))).toEqual({ width: 23_000, height: 23_000 });
  });

  it.each([
    ['VP8', vp8(1000, 600), 30],
    ['VP8L', vp8l(1000, 600), 25],
    ['VP8X', vp8x(1000, 600), 30],
  ])('%s tronqué → null', (_name, full, useful) => {
    expect(truncationsNotNull(full, useful)).toEqual([]);
  });

  it('RIFF qui n’est pas du WebP, ou chunk inconnu → null', () => {
    const wave = Buffer.from(vp8x(10, 10));
    wave.write('WAVE', 8, 'ascii');
    expect(readImageSize(wave)).toBeNull();
    expect(
      readImageSize(
        riff(
          'ALPH',
          Array.from({ length: 20 }, () => 0),
        ),
      ),
    ).toBeNull();
  });
});

describe('readImageSize : JPEG', () => {
  it('SOF0 après un APP0 : hauteur et largeur lues dans le bon ordre', () => {
    expect(readImageSize(jpeg(APP0, sof(0xc0, 1000, 600)))).toEqual({ width: 1000, height: 600 });
  });

  it.each([0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])(
    'marqueur SOF %i reconnu',
    (marker) => {
      expect(readImageSize(jpeg(APP0, sof(marker, 321, 123)))).toEqual({ width: 321, height: 123 });
    },
  );

  it.each([
    ['DHT (0xc4)', 0xc4],
    ['JPG (0xc8)', 0xc8],
    ['DAC (0xcc)', 0xcc],
    ['APP1 (0xe1)', 0xe1],
    ['DQT (0xdb)', 0xdb],
  ])('%s n’est pas un SOF : sauté, sans lire son contenu', (_name, marker) => {
    expect(readImageSize(jpeg(APP0, decoy(marker), sof(0xc0, 64, 48)))).toEqual({
      width: 64,
      height: 48,
    });
  });

  it('accepte des octets de remplissage 0xff avant un marqueur', () => {
    expect(readImageSize(jpeg(APP0, [0xff, 0xff], sof(0xc2, 64, 48)))).toEqual({
      width: 64,
      height: 48,
    });
  });

  it('début de scan (SOS) ou fin d’image (EOI) avant tout SOF → null', () => {
    expect(readImageSize(jpeg(APP0, [0xff, 0xda, ...u16be(8), 1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(readImageSize(jpeg(APP0, [0xff, 0xd9]))).toBeNull();
  });

  it('un octet qui n’est pas un marqueur (≠ 0xff) là où on en attend un → null', () => {
    expect(readImageSize(jpeg(APP0, [0x00, 0xc0], sof(0xc0, 1, 1)))).toBeNull();
  });

  it('une longueur de segment < 2 → null (pas de boucle infinie)', () => {
    expect(readImageSize(jpeg([0xff, 0xe0, 0, 0], sof(0xc0, 1, 1)))).toBeNull();
    expect(readImageSize(jpeg([0xff, 0xe0, 0, 1], sof(0xc0, 1, 1)))).toBeNull();
  });

  it('tronqué n’importe où avant la largeur → null', () => {
    const full = jpeg(APP0, decoy(0xc4), sof(0xc0, 1000, 600));
    expect(truncationsNotNull(full, 2 + APP0.length + decoy(0xc4).length + 9)).toEqual([]);
  });
});

describe('readImageSize : autres', () => {
  it.each([
    ['vide', Buffer.alloc(0)],
    ['HTML', Buffer.from('<html>pas une image</html>')],
    ['BMP', Buffer.from('BM' + '\0'.repeat(40), 'latin1')],
    ['SVG', Buffer.from('<svg width="10" height="10"/>')],
  ])('%s → null', (_name, buffer) => {
    expect(readImageSize(buffer)).toBeNull();
  });

  it('accepte un Uint8Array qui n’est pas un Buffer', () => {
    expect(readImageSize(new Uint8Array(pngHeader(7, 9)))).toEqual({ width: 7, height: 9 });
  });
});

describe('readImageSize : images réelles encodées par @napi-rs/canvas', () => {
  const canvas = createCanvas(37, 21);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 37, 21);

  it.each([
    ['PNG', () => canvas.encode('png')],
    ['JPEG', () => canvas.encode('jpeg')],
    ['WebP avec perte', () => canvas.encode('webp')],
    ['WebP qualité 100', () => canvas.encode('webp', 100)],
    ['GIF', () => canvas.encode('gif')],
  ])('%s : 37 × 21', async (_name, encode) => {
    expect(readImageSize(await encode())).toEqual({ width: 37, height: 21 });
  });

  it('un PNG réel de 1 000 × 1 000', async () => {
    expect(readImageSize(await createCanvas(1000, 1000).encode('png'))).toEqual({
      width: 1000,
      height: 1000,
    });
  });
});
