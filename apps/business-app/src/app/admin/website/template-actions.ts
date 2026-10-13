'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { websiteJson } from '@business-os/database/website';
import {
  starterTemplate,
  validateTemplate,
} from '@business-os/website-builder';
import {
  compileWebsite,
  validateCss,
  validateJavaScript,
  sanitizeHtml,
} from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { signWebsite } from '../../dashboard/website/service';

async function services() {
  const s = await serverServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  return s;
}
async function read(id: string) {
  const s = await services();
  const r = await s.client
    .from('website_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error || !r.data) throw new Error('Template unavailable');
  return { ...s, template: r.data };
}
function refresh() {
  revalidatePath('/admin/website', 'layout');
  revalidatePath('/dashboard/website');
}

export async function createTemplate(form: FormData) {
  try {
    const s = await services();
    const name = String(form.get('name') ?? '').trim();
    const kind = String(form.get('kind'));
    if (
      !name ||
      name.length > 160 ||
      !['blank', 'construction', 'services', 'custom'].includes(kind)
    )
      throw new Error('Invalid template');
    const document = starterTemplate(
      name,
      kind as 'blank' | 'construction' | 'services' | 'custom',
    );
    const result = await s.client.rpc('website_template_save', {
      p_id: randomUUID(),
      p_version: 0,
      p_name: name,
      p_description: String(form.get('description') ?? '').slice(0, 1000),
      p_document: websiteJson(document),
    });
    if (result.error) throw result.error;
    refresh();
    return { id: result.data, message: 'Template draft created.' };
  } catch {
    return {
      message:
        'Could not create the template. Check permissions and the template database migration.',
    };
  }
}

export async function saveTemplateSection(
  id: string,
  version: number,
  section: string,
  value: unknown,
) {
  try {
    const s = await read(id);
    if (s.template.version !== version) throw new Error('Template changed');
    if (
      ![
        'pages',
        'theme',
        'css',
        'navigation',
        'footerNavigation',
        'forms',
        'code',
        'settings',
        'header',
        'footer',
        'sections',
        'content',
      ].includes(section)
    )
      throw new Error('Unknown section');
    const document = validateTemplate({
      ...validateTemplate(s.template.document),
      [section]: value,
    });
    validateCss(document.css);
    for (const code of document.code) {
      sanitizeHtml(code.html);
      validateCss(code.css);
      validateJavaScript(code.javascript);
    }
    const r = await s.client.rpc('website_template_save', {
      p_id: id,
      p_version: version,
      p_name: document.settings.name,
      p_description: s.template.description,
      p_document: websiteJson(document),
    });
    if (r.error) throw r.error;
    refresh();
    return {
      version: version + 1,
      message:
        'Template draft saved. Publish it to make it available to companies.',
    };
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : 'Template changed or could not be saved. Reload and try again.',
    };
  }
}

export async function previewTemplate(
  id: string,
  input: unknown,
  path: string,
) {
  await read(id);
  const doc = validateTemplate(input);
  return websiteHtml(
    compileWebsite({
      ...doc,
      pages: doc.pages.map((p) => ({ ...p, visibility: 'public' })),
    }),
    path,
    { preview: true },
  );
}

export async function publishTemplate(id: string, version: number) {
  try {
    const s = await read(id);
    const document = validateTemplate(s.template.document);
    compileWebsite(document);
    const proof = signWebsite({
      purpose: 'website.template.publish',
      templateId: id,
      version,
      document,
    });
    const r = await s.client.rpc('website_template_status', {
      p_id: id,
      p_version: version,
      p_status: 'published',
      p_proof: proof.body,
      p_signature: proof.signature,
    });
    if (r.error) throw r.error;
    refresh();
    return {
      id,
      message:
        'Template published. Business owners can now use it to create their own website.',
    };
  } catch {
    return {
      message:
        'Template could not be published. Reload the draft and check its content and signing configuration.',
    };
  }
}

export async function archiveTemplate(id: string, version: number) {
  try {
    const s = await services();
    const r = await s.client.rpc('website_template_status', {
      p_id: id,
      p_version: version,
      p_status: 'archived',
    });
    if (r.error) throw r.error;
    refresh();
    return {
      message: 'Template archived. Existing company websites are unchanged.',
    };
  } catch {
    return {
      message:
        'Template changed or could not be archived. Reload and try again.',
    };
  }
}
