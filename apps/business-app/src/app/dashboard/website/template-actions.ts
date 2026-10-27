'use server';

import { revalidatePath } from 'next/cache';
import { compileWebsite, validateCss, validateJavaScript, sanitizeHtml } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { safeFailure } from '@business-os/shared';
import { websiteServices } from './service';
import { applyTemplateDraft, type TemplateDraft } from './template-workspace';

function verifyCode(input: TemplateDraft) {
  validateCss(input.css);
  for (const item of input.code) {
    sanitizeHtml(item.html);
    validateCss(item.css);
    validateJavaScript(item.javascript);
  }
}
async function editableDocument(id: string, input: TemplateDraft) {
  const s = await websiteServices('website.custom_code.view');
  const site = await s.website.read(id);
  const doc = applyTemplateDraft(site.document, input);
  verifyCode(input);
  return { s, site, doc };
}

export async function validateTemplateFiles(id: string, input: TemplateDraft) {
  try {
    await editableDocument(id, input);
    return { ok: true, message: 'Template files validated.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}

export async function previewTemplateFiles(id: string, input: TemplateDraft, path: string) {
  const { doc } = await editableDocument(id, input);
  return websiteHtml(compileWebsite({
    ...doc,
    pages: doc.pages.map(p => ({ ...p, visibility: 'public' })),
  }), path, { preview: true, assetBase: `/dashboard/website/${id}/media/` });
}

/** A small file-only payload; all visual template nodes are read and preserved
 * on the server. Versioned section saves are not atomic. If a partial write
 * fails, the editor must reload before further edits. */
export async function saveTemplateFiles(id: string, version: number, input: TemplateDraft):
  Promise<{ saved: boolean; version?: number; partial?: boolean; message: string }> {
  let nextVersion = version;
  let writes = 0;
  try {
    const { s, site, doc } = await editableDocument(id, input);
    if (site.version !== version)
      throw new Error('Someone updated this website. Reload to use the latest draft.');
    const changes = (['code','css','pages'] as const).filter(section =>
      JSON.stringify(site.document[section]) !== JSON.stringify(doc[section]));
    for (const section of changes) {
      const permission = section === 'code' ? 'website.custom_code.edit'
        : section === 'css' ? 'website.custom_css.manage' : 'website.page.edit';
      if (!s.allowed(permission))
        throw new Error('You lack permission to change ' + section);
      if (section === 'pages' &&
        (!s.allowed('website.page.create') || !s.allowed('website.seo.manage')))
        throw new Error('Page creation and SEO permissions are required');
    }
    for (const section of changes) {
      nextVersion = await s.website.save(id, nextVersion, section, doc[section]);
      writes++;
    }
    revalidatePath(`/dashboard/website/${id}`);
    revalidatePath(`/dashboard/website/${id}/developer`);
    return { saved: true, version: nextVersion,
      message: changes.length ? 'Template draft saved. Publish when ready.' : 'Everything is already saved.' };
  } catch (error) {
    return {
      saved: false, version: writes ? nextVersion : undefined, partial: writes > 0,
      message: (writes ? 'Some files saved. Reload this page before editing again. ' : '') +
        safeFailure(error).message,
    };
  }
}
