import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { TD2_PLATFORM_LABELS } from '@phenix/shared';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from 'discord.js';
import {
  cardText,
  fitAltText,
  fitText,
  initialOf,
  sanitizeLabel,
} from '../../../core/cards/draw.js';
import { cardFontStack, registerCardFonts, type CardFontRole } from '../../../core/cards/fonts.js';
import { careerMessage, formatStat } from './messages.js';
import type { Td2Career, Td2Stat, Td2StatKey } from './provider.js';
import { TRACKER_GG_PROFILE_URL } from './tracker-gg.js';

/** Dimensions de la carte de /td2 stats, en pixels. */
export const STATS_CARD_SIZE = { width: 1000, height: 560 } as const;

/** Une durée valide : finie et positive ou nulle. Tout le reste (absente, texte, NaN, négative) → null. */
function validSeconds(stat: Td2Stat | undefined): number | null {
  if (stat?.kind !== 'duration') return null;
  return Number.isFinite(stat.seconds) && stat.seconds >= 0 ? stat.seconds : null;
}

/**
 * Part PvE / Dark Zone de la barre « Temps de jeu » ; null si timePve ou timeDarkZone est absent
 * ou n'est pas une durée, ou si leur somme est nulle. Les deux parts somment à 1.
 */
export function timeSplit(stats: Td2Career['stats']): { pve: number; darkZone: number } | null {
  const pve = validSeconds(stats.timePve);
  const darkZone = validSeconds(stats.timeDarkZone);
  if (pve === null || darkZone === null) return null;
  const total = pve + darkZone;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { pve: pve / total, darkZone: 1 - pve / total };
}

// Couleurs et géométrie de la maquette « Fiche d'agent » (carte de 1000 × 560).
const COLORS = {
  accent: '#f65308',
  gold: '#f5aa04',
  background: '#1d110c',
  panel: '#26170f',
  initialSquare: '#50260b',
  barTrack: '#3a2518',
  white: '#ffffff',
  muted: '#a8a29e',
  pill: '#d6d3d1',
} as const;
/** Marges horizontales de la carte, et abscisse du bord droit du contenu. */
const MARGIN = 40;
const RIGHT = STATS_CARD_SIZE.width - MARGIN;
/** L'en-tête : 32 + avatar de 104 + 32, puis un trait accent de 2 px. */
const HEADER_HEIGHT = 168;
const CARDS = { top: 198, bottom: 497, gap: 20, radius: 18, padX: 24 } as const;
const CARD_WIDTH = (STATS_CARD_SIZE.width - 2 * MARGIN - 2 * CARDS.gap) / 3;

type Ctx = SKRSContext2D;
type Font = { weight: number; size: number; role: CardFontRole };

// Toujours la pile de familles : la mesure (fitText, fittingFont) et le dessin utilisent la même police
const fontOf = ({ weight, size, role }: Font) => cardFontStack(role, weight, size);
const title = (weight: number, size: number): Font => ({ weight, size, role: 'title' });
const body = (weight: number, size: number): Font => ({ weight, size, role: 'body' });
const mono = (weight: number, size: number): Font => ({ weight, size, role: 'mono' });

/** Règle la police et l'espacement des lettres, puis renvoie la largeur du texte. */
function measure(ctx: Ctx, text: string, font: Font, spacing = 0): number {
  ctx.font = fontOf(font);
  ctx.letterSpacing = `${spacing}px`;
  return ctx.measureText(cardText(text)).width;
}

/** Écrit un texte, en UN appel, à gauche de x (ou à droite, `align: 'right'`) sur la ligne de base y. */
function write(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  style: { font: Font; color: string; spacing?: number; align?: 'left' | 'right' },
): void {
  const width = measure(ctx, text, style.font, style.spacing);
  ctx.fillStyle = style.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(cardText(text), style.align === 'right' ? x - width : x, y);
}

/** Écrit un texte centré en (x, y) ; le centre vertical est celui de l'encre. */
function writeCentered(ctx: Ctx, text: string, x: number, y: number, font: Font, color: string) {
  const shown = cardText(text);
  measure(ctx, shown, font);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } =
    ctx.measureText(shown);
  ctx.fillText(shown, x, y + (ascent - descent) / 2);
}

/** Plus grande taille (≤ celle de `font`) pour laquelle le texte tient dans `maxWidth`. */
function fittingFont(ctx: Ctx, text: string, font: Font, maxWidth: number): Font {
  let fitted = font;
  while (fitted.size > 10 && measure(ctx, text, fitted) > maxWidth) {
    fitted = { ...fitted, size: fitted.size - 1 };
  }
  return fitted;
}

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

