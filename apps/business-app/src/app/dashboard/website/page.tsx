import Link from 'next/link';
import { websiteServices } from './service';
import { WebsiteCreate } from './website-create';
export default async function Websites() {
  const s = await websiteServices('website.view', true);
  const sites = await s.website.list();
  return (
    <section className="mx-auto max-w-6xl space-y-8 py-6">
      <header>
        <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">
          Your digital presence
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Websites</h1>
      </header>
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
      {s.allowed('website.manage') && <WebsiteCreate />}
    </section>
  );
}
