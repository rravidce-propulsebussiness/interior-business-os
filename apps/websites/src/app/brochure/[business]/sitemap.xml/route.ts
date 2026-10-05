import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { escapeHtml } from '@business-os/brochure-builder/render';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ business: string }> },
) {
  const { business } = await params;
  const origin = process.env.BROCHURE_PUBLIC_ORIGIN;
  if (!origin || !isSupabaseConfigured())
    return new Response('Not found', { status: 404 });
  const r = await createPublicDatabase().rpc('brochure_sitemap', {
    p_business: business,
  });
  const items = Array.isArray(r.data) ? r.data : [];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.flatMap((x) => (x && typeof x === 'object' && !Array.isArray(x) ? [`<url><loc>${escapeHtml(new URL(`/brochure/${business}/${x.slug}`, origin).toString())}</loc><lastmod>${escapeHtml(String(x.updated).slice(0, 10))}</lastmod></url>`] : [])).join('')}</urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'no-store',
      },
    },
  );
}
