import sharp from 'sharp';
/** Preserve source resolution up to a safe 40MP decode limit; cropping remains layout metadata. */
export async function prepareMarketingImage(input: Buffer, print = false) {
  if (input.length > 10485760) throw new Error('Choose an image up to 10 MB');
  const image = sharp(input, { limitInputPixels: 40000000 });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format ?? ''))
    throw new Error('Use a JPEG, PNG, WebP or AVIF image');
  const rotated = image.rotate();
  const pipeline = print
    ? rotated
    : rotated.resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      });
  const result = await pipeline
    .webp({ quality: print ? 96 : 84 })
    .toBuffer({ resolveWithObject: true });
  if (result.data.length > 10485760)
    throw new Error('Prepared image exceeds 10 MB');
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
    mime: 'image/webp' as const,
  };
}
