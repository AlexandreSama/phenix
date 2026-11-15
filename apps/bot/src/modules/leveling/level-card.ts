import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder, type EmbedBuilder } from 'discord.js';
import { fetchAvatar } from '../../core/cards/avatar.js';
import { cardText, fitAltText, fitText, initialOf, sanitizeLabel } from '../../core/cards/draw.js';
import { cardFontStack, registerCardFonts } from '../../core/cards/fonts.js';
import { MAX_AVATAR_SIDE, readImageSize } from '../../core/cards/image-size.js';
import { baseEmbed } from '../../core/embeds.js';

export interface LevelCardInput {
  displayName: string;
  level: number;
  avatarUrl: string;
}

/** Données brutes pour le rendu : pas d'URL, l'avatar est déjà téléchargé. */
interface LevelCardData {
  displayName: string;
  level: number;
  /** null : on dessine l'initiale du pseudo à la place */
  avatar: Buffer | null;
}

// --- Couleurs et géométrie (maquette « Célébration » de 1000 × 300) -------------------

const COLORS = {
  background: '#1d110c',
  accent: '#ff6b25',
  gold: '#f5aa04',
  white: '#ffffff',
  /** « NIVEAU » dans l'hexagone */
  label: '#a8a29e',
  subtitle: '#d6d3d1',
  initialDisc: '#50260b',
  /** Dégradé du contour de l'hexagone, du haut à gauche au bas à droite */
  hexagonFrom: '#f66a07',
  hexagonTo: '#f59405',
} as const;

const LEVEL_CARD_SIZE = { width: 1000, height: 300 } as const;
const CORNER_RADIUS = 28;

const AVATAR = { x: 97, y: 150, radius: 48 } as const;
/** Colonne de texte de gauche : « BRAVO », pseudo, sous-titre. */
const TEXT_LEFT = 167;
const BASELINES = { bravo: 117, name: 163, subtitle: 194 } as const;

/**
 * L'hexagone, à sommet pointu : centre, rayon du tracé (le milieu du contour) et épaisseur du trait.
 * Il occupe la place laissée libre par l'ancien panneau de droite : changer `x` suffit à le déplacer.
 */
const HEXAGON = { x: 700, y: 150, radius: 101, stroke: 20 } as const;
const HEXAGON_APOTHEM = HEXAGON.radius * Math.cos(Math.PI / 6);
/** Bord gauche extérieur (côté vertical) : le texte de gauche ne doit jamais l'atteindre. */
const HEXAGON_OUTER_LEFT = HEXAGON.x - (HEXAGON_APOTHEM + HEXAGON.stroke / 2);
/** Pointe du sommet, joint à angle vif : le rayon du tracé + la moitié du trait / sin 60°. */
const HEXAGON_TIP = HEXAGON.radius + HEXAGON.stroke / 2 / Math.sin(Math.PI / 3);

/** Place libre pour le pseudo et le sous-titre : jusqu'à 24 px avant l'hexagone. */
const TEXT_GAP_TO_HEXAGON = 24;
const TEXT_MAX_WIDTH = HEXAGON_OUTER_LEFT - TEXT_GAP_TO_HEXAGON - TEXT_LEFT;

/** « NIVEAU » et le chiffre : baseline de l'étiquette, taille, largeur utile et centre vertical du chiffre. */
const LEVEL = {
  labelBaseline: HEXAGON.y - 41,
  digitsSize: 96,
  digitsMaxWidth: 140,
  digitsCenterOffset: 9,
} as const;

/** Confettis : positions, angles (degrés), tailles et teintes fixes, hors du texte et de l'hexagone. */
const CONFETTI_COLORS = { orange: '#f66a07', gold: '#f5aa04', dark: '#a04008' } as const;
const CONFETTI = [
  { x: 38, y: 28, angle: 25, width: 16, height: 6, color: CONFETTI_COLORS.dark },
  { x: 156, y: 20, angle: -30, width: 10, height: 5, color: CONFETTI_COLORS.gold },
  { x: 337, y: 36, angle: 55, width: 16, height: 6, color: CONFETTI_COLORS.gold },
  { x: 424, y: 16, angle: -20, width: 10, height: 5, color: CONFETTI_COLORS.dark },
  { x: 628, y: 22, angle: 40, width: 12, height: 6, color: CONFETTI_COLORS.orange },
  { x: 780, y: 44, angle: 0, width: 12, height: 5, color: CONFETTI_COLORS.gold },
  { x: 888, y: 32, angle: -25, width: 16, height: 6, color: CONFETTI_COLORS.gold },
  { x: 965, y: 123, angle: 70, width: 12, height: 5, color: CONFETTI_COLORS.gold },
  { x: 920, y: 252, angle: 15, width: 16, height: 6, color: CONFETTI_COLORS.dark },
  { x: 690, y: 281, angle: -45, width: 12, height: 6, color: CONFETTI_COLORS.orange },
  { x: 527, y: 264, angle: 30, width: 16, height: 6, color: CONFETTI_COLORS.gold },
  { x: 307, y: 272, angle: -10, width: 12, height: 5, color: CONFETTI_COLORS.gold },
  { x: 127, y: 258, angle: 40, width: 14, height: 6, color: CONFETTI_COLORS.dark },
  { x: 24, y: 152, angle: 60, width: 10, height: 5, color: CONFETTI_COLORS.orange },
  { x: 860, y: 100, angle: -35, width: 12, height: 5, color: CONFETTI_COLORS.orange },
  { x: 850, y: 205, angle: 20, width: 14, height: 6, color: CONFETTI_COLORS.gold },
] as const;

