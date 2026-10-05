import { currentWebsite } from '../../website';
export async function GET() {
  const site = await currentWebsite();
  return new Response(
    !site || site.build.document.settings.noindex
      ? 'User-agent: *\nDisallow: /\nAllow: /brochure/\n'
      : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://${site.host}/sitemap.xml\n`,
    { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } },
  );
}
