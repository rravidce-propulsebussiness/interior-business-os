'use server';

import { validateDocument } from '@business-os/website-builder';
import { websiteServices } from './service';
import { saveWebsiteSection } from './actions';
import { fixedTemplateSections, preservesFixedTemplate, type FixedTemplateSection } from './fixed-template-guard';

/** Narrow owner save path: no section insertion, page reordering, CSS/theme changes
 * or template structure mutations are accepted here, even with a forged request. */
export async function saveFixedTemplateSection(
  id: string,
  version: number,
  section: FixedTemplateSection,
  value: unknown,
): Promise<{ version?: number; message: string }> {
  try {
    if (!fixedTemplateSections.includes(section))
      return { message: 'Only template content and images can be edited.' };
    const s = await websiteServices(section === 'assets' ? 'website.media.manage' : 'website.page.edit');
    if (!s.allowed('website.page.edit'))
      return { message: 'Website content editing permission is required.' };
    const site = await s.website.read(id);
    if (site.version !== version)
      return { message: 'Website changed elsewhere. Reload before saving.' };
    const next = validateDocument({ ...site.document, [section]: value });
    if (!preservesFixedTemplate(site.document, next, section))
      return { message: 'Template structure is locked. Only text, images and logos may change.' };
    return saveWebsiteSection(id, version, section, next[section]);
  } catch {
    return { message: 'Unable to save fixed template content. Check permissions and reload.' };
  }
}
