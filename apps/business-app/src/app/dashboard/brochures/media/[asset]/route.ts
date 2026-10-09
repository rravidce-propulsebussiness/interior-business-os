import { brochureServices } from '../../service';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  try {
    const s = await brochureServices('brochure.media.manage');
    const a = await s.brochure.asset((await params).asset);
    const bytes = Buffer.from(String(a.data), 'base64');
    // Assets are already validated on upload. Cloudflare Workers cannot load
    // Sharp's native binary, so thumbnail requests safely reuse the source.
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': String(a.mime ?? 'image/webp'),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
