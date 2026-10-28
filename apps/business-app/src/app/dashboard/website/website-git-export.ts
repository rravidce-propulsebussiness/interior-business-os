'use server';

import { compileWebsite } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { websiteServices } from './service';

/** Portable HTML starting point for a developer-owned external Git project.
 * It is a rendered snapshot of one page, not the original React/Next source.
 */
export async function exportWebsitePageHtml(id: string, path: string):
  Promise<{ html: string; filename: string }> {
  const s = await websiteServices('website.custom_code.view');
  const site = await s.website.read(id);
  const page = site.document.pages.find(p => p.path === path);
  if (!page) throw new Error('Page unavailable');
  const build = compileWebsite({
    ...site.document,
    pages: site.document.pages.map(p => ({...p, visibility: 'public'})),
  });
  const html = websiteHtml(build, path, {
    preview: false, formsEnabled: false,
    assetBase: `/dashboard/website/${id}/media/`,
  });
  if (!html) throw new Error('Unable to export this page');
  const filename = page.path === '/' ? 'index.html' :
    (page.path.slice(1).replaceAll('/', '-') || 'page') + '.html';
  return {html, filename};
}
