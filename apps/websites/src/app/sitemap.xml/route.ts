import { currentWebsite } from '../../website';
import { escapeHtml } from '@business-os/website-builder/compiler';
export async function GET() {
  const site = await currentWebsite();
  if (!site) return new Response('Not found', { status: 404 });
  const pages = site.build.document.settings.noindex
    ? []
    : site.build.document.pages.filter((p) => !p.seo.noindex);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${escapeHtml(`https://${site.host}${p.path}`)}</loc><lastmod>${escapeHtml(site.publishedAt)}</lastmod></url>`).join('')}</urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
