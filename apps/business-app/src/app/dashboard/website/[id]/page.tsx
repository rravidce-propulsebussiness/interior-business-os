import Link from 'next/link';
import { websiteServices } from '../service';
import { WebsiteEditor } from '../studio';
import { InteriorStarter } from '../starter-panel';
export default async function WebsiteStudio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await websiteServices('website.view', true);
  const site = await s.website.read(id);
  return (
    <main id="main-content" className="min-h-screen bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-3">
        <Link href="/dashboard/website" className="text-sm">
          ← Websites
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {[
            'design',
            'navigation',
            'content',
            'forms',
            'seo',
            'media',
            'domains',
            'versions',
            'developer',
            'team',
            'metrics',
          ].map((tab) => (
            <Link
              key={tab}
              className="capitalize"
              href={`/dashboard/website/${id}/${tab}`}
            >
              {tab}
            </Link>
          ))}
        </nav>
      </div>
      <WebsiteEditor
        key={site.version}
        id={id}
        initial={site.document}
        version={site.version}
        name={site.name}
        status={site.status}
        canEdit={s.allowed('website.page.edit')}
        canPublish={s.allowed('website.page.publish')}
      />
      {s.allowed('website.manage') &&
        site.document.pages.every((p) => !p.nodes.length) && (
          <InteriorStarter id={id} version={site.version} />
        )}
    </main>
  );
}
