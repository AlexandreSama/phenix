import type { MemberRank } from '@phenix/database';
import { levelProgress } from '@phenix/shared';
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder, type EmbedBuilder } from 'discord.js';
import { fetchAvatar } from '../../core/cards/avatar.js';
import { cardText, fitAltText, fitText, initialOf, sanitizeLabel } from '../../core/cards/draw.js';
import { cardFontStack, registerCardFonts } from '../../core/cards/fonts.js';
import { MAX_AVATAR_SIDE, readImageSize } from '../../core/cards/image-size.js';
import { baseEmbed } from '../../core/embeds.js';

/** Nombre à la française : 12 345. */
export const formatNumber = (value: number) => value.toLocaleString('fr-FR');

/** Barre de progression en texte : ▰▰▰▰▱▱▱▱▱▱ */
export function progressBar(ratio: number, size = 12): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

export interface RankCardInput {
  rank: Pick<MemberRank, 'xp' | 'messages' | 'rank' | 'total'>;
  displayName: string;
  /** Nom du serveur, affiché en tête de la carte dessinée (inutile pour l'embed de repli) */
  guildName: string;
  avatarUrl: string;
}

/** La carte de /rank : niveau, place, et ce qu'il reste jusqu'au niveau suivant. */
export function rankEmbed({
  rank,
  displayName,
  avatarUrl,
}: Omit<RankCardInput, 'guildName'>): EmbedBuilder {
  const progress = levelProgress(rank.xp);
  return baseEmbed()
    .setAuthor({ name: displayName, iconURL: avatarUrl })
    .setThumbnail(avatarUrl)
    .addFields(
      { name: 'Niveau', value: `**${progress.level}**`, inline: true },
      {
        name: 'Classement',
        value: `**#${rank.rank}** sur ${formatNumber(rank.total)}`,
        inline: true,
      },
      { name: 'XP totale', value: formatNumber(rank.xp), inline: true },
      {
        name: `Vers le niveau ${progress.level + 1}`,
        value: `${progressBar(progress.ratio)}  ${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP`,
      },
    )
    .setFooter({ text: `${formatNumber(rank.messages)} messages comptés` });
}

/** Dimensions de la carte de /rank, en pixels. */
export const RANK_CARD_SIZE = { width: 1000, height: 300 } as const;

/**
 * Ratio 0..1 (NaN, négatif ou supérieur à 1 bornés) → pourcentage entier arrondi
 * et angle de fin de l'arc (départ en haut = -π/2, sens horaire).
 */
export function ringSweep(ratio: number): { percent: number; endAngle: number } {
  const clamped = Number.isNaN(ratio) ? 0 : Math.min(Math.max(ratio, 0), 1);
  return { percent: Math.round(clamped * 100), endAngle: -Math.PI / 2 + 2 * Math.PI * clamped };
}

/** Ce qu'il faut pour dessiner la carte : pas d'URL, l'avatar est déjà téléchargé. */
export interface RankCardData {
  rank: Pick<MemberRank, 'xp' | 'messages' | 'rank' | 'total'>;
  displayName: string;
  guildName: string;
  /** null : on dessine l'initiale du pseudo à la place */
  avatar: Buffer | null;
}

// Couleurs et géométrie de la maquette « Anneau » (carte de 1000 × 300, bordure de 2 px).
const COLORS = {
  accent: '#f5aa04',
  background: '#140c08',
  track: '#2b1b12',
  initialDisc: '#50260b',
  white: '#ffffff',
  muted: '#a8a29e',
} as const;
const RING = { x: 162, y: 150, radius: 104, stroke: 12, avatarRadius: 88 } as const;
const BADGE = { x: 240, y: 224, radius: 32, innerRadius: 26 } as const;
/** Colonne de texte : de x = 318 (anneau + écart de 44) à x = 950 (marge de 48 + bordure). */
const TEXT = { left: 318, width: 632, top: 137 } as const;
const COLUMN_WIDTH = TEXT.width / 4;

type Ctx = SKRSContext2D;

// Toujours la pile de familles : la mesure (fitText, fittingSize) et le dessin utilisent la même police
const titleFont = (size: number) => cardFontStack('title', 700, size);
const valueFont = (size: number) => cardFontStack('mono', 700, size);
const bodyFont = (weight: number, size = 16) => cardFontStack('body', weight, size);

