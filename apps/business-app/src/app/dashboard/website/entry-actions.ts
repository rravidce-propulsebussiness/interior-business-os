'use server';

import { revalidatePath } from 'next/cache';
import { validateTemplate, starterTemplate, type WebsiteDocument } from '@business-os/website-builder';
import { isUnconfiguredWebsite } from './entry-state';
import { validateCss, validateJavaScript, sanitizeHtml } from '@business-os/website-builder/compiler';
import { websiteServices } from './service';
import { safeFailure, idSchema } from '@business-os/shared';

const builtins = new Set(['starter:construction','starter:services','starter:interior']);

function builtin(name: string, selected: string) {
  const kind = selected === 'starter:construction' ? 'construction' : 'services';
  const doc = starterTemplate(name, kind);
  if (selected === 'starter:interior') {
    doc.pages[0]!.nodes[0]!.props.title = 'Beautiful interiors, thoughtfully made.';
    doc.pages[0]!.nodes[0]!.props.subtitle = 'Your interior design studio';
    doc.theme.primary = '#A35A3C';
    doc.theme.accent = '#CB8E63';
  }
  return validateTemplate(doc);
}

/**
 * Apply a template only to a website with no authored content and no published
 * version. Saved content is never replaced. Existing website versions enforce
 * optimistic concurrency; if a multi-section save is interrupted, the user must
 * reload before doing any other edits.
 */
export async function applyWebsiteTemplate(
  id: string,
  version: number,
  templateChoice: string,
): Promise<{ saved: boolean; message: string }> {
  let completed = 0;
  try {
    const s = await websiteServices('website.manage');
    const site = await s.website.read(id);
    if (site.version !== version)
      throw new Error('Website changed. Reload before choosing a template.');
    if (!isUnconfiguredWebsite(site.document, Boolean(site.publishedVersionId)))
      throw new Error('This website already contains saved content. Your existing pages will not be replaced.');

    let template: WebsiteDocument;
    if (builtins.has(templateChoice)) {
      template = builtin(site.name, templateChoice);
    } else {
      const idValue = idSchema.parse(templateChoice);
      const row = await s.client.from('website_templates')
        .select('document,status').eq('id', idValue).eq('status', 'published').single();
      if (row.error || !row.data) throw new Error('Template unavailable. Choose another.');
      template = validateTemplate(row.data.document);
    }

    // Preserve tenant-owned company details, keeping the template portable.
    template.settings = { ...template.settings,
      name: site.name, phone: site.document.settings.phone,
      email: site.document.settings.email, address: site.document.settings.address,
      timezone: site.document.settings.timezone,
    };
    // Existing hosted preview/publish policies apply to all imported source.
    validateCss(template.css);
    for (const item of template.code) {
      sanitizeHtml(item.html); validateCss(item.css);
      validateJavaScript(item.javascript);
    }
    const sections = ([
      'theme','css','forms','content','code','navigation','footerNavigation',
      'header','footer','pages','sections','settings',
    ] as const).filter(section =>
      JSON.stringify(template[section]) !== JSON.stringify(site.document[section]));

    const permission = {
      theme: 'website.theme.manage', css: 'website.custom_css.manage',
      forms: 'website.form.manage', content: 'website.page.edit',
      code: 'website.custom_code.edit', navigation: 'website.navigation.manage',
      footerNavigation: 'website.navigation.manage',
      header: 'website.page.edit', footer: 'website.page.edit',
      pages: 'website.page.edit', sections: 'website.page.edit',
      settings: 'website.seo.manage',
    } as const;
    for (const section of sections) {
      if (!s.allowed(permission[section]))
        throw new Error('Your plan or role cannot use this template. Missing ' + section + ' permission.');
    }
    if (sections.includes('pages')) {
      if (!s.allowed('website.page.create') || !s.allowed('website.seo.manage'))
        throw new Error('Page creation and SEO permissions are required.');
      if (site.document.pages.some(oldPage =>
        !template.pages.some(nextPage => nextPage.id === oldPage.id)) &&
        !s.allowed('website.page.delete'))
        throw new Error('Removing blank placeholders requires page deletion permission.');
    }

    let nextVersion = version;
    for (const section of sections) {
      nextVersion = await s.website.save(id, nextVersion, section, template[section]);
      completed++;
    }
    revalidatePath(`/dashboard/website/${id}`);
    revalidatePath('/dashboard/website');
    return { saved: true, message: 'Template applied to your draft. Edit your content and publish when ready.' };
  } catch (error) {
    return { saved: false,
      message: (completed ? 'Template setup partially saved. Reload to inspect the draft before continuing. ' : '') +
        safeFailure(error).message,
    };
  }
}
