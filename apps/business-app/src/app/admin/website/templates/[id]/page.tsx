import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { validateTemplate } from '@business-os/website-builder';
import { WebsiteEditor } from '../../../../dashboard/website/studio';
import { WebsiteSettings } from '../../../../dashboard/website/settings-panel';
import { TemplateArchive } from '../../template-archive';
import {
  saveTemplateSection,
  previewTemplate,
  publishTemplate,
} from '../../template-actions';

export default async function TemplateStudio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = 'pages' } = await searchParams;
  const s = await pageServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  const r = await s.client
    .from('website_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error || !r.data) notFound();
  const template = r.data;
  const doc = validateTemplate(template.document);
  if (
    !['pages', 'design', 'navigation', 'content', 'seo', 'developer'].includes(
      tab,
    )
  )
    notFound();
  return (
    <main id="main-content" className="space-y-5">
      <Link className="text-sm underline" href="/admin/website">
        ← Template library
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reusable template · {template.status} · version {template.version}.
          Use example content; company media and business records belong in the
          company’s own website.
        </p>
      </header>
      {template.status !== 'archived' && (
        <TemplateArchive id={id} version={template.version} />
      )}
      <nav className="flex flex-wrap gap-4" aria-label="Template editor">
        {['pages', 'design', 'navigation', 'content', 'seo', 'developer'].map(
          (item) => (
            <Link
              key={item}
              aria-current={tab === item ? 'page' : undefined}
              className="rounded border px-3 py-2 capitalize"
              href={`/admin/website/templates/${id}?tab=${item}`}
            >
              {item === 'developer'
                ? 'Custom code'
                : item === 'design'
                  ? 'Theme'
                  : item}
            </Link>
          ),
        )}
      </nav>
      {tab === 'pages' ? (
        <WebsiteEditor
          key={template.version}
          id={id}
          initial={doc}
          version={template.version}
          name={template.name}
          status={template.status}
          canEdit
          canPublish
          templateMode
          saveAction={saveTemplateSection}
          previewAction={previewTemplate}
          publishAction={publishTemplate}
        />
      ) : (
        <WebsiteSettings
          key={tab + template.version}
          id={id}
          initial={doc}
          version={template.version}
          tab={tab}
          canEdit
          templateMode
          saveAction={saveTemplateSection}
        />
      )}
    </main>
  );
}
