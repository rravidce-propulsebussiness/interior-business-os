'use server';

import { validateDocument, type WebsiteDocument } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { websiteServices } from './service';

/**
 * The Design Studio sends only the edited theme and requested path.
 * The rest of the document stays on the server. This call happens when the
 * user explicitly opens or refreshes their real website preview, never on
 * every color-picker movement.
 */
export async function renderWebsiteThemePreview(
  id: string,
  theme: WebsiteDocument['theme'],
  path: string,
): Promise<string | null> {
  const s = await websiteServices('website.view');
  const site = await s.website.read(id);
  const document = validateDocument({ ...site.document, theme });
  if (document.code.length && !s.allowed('website.custom_code.view'))
    throw new Error('Custom code access required');
  const build = compileWebsite({
    ...document,
    pages: document.pages.map(page => ({ ...page, visibility: 'public' })),
  });
  return websiteHtml(build, path, {
    preview: true,
    assetBase: `/dashboard/website/${id}/media/`,
  });
}
