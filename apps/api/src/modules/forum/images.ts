import { FORUM_LIMITS } from '@phenix/shared';
import sharp from 'sharp';

/** Les formats acceptés, lus dans le fichier lui-même : un nom en .png ne prouve rien. */
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif']);

/** Au-delà de 50 mégapixels, sharp refuse de décoder : une « bombe » de 1 Ko ne gonfle pas en mémoire. */
const MAX_PIXELS = 50_000_000;

/** Un fichier refusé : le message est destiné à la personne qui l'a envoyé. */
export class ImageRejectedError extends Error {}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Vérifie qu'un fichier est bien une image, puis le ré-encode en WebP : l'orientation de
 * l'appareil photo est appliquée, les métadonnées (EXIF, position GPS) disparaissent, et les
 * côtés sont plafonnés. Un GIF animé reste animé.
 */
export async function processForumImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  let pages = 1;
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    format = metadata.format;
    pages = metadata.pages ?? 1;
  } catch {
    throw new ImageRejectedError("Ce fichier n'est pas une image lisible.");
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new ImageRejectedError('Formats acceptés : PNG, JPEG, WebP et GIF.');
  }

  const animated = pages > 1;
  const pipeline = sharp(input, { animated, limitInputPixels: MAX_PIXELS });
  // L'orientation EXIF ne concerne que les photos ; une animation n'en a pas
  if (!animated) pipeline.rotate();
  try {
    const { data, info } = await pipeline
      .resize({
        width: FORUM_LIMITS.imageMaxSide,
        height: FORUM_LIMITS.imageMaxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    // Une animation est rendue en bande verticale : pageHeight est la hauteur d'une image
    return { data, width: info.width, height: info.pageHeight ?? info.height };
  } catch {
    throw new ImageRejectedError("Cette image n'a pas pu être lue jusqu'au bout.");
  }
}
