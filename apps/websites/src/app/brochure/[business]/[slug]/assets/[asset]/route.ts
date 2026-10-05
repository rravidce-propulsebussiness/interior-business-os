import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import sharp from 'sharp';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ business: string; slug: string; asset: string }> },
) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const { business, slug, asset } = await params;
    if (!isSupabaseConfigured())
      return new Response('Not found', { status: 404, headers });
    const r = await createPublicDatabase().rpc('brochure_public', {
      p_business: business,
      p_slug: slug,
      p_action: 'asset',
      p_asset_id: asset,
    });
    if (
      r.error ||
      !r.data ||
      typeof r.data !== 'object' ||
      Array.isArray(r.data)
    )
      return new Response('Not found', { status: 404, headers });
    let bytes = Buffer.from(String(r.data.data), 'base64');
    if (new URL(request.url).searchParams.has('thumbnail'))
      bytes = await sharp(bytes)
        .resize({
          width: 1400,
          height: 1400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, 'Content-Type': 'image/webp' },
    });
  } catch {
    return new Response('Not found', { status: 404, headers });
  }
}