// --- En-tête -----------------------------------------------------------------------------------

interface HeaderColumn {
  label: string;
  value: string;
  color: string;
  width: number;
}

const COLUMN_LABEL = body(600, 14);
const COLUMN_VALUE = (color: string) => ({ font: title(700, 56), color });

/** Les colonnes NIVEAU et SCORE D'ÉQUIPEMENT présentes, avec leur largeur (la plus large du libellé et du chiffre). */
function headerColumns(ctx: Ctx, stats: Td2Career['stats']): HeaderColumn[] {
  const wanted = [
    { label: 'NIVEAU', stat: stats.level, color: COLORS.white },
    { label: "SCORE D'ÉQUIPEMENT", stat: stats.gearScore, color: COLORS.gold },
  ];
  return wanted.flatMap(({ label, stat, color }) => {
    if (!stat) return [];
    const value = formatStat(stat);
    const width = Math.max(
      measure(ctx, label, COLUMN_LABEL, 2),
      measure(ctx, value, COLUMN_VALUE(color).font),
    );
    return [{ label, value, color, width }];
  });
}

/** Dessine les colonnes alignées à droite ; renvoie l'abscisse de la plus à gauche. */
function drawHeaderColumns(ctx: Ctx, columns: HeaderColumn[]): number {
  let right = RIGHT;
  for (const column of columns.toReversed()) {
    write(ctx, column.label, right, 59, {
      font: COLUMN_LABEL,
      color: COLORS.muted,
      spacing: 2,
      align: 'right',
    });
    write(ctx, column.value, right, 114, { ...COLUMN_VALUE(column.color), align: 'right' });
    right -= column.width + 36;
  }
  return right + 36;
}

/** La pastille de spécialisation : texte, bord de 1 px, bouts ronds. */
function drawSpecialization(ctx: Ctx, text: string, x: number, maxWidth: number) {
  const font = body(400, 15);
  ctx.font = fontOf(font);
  ctx.letterSpacing = '0px';
  const label = fitText(ctx, cardText(text), maxWidth - 24 - 2);
  const width = measure(ctx, label, font) + 24 + 2;
  roundedRect(ctx, x + 0.5, 109.5, width - 1, 27, 13.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.initialSquare;
  ctx.stroke();
  write(ctx, label, x + 13, 128, { font, color: COLORS.pill });
}

function drawHeader(ctx: Ctx, career: Td2Career) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, 0, STATS_CARD_SIZE.width, HEADER_HEIGHT);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, HEADER_HEIGHT, STATS_CARD_SIZE.width, 2);

  roundedRect(ctx, MARGIN, 32, 104, 104, 20);
  ctx.fillStyle = COLORS.initialSquare;
  ctx.fill();
  const handleText = sanitizeLabel(career.handle);
  writeCentered(ctx, initialOf(handleText), MARGIN + 52, 84, title(700, 46), COLORS.gold);

  const columnsLeft = drawHeaderColumns(ctx, headerColumns(ctx, career.stats));
  // 168 = marge + avatar (104) + écart (24) ; 24 d'écart avant les colonnes de droite
  const textLeft = MARGIN + 104 + 24;
  const textWidth = columnsLeft - 24 - textLeft;
  const platform = TD2_PLATFORM_LABELS[career.platform].toUpperCase();
  write(ctx, `${platform} · THE DIVISION 2`, textLeft, 45, {
    font: body(600, 15),
    color: COLORS.accent,
    spacing: 3,
  });
  ctx.font = fontOf(title(700, 44));
  ctx.letterSpacing = '0px';
  const handle = fitText(ctx, cardText(handleText), textWidth);
  write(ctx, handle, textLeft, 94, { font: title(700, 44), color: COLORS.white });
  const specialization = career.stats.specialization;
  if (specialization) {
    drawSpecialization(ctx, sanitizeLabel(formatStat(specialization)), textLeft, textWidth);
  }
}

// --- Blocs de stats ----------------------------------------------------------------------------

type Block = { title: string; rows: [Td2StatKey, string][]; bar?: boolean };

