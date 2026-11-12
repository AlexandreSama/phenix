/** Côté maximal, en pixels, d'un avatar que l'on accepte de décoder. */
export const MAX_AVATAR_SIDE = 1024;

type Size = { width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Les octets à `offset` valent `expected` (texte ASCII ou octets), sans sortir du tampon. */
function startsWith(buffer: Uint8Array, expected: string | number[], offset = 0): boolean {
  const bytes = typeof expected === 'string' ? [...expected].map((c) => c.charCodeAt(0)) : expected;
  if (offset + bytes.length > buffer.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32le = (b: Uint8Array, o: number) => (u16le(b, o) | (u16le(b, o + 2) << 16)) >>> 0;
const u32be = (b: Uint8Array, o: number) => ((u16be(b, o) << 16) | u16be(b, o + 2)) >>> 0;

/** PNG : le premier chunk est l'IHDR, largeur puis hauteur sur 32 bits gros-boutistes. */
function pngSize(b: Uint8Array): Size | null {
  if (b.length < 24 || !startsWith(b, 'IHDR', 12)) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** GIF : largeur et hauteur de l'écran logique, 16 bits petit-boutistes. */
function gifSize(b: Uint8Array): Size | null {
  if (b.length < 10) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

/** WebP : selon le premier chunk, VP8 (avec perte), VP8L (sans perte) ou VP8X (étendu). */
function webpSize(b: Uint8Array): Size | null {
  if (startsWith(b, 'VP8 ', 12)) {
    if (b.length < 30 || !startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (startsWith(b, 'VP8L', 12)) {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (startsWith(b, 'VP8X', 12)) {
    if (b.length < 30) return null;
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** Marqueurs SOF0..SOF15, sauf DHT (C4), JPG (C8) et DAC (CC) qui n'en sont pas. */
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** JPEG : on saute les segments jusqu'au premier SOF, qui porte hauteur puis largeur. */
function jpegSize(b: Uint8Array): Size | null {
  let offset = 2;
  for (;;) {
    if (offset >= b.length || b[offset] !== 0xff) return null;
    // Octets de remplissage 0xff permis avant le marqueur
    while (b[offset] === 0xff) offset += 1;
    if (offset + 2 >= b.length) return null;
    const marker = b[offset]!;
    // Début du scan ou fin d'image sans SOF : pas de dimensions
    if (marker === 0xda || marker === 0xd9) return null;
    const length = u16be(b, offset + 1);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 8 > b.length) return null;
      return { width: u16be(b, offset + 6), height: u16be(b, offset + 4) };
    }
    offset += 1 + length;
  }
}

/**
 * Dimensions d'une image lues dans son EN-TÊTE, sans la décoder (PNG, GIF, WebP, JPEG).
 * Format inconnu ou tampon tronqué → null.
 */
export function readImageSize(buffer: Uint8Array): Size | null {
  if (startsWith(buffer, PNG_SIGNATURE)) return pngSize(buffer);
  if (startsWith(buffer, 'GIF87a') || startsWith(buffer, 'GIF89a')) return gifSize(buffer);
  if (startsWith(buffer, 'RIFF') && startsWith(buffer, 'WEBP', 8)) return webpSize(buffer);
  if (startsWith(buffer, [0xff, 0xd8])) return jpegSize(buffer);
  return null;
}