type Ctx = SKRSContext2D;

// Toujours la pile de familles : la mesure (fitText, fittingSize) et le dessin utilisent la même police
const titleFont = (size: number) => cardFontStack('title', 700, size);
const bodyFont = (weight: number, size: number) => cardFontStack('body', weight, size);

// --- Utilitaires de dessin ---------------------------------------------------

/** Écrit un texte aligné sur (x, y) ; `spacing` espace les lettres (petites capitales). */
function write(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  style: { font: string; color: string; spacing?: number; align?: Ctx['textAlign'] },
) {
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.letterSpacing = `${style.spacing ?? 0}px`;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(cardText(text), x, y);
}

/** Écrit un texte centré en (x, y) : le centre vertical est celui de l'encre, pas de la ligne. */
function writeCentered(ctx: Ctx, text: string, x: number, y: number, font: string, color: string) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const shown = cardText(text);
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } =
    ctx.measureText(shown);
  ctx.fillText(shown, x, y + (ascent - descent) / 2);
}

/** Raccourcit un texte venu d'ailleurs avec « … », mesuré dans la police où il sera dessiné. */
function fitInFont(ctx: Ctx, text: string, font: string, maxWidth: number): string {
  ctx.font = font;
  ctx.letterSpacing = '0px';
  return fitText(ctx, cardText(text), maxWidth);
}

/** Plus grande taille (≤ `size`) pour laquelle le texte tient dans `maxWidth`. */
function fittingSize(
  ctx: Ctx,
  font: (size: number) => string,
  text: string,
  size: number,
  maxWidth: number,
) {
  let fitted = size;
  ctx.font = font(fitted);
  ctx.letterSpacing = '0px';
  while (fitted > 12 && ctx.measureText(cardText(text)).width > maxWidth) {
    fitted -= 1;
    ctx.font = font(fitted);
  }
  return fitted;
}

// --- Composants --------------------------------------------------------------

/** Fond de la carte, aux coins arrondis, sans bordure. */
function drawFrame(ctx: Ctx) {
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.roundRect(0, 0, LEVEL_CARD_SIZE.width, LEVEL_CARD_SIZE.height, CORNER_RADIUS);
  ctx.fill();
}

/** Petits rectangles tournés, toujours les mêmes : le rendu est déterministe. */
function drawConfetti(ctx: Ctx) {
  for (const piece of CONFETTI) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate((piece.angle * Math.PI) / 180);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    ctx.restore();
  }
}

/**
 * L'avatar découpé en rond, ratio conservé (cover) ; false si l'image est illisible ou trop grande.
 * Les dimensions sont lues dans l'en-tête AVANT le décodage : un PNG de quelques octets peut
 * annoncer 23 000 × 23 000 et faire allouer plus de 2 Go à loadImage.
 */