const BLOCKS: Block[] = [
  {
    title: 'Temps de jeu',
    rows: [
      ['timePlayed', 'Total'],
      ['timePve', 'PvE'],
      ['timeDarkZone', 'Dark Zone'],
    ],
    bar: true,
  },
  {
    title: 'PvE',
    rows: [
      ['npcKills', 'Ennemis éliminés'],
      ['eliteKills', 'Élites'],
      ['namedKills', 'Nommés'],
      ['headshots', 'Tirs à la tête'],
    ],
  },
  {
    title: 'Dark Zone',
    rows: [
      ['dzRank', 'Rang'],
      ['roguesKilled', 'Renégats éliminés'],
      ['pvpKills', 'Agents éliminés'],
    ],
  },
];

/** Les lignes d'un bloc dont la stat est présente ; un bloc sans ligne n'est pas dessiné. */
function presentRows(block: Block, stats: Td2Career['stats']): [string, string][] {
  return block.rows.flatMap(([key, label]) => {
    const stat = stats[key];
    return stat ? [[label, formatStat(stat)] as [string, string]] : [];
  });
}

/** Libellé à gauche, valeur en mono à droite ; la valeur rétrécit plutôt que de mordre sur le libellé. */
function drawRow(ctx: Ctx, label: string, value: string, left: number, y: number) {
  const right = left + CARD_WIDTH - CARDS.padX;
  const labelFont = body(400, 17);
  const labelWidth = measure(ctx, label, labelFont);
  const valueFont = fittingFont(
    ctx,
    value,
    mono(400, 17),
    right - left - CARDS.padX - labelWidth - 12,
  );
  write(ctx, label, left + CARDS.padX, y, { font: labelFont, color: COLORS.muted });
  write(ctx, value, right, y, { font: valueFont, color: COLORS.white, align: 'right' });
}

/** La barre PvE (accent) / Dark Zone (or) sous les lignes de temps de jeu. */
function drawTimeBar(
  ctx: Ctx,
  split: { pve: number; darkZone: number },
  left: number,
  top: number,
) {
  const x = left + CARDS.padX;
  const width = CARD_WIDTH - 2 * CARDS.padX;
  ctx.save();
  roundedRect(ctx, x, top, width, 10, 5);
  ctx.clip();
  ctx.fillStyle = COLORS.barTrack;
  ctx.fillRect(x, top, width, 10);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(x, top, width * split.pve, 10);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(x + width * split.pve, top, width * split.darkZone, 10);
  ctx.restore();
}

function drawBlock(
  ctx: Ctx,
  block: Block,
  rows: [string, string][],
  stats: Td2Career['stats'],
  index: number,
) {
  const left = MARGIN + index * (CARD_WIDTH + CARDS.gap);
  roundedRect(ctx, left, CARDS.top, CARD_WIDTH, CARDS.bottom - CARDS.top, CARDS.radius);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  write(ctx, block.title, left + CARDS.padX, 242, {
    font: title(700, 22),
    color: COLORS.white,
  });
  // une ligne de 22,4 px et 14 px d'écart
  const pitch = 22.4 + 14;
  rows.forEach(([label, value], row) => drawRow(ctx, label, value, left, 262 + 17 + row * pitch));
  const split = block.bar ? timeSplit(stats) : null;
  if (split) drawTimeBar(ctx, split, left, 262 + rows.length * pitch + 4);
}

function drawBlocks(ctx: Ctx, stats: Td2Career['stats']) {
  const present = BLOCKS.map((block) => ({ block, rows: presentRows(block, stats) })).filter(
    ({ rows }) => rows.length > 0,
  );
  if (present.length === 0) {
    writeCentered(
      ctx,
      'Aucune statistique publique pour cet agent.',
      STATS_CARD_SIZE.width / 2,
      (CARDS.top + CARDS.bottom) / 2,
      body(400, 20),
      COLORS.muted,
    );
    return;
  }
  present.forEach(({ block, rows }, index) => drawBlock(ctx, block, rows, stats, index));
}

// --- Pied de page ------------------------------------------------------------------------------

/** Marque affichée à droite du pied de page. */
const FOOTER_BRAND = 'Phenix';
/** Hauteur disponible pour la mention, de y = 521 au bas de la carte (4 px de marge). */
const FOOTER = { top: 521, budget: 35 } as const;

