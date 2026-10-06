'use server';
import { revalidatePath } from 'next/cache';
import {
  emptyWebsite,
  validateDocument,
  type WebsiteDocument,
} from '@business-os/website-builder';
import {
  compileWebsite,
  validateCss,
  validateJavaScript,
  sanitizeHtml,
} from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { websiteServices, signWebsite } from './service';
import { safeFailure } from '@business-os/shared';
import { interiorWebsite } from '@business-os/industry-interior/website';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { prepareMarketingImage } from '@business-os/shared/media';
const permission: Record<string, string> = {
  pages: 'website.page.edit',
  theme: 'website.theme.manage',
  css: 'website.custom_css.manage',
  navigation: 'website.navigation.manage',
  footerNavigation: 'website.navigation.manage',
  forms: 'website.form.manage',
  code: 'website.custom_code.edit',
  settings: 'website.seo.manage',
  header: 'website.page.edit',
  footer: 'website.page.edit',
  sections: 'website.page.edit',
  content: 'website.page.edit',
  assets: 'website.media.manage',
};
function message(error: unknown) {
  const failure = safeFailure(error);
  return `${failure.message} Reference: ${failure.requestId}`;
}
export async function createWebsite(name: string, slug: string) {
  try {
    const s = await websiteServices('website.manage');
    if (
      name.length > 160 ||
      !name.trim() ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 63
    )
      throw new Error('Enter a name and a safe subdomain slug');
    const id = await s.website.create(name, slug, emptyWebsite(name));
    revalidatePath('/dashboard/website');
    return { id, message: 'Website created' };
  } catch (e) {
    return { message: message(e) };
  }
}
export async function saveWebsiteSection(
  id: string,
  version: number,
  section: string,
  value: unknown,
) {
  try {
    const required = permission[section];
    if (!required) throw new Error('Unknown section');
    const s = await websiteServices(required);
    const site = await s.website.read(id);
    if (site.version !== version)
      throw new Error('Draft changed. Reload before saving.');
    const document = validateDocument({ ...site.document, [section]: value });
    if (section === 'forms' && document.forms.some((f) => f.enabled)) {
      const crm = await s.client.rpc('website_prepare_crm', {
        p_organization_id: s.context.organizationId,
        p_website_id: id,
      });
      if (crm.error)
        throw new Error(
          'Enable CRM and configure an open pipeline stage before enabling enquiry forms.',
        );
    }
    if (section === 'css') validateCss(document.css);
    if (section === 'code')
      for (const code of document.code) {
        validateJavaScript(code.javascript);
        sanitizeHtml(code.html);
        validateCss(code.css);
      }
    const nextVersion = await s.website.save(
      id,
      version,
      section,
      document[section as keyof WebsiteDocument],
    );
    revalidatePath(`/dashboard/website/${id}`);
    return {
      version: nextVersion,
      message: 'Draft saved. Published content is unchanged.',
    };
  } catch (e) {
    return { message: message(e) };
  }
}
export async function previewWebsite(
  id: string,
  path: string,
  versionId?: string,
) {
  const s = await websiteServices();
  const site = await s.website.read(id, versionId);
  const build = compileWebsite({
    ...site.document,
    pages: site.document.pages.map((p) => ({ ...p, visibility: 'public' })),
  });
  return websiteHtml(build, path, {
    preview: true,
    assetBase: `/dashboard/website/${id}/media/`,
  });
}
export async function renderDraftPreview(
  id: string,
  input: unknown,
  path: string,
) {
  const s = await websiteServices();
  await s.website.read(id);
  const doc = validateDocument(input);
  if (doc.code.length && !s.allowed('website.custom_code.view'))
    throw new Error('Custom code access required');
  return websiteHtml(
    compileWebsite({
      ...doc,
      pages: doc.pages.map((p) => ({ ...p, visibility: 'public' })),
    }),
    path,
    {
      preview: true,
      assetBase: `/dashboard/website/${id}/media/`,
    },
  );
}
export async function publishWebsite(
  id: string,
  version: number,
  summary: string,
  restoreId?: string,
) {
  try {
    const s = await websiteServices('website.page.publish');
    const current = await s.website.read(id);
    if (current.version !== version)
      throw new Error('Draft changed. Reload before publishing.');
    const selected = restoreId ? await s.website.read(id, restoreId) : current;
    if (selected.document.code.length && !s.allowed('website.custom_code.view'))
      throw new Error('Custom code view permission required');
    const build = compileWebsite(selected.document);
    const proof = signWebsite({
      purpose: 'website.publish',
      organizationId: s.context.organizationId,
      websiteId: id,
      version,
      restoreId: restoreId ?? null,
      build,
    });
    const publication = await s.website.publish(
      id,
      version,
      proof.body,
      proof.signature,
      summary.slice(0, 500),
      restoreId,
    );
    revalidatePath(`/dashboard/website/${id}`);
    return {
      id: publication,
      message: restoreId
        ? 'Restored as a new published version'
        : 'Website published',
    };
  } catch (e) {
    return { message: message(e) };
  }
}
export async function changeWebsiteStatus(
  id: string,
  version: number,
  status: 'unpublished' | 'archived',
) {
  try {
    const s = await websiteServices('website.page.publish');
    await s.website.status(id, version, status);
    revalidatePath('/dashboard/website');
    return { saved: true, message: 'Website status updated' };
  } catch (e) {
    return { saved: false, message: message(e) };
  }
}