async function drawAvatar(ctx: Ctx, avatar: Buffer): Promise<boolean> {
  const size = readImageSize(avatar);
  if (!size || size.width > MAX_AVATAR_SIDE || size.height > MAX_AVATAR_SIDE) return false;
  try {
    const image = await loadImage(avatar);
    const box = AVATAR.radius * 2;
    const scale = Math.max(box / image.width, box / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(AVATAR.x, AVATAR.y, AVATAR.radius, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(image, AVATAR.x - width / 2, AVATAR.y - height / 2, width, height);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

function drawInitial(ctx: Ctx, displayName: string) {
  ctx.fillStyle = COLORS.initialDisc;
  ctx.beginPath();
  ctx.arc(AVATAR.x, AVATAR.y, AVATAR.radius, 0, 2 * Math.PI);
  ctx.fill();
  writeCentered(ctx, initialOf(displayName), AVATAR.x, AVATAR.y, titleFont(40), COLORS.gold);
}

/** « BRAVO », le pseudo et le sous-titre : tout s'arrête avant l'hexagone. */
function drawLeftSection(ctx: Ctx, displayName: string) {
  write(ctx, 'BRAVO', TEXT_LEFT, BASELINES.bravo, {
    font: bodyFont(700, 16),
    color: COLORS.accent,
    spacing: 4,
  });

  // Mesuré dans la police du pseudo, pas dans celle de « BRAVO »
  const nameFont = titleFont(42);
  const name = fitInFont(ctx, sanitizeLabel(displayName), nameFont, TEXT_MAX_WIDTH);
  write(ctx, name, TEXT_LEFT, BASELINES.name, { font: nameFont, color: COLORS.white });

  const subtitleFont = bodyFont(400, 18);
  const subtitle = fitInFont(ctx, 'passe au niveau supérieur', subtitleFont, TEXT_MAX_WIDTH);
  write(ctx, subtitle, TEXT_LEFT, BASELINES.subtitle, {
    font: subtitleFont,
    color: COLORS.subtitle,
  });
}

/** Les six sommets, le premier en haut. */
function hexagonPath(ctx: Ctx) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = HEXAGON.x + HEXAGON.radius * Math.cos(angle);
    const y = HEXAGON.y + HEXAGON.radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Contour en dégradé linéaire, du coin haut-gauche au coin bas-droit de l'hexagone. */
function drawHexagon(ctx: Ctx) {
  const gradient = ctx.createLinearGradient(
    HEXAGON_OUTER_LEFT,
    HEXAGON.y - HEXAGON_TIP,
    HEXAGON.x * 2 - HEXAGON_OUTER_LEFT,
    HEXAGON.y + HEXAGON_TIP,
  );
  gradient.addColorStop(0, COLORS.hexagonFrom);
  gradient.addColorStop(1, COLORS.hexagonTo);
  ctx.lineWidth = HEXAGON.stroke;
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = gradient;
  hexagonPath(ctx);
  ctx.stroke();
}

/** « NIVEAU » petit au-dessus d'un gros chiffre blanc ; le chiffre rétrécit pour tenir dans l'hexagone. */
function drawLevel(ctx: Ctx, level: number) {
  write(ctx, 'NIVEAU', HEXAGON.x, LEVEL.labelBaseline, {
    font: bodyFont(600, 14),
    color: COLORS.label,
    spacing: 5,
    align: 'center',
  });
  const digits = String(level);
  const size = fittingSize(ctx, titleFont, digits, LEVEL.digitsSize, LEVEL.digitsMaxWidth);
  writeCentered(
    ctx,
    digits,
    HEXAGON.x,
    HEXAGON.y + LEVEL.digitsCenterOffset,
    titleFont(size),
    COLORS.white,
  );
}

/** Dessine la carte de passage de niveau. */
export async function renderLevelCard(data: LevelCardData): Promise<Buffer> {
  registerCardFonts();
  const canvas = createCanvas(LEVEL_CARD_SIZE.width, LEVEL_CARD_SIZE.height);
  const ctx = canvas.getContext('2d');

  drawFrame(ctx);
  drawConfetti(ctx);
  const drawn = data.avatar !== null && (await drawAvatar(ctx, data.avatar));
  if (!drawn) drawInitial(ctx, sanitizeLabel(data.displayName));
  drawLeftSection(ctx, data.displayName);
  drawHexagon(ctx);
  drawLevel(ctx, data.level);

  // encode : la compression PNG se fait hors du thread principal
  return await canvas.encode('png');
}

// --- Embed de repli -----------------------------------------------------------

function levelUpEmbed({ displayName, level }: LevelCardInput): EmbedBuilder {
  return baseEmbed()
    .setTitle('🎉 Passage de niveau !')
    .setDescription(`**${sanitizeLabel(displayName)}** est passé au **niveau ${level}** !`);
}

// --- Réponse Discord ----------------------------------------------------------

export interface LevelCardDeps {
  loadAvatar?: (url: string) => Promise<Buffer | null>;
  render?: (data: LevelCardData) => Promise<Buffer>;
  logger?: { warn: (obj: object, msg: string) => void };
}

/** Texte alternatif de la carte ; c'est le pseudo qui est raccourci, jamais le reste de la phrase. */
function levelCardAltText({ displayName, level }: LevelCardInput): string {
  return fitAltText(
    (name) => `Carte de niveau : ${name} passe au niveau ${level} !`,
    sanitizeLabel(displayName),
  );
}

/** Construit la réponse de passage de niveau : la carte, ou un embed de repli si le dessin échoue. */
export async function levelUpReply(
  input: LevelCardInput,
  { loadAvatar = fetchAvatar, render = renderLevelCard, logger }: LevelCardDeps = {},
): Promise<{ files: AttachmentBuilder[] } | { embeds: EmbedBuilder[] }> {
  const avatar = await loadAvatar(input.avatarUrl).catch(() => null);
  try {
    const png = await render({
      displayName: input.displayName,
      level: input.level,
      avatar,
    });
    return {
      files: [
        new AttachmentBuilder(png, { name: 'levelup.png', description: levelCardAltText(input) }),
      ],
    };
  } catch {
    // Ni pseudo, ni URL, ni identifiant dans le journal : des données personnelles
    logger?.warn({}, "Carte de niveau non dessinée, repli sur l'embed");
    return { embeds: [levelUpEmbed(input)] };
  }
}
