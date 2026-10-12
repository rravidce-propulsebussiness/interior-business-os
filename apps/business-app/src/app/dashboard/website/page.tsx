import Link from 'next/link';
import { websiteServices } from './service';
import { websiteSchemaPending } from '../../../website-schema';
import { WebsiteCreate } from './website-create';
export default async function Websites() {
  const s = await websiteServices('website.view', true);
  const [sites, templates] = await Promise.all([
    s.website.list(),
    s.client
      .from('website_templates')
      .select('id,name,description')
      .eq('status', 'published')
      .order('name')
      .limit(100),
  ]);
  const pendingSetup = websiteSchemaPending(templates.error);
  if (templates.error && !pendingSetup)
    throw new Error('Website templates unavailable');
  return (
    <section className="mx-auto max-w-6xl space-y-8 py-6">
      <header>
        <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">
          Your digital presence
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Website Builder</h1>
        <p className="mt-3 text-muted-foreground">
          Choose a template, build visually, or start with your own HTML, CSS
          and JavaScript. Preview and publish when you are ready.
        </p>
      </header>
      {pendingSetup && (
        <p role="status" className="text-sm text-muted-foreground">
          Shared templates are being set up. You can still edit existing
          websites or create a blank website.
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {sites.map((site) => (
          <Link
            key={site.id}
            href={`/dashboard/website/${site.id}`}
            className="group rounded-xl border bg-card p-6 transition hover:border-primary"
          >
            <div className="mb-8 flex h-28 items-center justify-center rounded-lg bg-muted text-4xl font-light">
              {site.name.slice(0, 1)}
            </div>
            <h2 className="text-lg font-semibold">{site.name}</h2>
            <p className="mt-2 text-sm capitalize text-muted-foreground">
              {site.status} · {site.slug}
            </p>
            <p className="mt-5 text-sm">Open studio →</p>
          </Link>
        ))}
      </div>
      {s.allowed('website.manage') && (
        <WebsiteCreate
          templates={templates.data ?? []}
          canCode={s.allowed('website.custom_code.edit')}
        />
      )}
    </section>
  );
}