export async function applyInteriorStarter(id: string, version: number) {
  try {
    const s = await websiteServices('website.manage');
    const current = await s.website.read(id);
    if (
      current.version !== version ||
      current.document.pages.some((p) => p.nodes.length)
    )
      throw new Error('The starter requires an empty, unchanged draft.');
    const sections = [
      'assets',
      'forms',
      'content',
      'pages',
      'navigation',
      'footerNavigation',
      'settings',
      'theme',
    ] as const;
    for (const section of sections)
      if (!s.allowed(permission[section]!))
        throw new Error('Starter permissions are missing');
    if (!s.allowed('website.page.create'))
      throw new Error('Page creation permission required');
    const bytes = await readFile(
      resolve(
        process.cwd(),
        '../../packages/industry-interior/assets/living-room-concept.webp',
      ),
    );
    const starterImage = await prepareMarketingImage(bytes, true);
    const width = starterImage.width ?? 1536;
    const height = starterImage.height ?? 1024;
    const proof = signWebsite({
      purpose: 'website.asset',
      organizationId: s.context.organizationId,
      websiteId: id,
      name: 'living-room-concept.webp',
      mime: 'image/webp',
      width,
      height,
      alt: 'AI-generated interior concept',
      digest: createHash('sha256').update(bytes).digest('hex'),
    });
    const asset = await s.client.rpc('website_asset_save', {
      p_organization_id: s.context.organizationId,
      p_website_id: id,
      p_proof: proof.body,
      p_signature: proof.signature,
      p_data: bytes.toString('base64'),
    });
    if (asset.error || !asset.data)
      throw new Error('Unable to add starter media. Check storage limits.');
    const doc = interiorWebsite(asset.data, width, height);
    const crm = await s.client.rpc('website_prepare_crm', {
      p_organization_id: s.context.organizationId,
      p_website_id: id,
    });
    if (crm.error) doc.forms = doc.forms.map((f) => ({ ...f, enabled: false }));
    doc.settings.name = current.name;
    let next = version;
    for (const section of sections)
      next = await s.website.save(id, next, section, doc[section]);
    revalidatePath(`/dashboard/website/${id}`);
    return {
      saved: true,
      message:
        'Editable starter added to your draft. Review all content before publishing.',
    };
  } catch (e) {
    revalidatePath(`/dashboard/website/${id}`);
    return {
      saved: false,
      message: `${message(e)} Reload to review the current draft.`,
    };
  }
}

export async function websiteSourceChoices(
  id: string,
  kind: 'catalog_items' | 'projects',
  query: string,
  page: number,
) {
  const s = await websiteServices('website.page.edit');
  const result = await s.client.rpc('website_source_choices', {
    p_organization_id: s.context.organizationId,
    p_website_id: id,
    p_kind: kind,
    p_query: query.slice(0, 100),
    p_page: page,
  });
  if (result.error || !Array.isArray(result.data))
    throw new Error('Source access unavailable');
  return result.data as { id: string; title: string; description?: string }[];
}

export async function manageWebsiteAsset(
  site: string,
  asset: string,
  version: number,
  name: string,
  alt: string,
  archive: boolean,
) {
  try {
    const s = await websiteServices('website.media.manage');
    await s.website.read(site);
    const owned = await s.client
      .from('website_assets')
      .select('id')
      .eq('id', asset)
      .eq('website_id', site)
      .eq('organization_id', s.context.organizationId)
      .single();
    if (owned.error) throw new Error('Media unavailable');
    const r = await s.client.rpc('website_asset_manage', {
      p_organization_id: s.context.organizationId,
      p_asset_id: asset,
      p_version: version,
      p_name: name,
      p_alt: alt,
      p_archive: archive,
    });
    if (r.error)
      throw new Error(
        'Media changed or remains referenced by a draft or published version.',
      );
    revalidatePath(`/dashboard/website/${site}/media`);
    return {
      message: archive ? 'Unused media archived' : 'Media details saved',
    };
  } catch (e) {
    return { message: message(e) };
  }
}