/** Coupe la mention aux espaces pour que chaque ligne tienne dans `maxWidth`. */
function wrapWords(ctx: Ctx, text: string, font: Font, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(ctx, candidate, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * La mention exigée par le service n'est jamais tronquée : si elle ne tient pas sur une ligne à 14 px,
 * on la passe à la ligne, puis on réduit la police jusqu'à ce qu'elle tienne dans le pied.
 */
function creditLines(ctx: Ctx, credit: string, maxWidth: number): { lines: string[]; font: Font } {
  let font = body(400, 14);
  let lines = wrapWords(ctx, credit, font, maxWidth);
  const fits = () =>
    lines.length * font.size * 1.2 <= FOOTER.budget &&
    lines.every((line) => measure(ctx, line, font) <= maxWidth);
  while (!fits() && font.size > 6) {
    font = { ...font, size: font.size - 1 };
    lines = wrapWords(ctx, credit, font, maxWidth);
  }
  return { lines, font };
}

function drawFooter(ctx: Ctx, credit: string) {
  const brandFont = body(600, 14);
  const brandWidth = measure(ctx, FOOTER_BRAND, brandFont);
  write(ctx, FOOTER_BRAND, RIGHT, 535, {
    font: brandFont,
    color: COLORS.pill,
    align: 'right',
  });
  if (credit === '') return;
  const { lines, font } = creditLines(ctx, credit, RIGHT - MARGIN - brandWidth - 24);
  lines.forEach((line, index) =>
    write(ctx, line, MARGIN, FOOTER.top + font.size * 0.969 + index * font.size * 1.2, {
      font,
      color: COLORS.muted,
    }),
  );
}

/** Dessine la carte de stats : un PNG de STATS_CARD_SIZE. `credit` est exigé par le service de stats. */
export async function renderStatsCard(career: Td2Career, credit: string): Promise<Buffer> {
  registerCardFonts();
  const { width, height } = STATS_CARD_SIZE;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  roundedRect(ctx, 0, 0, width, height, 28);
  ctx.fillStyle = COLORS.background;
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawHeader(ctx, career);
  drawBlocks(ctx, career.stats);
  drawFooter(ctx, credit);
  ctx.restore();
  // encode : la compression PNG se fait hors du thread principal
  return await canvas.encode('png');
}

export interface CareerReplyDeps {
  render?: (career: Td2Career, credit: string) => Promise<Buffer>;
  logger?: { warn: (obj: object, msg: string) => void };
}

/** Texte alternatif : pseudo, plateforme, puis niveau et score s'ils existent. C'est le pseudo qu'on raccourcit. */
function careerAltText(career: Td2Career): string {
  const { level, gearScore } = career.stats;
  const details = [
    level && `niveau ${formatStat(level)}`,
    gearScore && `score d’équipement ${formatStat(gearScore)}`,
  ].filter(Boolean);
  const build = (name: string) =>
    [`Carte de stats de ${name} (${TD2_PLATFORM_LABELS[career.platform]})`, ...details].join(', ');
  return fitAltText(build, sanitizeLabel(career.handle));
}

/** Limite de Discord pour l'URL d'un bouton : au-delà, c'est toute la réponse qui serait refusée. */
const BUTTON_URL_MAX = 512;
const TRACKER_GG_HOST = new URL(TRACKER_GG_PROFILE_URL).hostname;

/**
 * Le bouton « Voir sur tracker.gg » sous la carte, ou null si `profileUrl` n'est pas une URL https
 * dont l'hôte est exactement celui de tracker.gg, sans identifiants ni port. Ne lève jamais.
 */
export function profileButton(profileUrl: string | null): ActionRowBuilder<ButtonBuilder> | null {
  if (profileUrl === null || profileUrl.length > BUTTON_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(profileUrl);
  } catch {
    return null;
  }
  const allowed =
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.hostname === TRACKER_GG_HOST &&
    url.href.length <= BUTTON_URL_MAX;
  if (!allowed) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url.href).setLabel('Voir sur tracker.gg'),
  );
}

/** La réponse de /td2 stats : la carte dessinée, ou l'embed de repli si le dessin échoue. */
export async function careerReply(
  career: Td2Career,
  credit: string,
  { render = renderStatsCard, logger }: CareerReplyDeps = {},
): Promise<
  | { files: AttachmentBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }
  | { embeds: EmbedBuilder[] }
> {
  try {
    const png = await render(career, credit);
    const files = [
      new AttachmentBuilder(png, { name: 'stats.png', description: careerAltText(career) }),
    ];
    // Le lien vers la page tracker.gg (jadis le titre cliquable de l'embed) : un bouton sous la carte
    const button = profileButton(career.profileUrl);
    return button ? { files, components: [button] } : { files };
  } catch {
    // Ni pseudo ni URL de profil dans le journal : des données personnelles
    logger?.warn({}, 'Carte de stats non dessinée, repli sur l’embed');
    return careerMessage(career, credit);
  }
}