/** Écrit un texte à partir de (x, y) et renvoie l'abscisse de sa fin. */
function write(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  style: { font: string; color: string; spacing?: number },
): number {
  const shown = cardText(text);
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.letterSpacing = `${style.spacing ?? 0}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(shown, x, y);
  return x + ctx.measureText(shown).width;
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
  while (fitted > 12 && ctx.measureText(cardText(text)).width > maxWidth) {
    fitted -= 1;
    ctx.font = font(fitted);
  }
  return fitted;
}

function drawFrame(ctx: Ctx) {
  const { width, height } = RANK_CARD_SIZE;
  ctx.fillStyle = COLORS.track;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 28);
  ctx.fill();
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, 26);
  ctx.fill();
}

function drawRing(ctx: Ctx, ratio: number) {
  const { percent, endAngle } = ringSweep(ratio);
  ctx.lineWidth = RING.stroke;
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.track;
  ctx.beginPath();
  ctx.arc(RING.x, RING.y, RING.radius, 0, 2 * Math.PI);
  ctx.stroke();
  // 0 % : pas d'arc, sinon le bout rond laisserait un point
  if (percent === 0) return;
  ctx.strokeStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(RING.x, RING.y, RING.radius, -Math.PI / 2, endAngle);
  ctx.stroke();
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
    const box = RING.avatarRadius * 2;
    const scale = Math.max(box / image.width, box / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(RING.x, RING.y, RING.avatarRadius, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(image, RING.x - width / 2, RING.y - height / 2, width, height);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

function drawInitial(ctx: Ctx, displayName: string) {
  ctx.fillStyle = COLORS.initialDisc;
  ctx.beginPath();
  ctx.arc(RING.x, RING.y, RING.avatarRadius, 0, 2 * Math.PI);
  ctx.fill();
  writeCentered(ctx, initialOf(displayName), RING.x, RING.y, titleFont(72), COLORS.accent);
}

function drawLevelBadge(ctx: Ctx, level: number) {
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.arc(BADGE.x, BADGE.y, BADGE.radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(BADGE.x, BADGE.y, BADGE.innerRadius, 0, 2 * Math.PI);
  ctx.fill();
  const text = String(level);
  // Les niveaux à quatre chiffres rétrécissent pour rester dans la pastille
  const size = fittingSize(ctx, titleFont, text, 24, 44);
  writeCentered(ctx, text, BADGE.x, BADGE.y, titleFont(size), COLORS.background);
}

function drawHeader(ctx: Ctx, data: RankCardData) {
  const labelFont = bodyFont(600);
  const spacing = 3;
  ctx.font = labelFont;
  ctx.letterSpacing = `${spacing}px`;
  const suffix = ' · CLASSEMENT';
  const guild = fitText(
    ctx,
    cardText(sanitizeLabel(data.guildName).toUpperCase()),
    TEXT.width - ctx.measureText(suffix).width,
  );
  const label = guild === '' ? 'CLASSEMENT' : `${guild}${suffix}`;
  write(ctx, label, TEXT.left, 50, { font: labelFont, color: COLORS.accent, spacing });

  ctx.font = titleFont(52);
  ctx.letterSpacing = '0px';
  const name = fitText(ctx, cardText(sanitizeLabel(data.displayName)), TEXT.width);
  write(ctx, name, TEXT.left, 103, {
    font: titleFont(52),
    color: COLORS.white,
  });
}

/** Une colonne de chiffres : libellé, valeur en mono, et un complément plus petit à sa suite. */
function drawStat(ctx: Ctx, index: number, label: string, value: string, suffix = '') {
  const x = TEXT.left + index * COLUMN_WIDTH;
  write(ctx, label, x, 172, { font: bodyFont(400, 14), color: COLORS.muted });
  const suffixFont = cardFontStack('mono', 500, 16);
  // Les grands nombres rétrécissent pour ne pas mordre sur la colonne voisine
  ctx.font = suffixFont;
  const suffixWidth = suffix === '' ? 0 : ctx.measureText(cardText(suffix)).width;
  const size = fittingSize(ctx, valueFont, value, 30, COLUMN_WIDTH - 8 - suffixWidth);
  const end = write(ctx, value, x, 212, { font: valueFont(size), color: COLORS.white });
  if (suffix !== '') write(ctx, suffix, end, 212, { font: suffixFont, color: COLORS.muted });
}

function drawStats(ctx: Ctx, data: RankCardData) {
  ctx.fillStyle = COLORS.track;
  ctx.fillRect(TEXT.left, TEXT.top, TEXT.width, 1);
  const { percent } = ringSweep(levelProgress(data.rank.xp).ratio);
  drawStat(ctx, 0, 'Classement', `#${data.rank.rank}`, ` / ${formatNumber(data.rank.total)}`);
  drawStat(ctx, 1, 'Progression', String(percent), ' %');
  drawStat(ctx, 2, 'XP totale', formatNumber(data.rank.xp));
  drawStat(ctx, 3, 'Messages', formatNumber(data.rank.messages));
}

