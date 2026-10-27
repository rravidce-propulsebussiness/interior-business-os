'use server';

import { revalidatePath } from 'next/cache';
import { validateDocument, type WebsiteDocument } from '@business-os/website-builder';
import { validateCss, validateJavaScript, sanitizeHtml } from '@business-os/website-builder/compiler';
import { websiteServices } from './service';
import { safeFailure } from '@business-os/shared';

type WorkspaceInput = Pick<WebsiteDocument, 'code' | 'css' | 'pages'>;

function checkWorkspace(doc: WebsiteDocument) {
  validateCss(doc.css);
  for (const item of doc.code) {
    sanitizeHtml(item.html);
    validateCss(item.css);
    validateJavaScript(item.javascript);
  }
}

export async function validateWebsiteSource(id: string, input: WorkspaceInput) {
  try {
    const s = await websiteServices('website.custom_code.view');
    const site = await s.website.read(id);
    const doc = validateDocument({ ...site.document, ...input });
    checkWorkspace(doc);
    return { ok: true, message: 'Source validated. Ready to save as a draft.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}

/** Uses the existing versioned, permission-checked website_save RPC.
 * Code saves first to avoid dangling page references. Every section save
 * checks the updated version. Do not claim transactional atomicity here:
 * if a later section fails the UI must reload the latest draft.
 */
export async function saveWebsiteSource(
  id: string, version: number, input: WorkspaceInput,
): Promise<{ version?: number; message: string; saved: boolean }> {
  let currentVersion = version;
  let changed = 0;
  try {
    const s = await websiteServices('website.custom_code.edit');
    const site = await s.website.read(id);
    if (site.version !== version) throw new Error('Another editor saved this website. Reload the latest draft before retrying.');
    const doc = validateDocument({ ...site.document, ...input });
    checkWorkspace(doc);
    const sections = (['code', 'css', 'pages'] as const).filter(key =>
      JSON.stringify(doc[key]) !== JSON.stringify(site.document[key]));
    for (const section of sections) {
      const permission = section === 'css' ? 'website.custom_css.manage'
        : section === 'pages' ? 'website.page.edit' : 'website.custom_code.edit';
      if (!s.allowed(permission)) throw new Error('You do not have permission to update ' + section);
      if (section === 'pages') {
        const previous = new Map(site.document.pages.map(p => [p.id, p]));
        for (const p of doc.pages) {
          if (!previous.has(p.id) && !s.allowed('website.page.create'))
            throw new Error('Page creation permission required');
          const before = previous.get(p.id);
          if ((!before || before.path !== p.path || JSON.stringify(before.seo) !== JSON.stringify(p.seo)) &&
              !s.allowed('website.seo.manage'))
            throw new Error('SEO permission required to create or change page URLs');
        }
        if (site.document.pages.some(p => !doc.pages.some(next => next.id === p.id)) &&
            !s.allowed('website.page.delete'))
          throw new Error('Page deletion permission required');
      }
    }
    for (const section of sections) {
      currentVersion = await s.website.save(id, currentVersion, section, doc[section]);
      changed++;
    }
    revalidatePath('/dashboard/website/' + id);
    revalidatePath('/dashboard/website/' + id + '/developer');
    return { version: currentVersion, saved: true,
      message: sections.length ? 'Draft files saved. Publish when ready.' : 'No changes to save.' };
  } catch (error) {
    if (changed)
      return { saved: false, version: currentVersion,
        message: 'Some files saved, but another section could not be saved. Reload before editing again. ' +
          safeFailure(error).message };
    return { saved: false, message: safeFailure(error).message };
  }
}
