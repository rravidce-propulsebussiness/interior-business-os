import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { websiteSchemaPending } from '../../../website-schema';
import { TemplateCreate } from './template-create';

export default async function PlatformTemplates() {
  const services = await pageServices();
  await services.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await services.authorization.requirePlatformPermission('platform.catalog.view');

  const templates = await services.client
    .from('website_templates')
    .select('id,name,description,status,version')
    .order('updated_at', { ascending: false })
    .limit(100);

  const pendingSetup = websiteSchemaPending(templates.error);
  if (templates.error && !pendingSetup)
    throw new Error('Template library unavailable');

  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <Link href="/admin" className="text-sm underline">
        Platform dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Shared website templates</h1>
      <p className="text-muted-foreground">
        Maintain optional starter templates for companies. Company website
        content, domains and publication belong to the Owner and assigned
        Website Developers in the Business App.
      </p>
      {pendingSetup ? (
        <p role="status" className="rounded border p-4 text-sm">
          Template library setup is pending. Apply the templates migration
          before creating or publishing a shared starter template.
        </p>
      ) : (
        <TemplateCreate />
      )}
      <section
        aria-label="Shared template library"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {(templates.data ?? []).map((template) => (
          <Link
            className="rounded-xl border bg-card p-5 hover:border-primary"
            key={template.id}
            href={`/admin/website/templates/${template.id}`}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {template.status} · v{template.version}
            </p>
            <h2 className="mt-3 text-lg font-semibold">{template.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {template.description || 'Reusable editable starter pages.'}
            </p>
            <p className="mt-5 text-sm">Open shared template →</p>
          </Link>
        ))}
        {!pendingSetup && !(templates.data ?? []).length && (
          <p className="text-sm text-muted-foreground">
            No shared templates yet. Company websites remain independent of the
            platform template library.
          </p>
        )}
      </section>
    </main>
  );
}