function drawRemaining(ctx: Ctx, xp: number) {
  const progress = levelProgress(xp);
  const remaining = `${formatNumber(progress.needed - progress.current)} XP`;
  const after = ` avant le niveau ${progress.level + 1} (${formatNumber(progress.current)} / ${formatNumber(progress.needed)})`;
  let x = write(ctx, 'Encore ', TEXT.left, 262, { font: bodyFont(400), color: COLORS.muted });
  x = write(ctx, remaining, x, 262, { font: bodyFont(600), color: COLORS.white });
  write(ctx, after, x, 262, { font: bodyFont(400), color: COLORS.muted });
}

/** Dessine la carte de rang : un PNG de RANK_CARD_SIZE. */
export async function renderRankCard(data: RankCardData): Promise<Buffer> {
  registerCardFonts();
  const canvas = createCanvas(RANK_CARD_SIZE.width, RANK_CARD_SIZE.height);
  const ctx = canvas.getContext('2d');
  const progress = levelProgress(data.rank.xp);

  drawFrame(ctx);
  drawRing(ctx, progress.ratio);
  const drawn = data.avatar !== null && (await drawAvatar(ctx, data.avatar));
  if (!drawn) drawInitial(ctx, sanitizeLabel(data.displayName));
  drawLevelBadge(ctx, progress.level);
  drawHeader(ctx, data);
  drawStats(ctx, data);
  drawRemaining(ctx, data.rank.xp);
  // encode : la compression PNG se fait hors du thread principal
  return await canvas.encode('png');
}

export interface RankReplyDeps {
  loadAvatar?: (url: string) => Promise<Buffer | null>;
  render?: (data: RankCardData) => Promise<Buffer>;
  logger?: { warn: (obj: object, msg: string) => void };
}

/** Texte alternatif de la carte ; c'est le pseudo qui est raccourci, jamais le reste de la phrase. */
function rankAltText({ rank, displayName }: RankCardInput): string {
  const progress = levelProgress(rank.xp);
  const percent = ringSweep(progress.ratio).percent;
  const build = (name: string) =>
    `Carte de rang de ${name} : niveau ${progress.level}, classement ${rank.rank} sur ${formatNumber(rank.total)}, ${percent} % vers le niveau ${progress.level + 1}`;
  return fitAltText(build, sanitizeLabel(displayName));
}

/** La réponse de /rank : la carte dessinée, ou l'embed de repli si le dessin échoue. */
export async function rankReply(
  input: RankCardInput,
  { loadAvatar = fetchAvatar, render = renderRankCard, logger }: RankReplyDeps = {},
): Promise<{ files: AttachmentBuilder[] } | { embeds: EmbedBuilder[] }> {
  const avatar = await loadAvatar(input.avatarUrl).catch(() => null);
  try {
    const png = await render({
      rank: input.rank,
      displayName: input.displayName,
      guildName: input.guildName,
      avatar,
    });
    return {
      files: [new AttachmentBuilder(png, { name: 'rank.png', description: rankAltText(input) })],
    };
  } catch {
    // Ni pseudo, ni URL, ni identifiant dans le journal : des données personnelles
    logger?.warn({}, 'Carte de rang non dessinée, repli sur l’embed');
    return { embeds: [rankEmbed(input)] };
  }
}
