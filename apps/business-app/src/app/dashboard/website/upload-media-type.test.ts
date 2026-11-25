import { describe, expect, it } from 'vitest';
import { isSupportedWebsiteMp4 } from './upload-media-type';
import { prepareMarketingImage } from '@business-os/shared/media';

function ftyp(brand: string) {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftyp'),
    Buffer.from(brand),
    Buffer.alloc(12),
  ]);
}

describe('website media format classification', () => {
  it('recognizes supported MP4 video brand signatures', () => {
    for (const brand of ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '])
      expect(isSupportedWebsiteMp4(ftyp(brand))).toBe(true);
  });

  it('does not classify AVIF images as MP4 videos', async () => {
    expect(isSupportedWebsiteMp4(ftyp('avif'))).toBe(false);
    expect(isSupportedWebsiteMp4(ftyp('avis'))).toBe(false);
    const image = await prepareMarketingImage(ftyp('avif'));
    expect(image.mime).toBe('image/avif');
  });

  it('does not classify unrelated files as videos', () => {
    expect(isSupportedWebsiteMp4(Buffer.from('short'))).toBe(false);
    expect(isSupportedWebsiteMp4(Buffer.from('%PDF-1.4'))).toBe(false);
    expect(isSupportedWebsiteMp4(Buffer.from('this is not a video'))).toBe(false);
  });

  it('the migration allows all image formats validated in the editor', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../../../../../../packages/database/supabase/migrations/20261103203000_website_image_mime_alignment.sql', import.meta.url), 'utf8');
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
      expect(sql).toContain(`'${mime}'`);
    expect(sql).toContain('website_assets_mime_check');
  });
});
