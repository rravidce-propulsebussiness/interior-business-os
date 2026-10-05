import sharp from 'sharp';
import { brochureServices } from '../../service';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  try {
    const s = await brochureServices('brochure.media.manage');
    const a = await s.brochure.asset((await params).asset);
    let bytes = Buffer.from(String(a.data), 'base64');
    if (new URL(request.url).searchParams.has('thumbnail'))
      bytes = await sharp(bytes)
        .resize({
          width: 500,
          height: 500,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
