'use server';

import { revalidatePath } from 'next/cache';
import { createNode, type WebsiteNode } from '@business-os/website-builder';
import { compileWebsite, sanitizeHtml, validateCss } from '@business-os/website-builder/compiler';
import { renderWebsite } from '@business-os/website-builder/render';
import { websiteServices } from './service';
import { safeFailure } from '@business-os/shared';

/** Conversion produces a new code-backed DRAFT PAGE. It never replaces
 * the existing visual page or changes the published website. Not all
 * interactive widgets can be faithfully represented as static HTML.
 */
export async function convertPageToCodeDraft(id: string, version: number, pageId: string):
 Promise<{ created: boolean; pageId?: string; message: string }> {
  let changed = false;
  try {
    const s = await websiteServices('website.custom_code.edit');
    for (const right of ['website.page.edit','website.page.create','website.seo.manage'])
      if (!s.allowed(right))
        throw new Error('Your role cannot create an editable code copy.');
    const site = await s.website.read(id);
    if (site.version !== version)
      throw new Error('Website changed. Reload the editor before converting.');
    const page = site.document.pages.find(p => p.id === pageId);
    if (!page || !page.nodes.length)
      throw new Error('Choose a page with content to convert.');
    if (site.document.code.length >= 30 || site.document.pages.length >= 200)
      throw new Error('Your website reached the page or code file limit.');
    const allowed = new Set([
      'hero','section','container','columns','grid','card','cta','contact',
      'heading','text','button','logo','navigation','footer','divider',
    ]);
    const verify = (nodes: WebsiteNode[]): boolean =>
      nodes.every(n => allowed.has(n.type) && !n.props.asset && verify(n.children));
    if (!verify(page.nodes))
      throw new Error('This page includes media, forms, embeds, or dynamic blocks. Use visual editing or the HTML export; automatic code conversion supports text-based sections.');
    const slug = page.path === '/' ? 'home' : page.path.slice(1).replaceAll('/', '-');
    const path = '/' + slug + '-code';
    if (site.document.pages.some(item => item.path === path))
      throw new Error('A code-copy page already exists. Open it from the Files editor.');
    const built = compileWebsite({
      ...site.document,
      pages: site.document.pages.map(p => ({...p, visibility:'public'})),
    });
    const output = renderWebsite(built, page.path, {
      preview: true, formsEnabled: false,
    });
    if (!output) throw new Error('Unable to convert the current page.');
    const marker = '<main id="main-content" tabindex="-1">';
    const start = output.body.indexOf(marker), end = output.body.indexOf('</main>',start);
    if (start < 0 || end < 0) throw new Error('Page source could not be converted.');
    const html = output.body.slice(start+marker.length,end).trim();
    if (html.length > 50000 || output.css.length > 50000)
      throw new Error('This page exceeds the safe HTML/CSS file limits.');
    sanitizeHtml(html);
    validateCss(output.css);
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const codeId = 'n' + suffix;
    const newPageId = 'n' + crypto.randomUUID().replaceAll('-', '');
    const copyNode = createNode('custom','n' + crypto.randomUUID().replaceAll('-', ''));
    copyNode.props = { code:codeId };
    const updatedCode = [...site.document.code, {
      id:codeId, name:`pages/${slug}-code.html`, html,
      css:output.css, javascript:'',
    }];
    const updatedPages = [...site.document.pages, {
      ...structuredClone(page), id:newPageId,
      title:(page.title + ' Code').slice(0,160), path, visibility:'draft' as const,
      seo: {...page.seo, title:(page.seo.title + ' Code').slice(0,160), noindex:true},
      nodes:[copyNode],
    }];
    const nextVersion = await s.website.save(id, version, 'code', updatedCode);
    changed = true;
    await s.website.save(id, nextVersion, 'pages', updatedPages);
    revalidatePath(`/dashboard/website/${id}`);
    revalidatePath(`/dashboard/website/${id}/developer`);
    return {created:true, pageId:newPageId, message:'Editable HTML/CSS draft copy created. Original visual page is unchanged.'};
  } catch(e) {
    return {created:false, message:(changed
      ? 'The HTML file was saved but the draft page could not be attached. Reload before retrying. '
      : '') + safeFailure(e).message};
  }
}
