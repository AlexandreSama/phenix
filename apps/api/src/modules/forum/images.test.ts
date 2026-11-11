import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageRejectedError, processForumImage } from './images.js';

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#e85d04' } });

/** Une image d'animation. Deux images identiques fusionneraient en une : on change la couleur. */
const frame = (background: string) =>
  sharp({ create: { width: 60, height: 40, channels: 4, background } })
    .png()
    .toBuffer();

describe('processForumImage', () => {
  it('retire les métadonnées et plafonne les côtés à 2048 px', async () => {
    const input = await photo(4000, 3000)
      .jpeg()
      .withExif({ IFD0: { Artist: 'Agent47', Copyright: 'Phenix' } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await processForumImage(input);
    const metadata = await sharp(output.data).metadata();

    expect([output.width, output.height]).toEqual([2048, 1536]);
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
  });

  it('applique l’orientation de l’appareil photo', async () => {
    // Orientation 6 : l'appareil était tourné d'un quart de tour ; la photo s'affiche en portrait
    const input = await photo(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const output = await processForumImage(input);

    expect([output.width, output.height]).toEqual([200, 400]);
  });

  it('n’agrandit pas une petite image, et garde un GIF animé', async () => {
    const animated = await sharp([await frame('#ffb703'), await frame('#023047')], {
      join: { animated: true },
    })
      .gif()
      .toBuffer();

    const output = await processForumImage(animated);

    expect([output.width, output.height]).toEqual([60, 40]);
    expect((await sharp(output.data).metadata()).pages).toBe(2);
  });

  it('refuse un SVG et un fichier qui n’est pas une image', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

    await expect(processForumImage(svg)).rejects.toThrow(ImageRejectedError);
    await expect(processForumImage(Buffer.from('MZ\x90\x00'))).rejects.toThrow(
      "Ce fichier n'est pas une image lisible.",
    );
  });
});
