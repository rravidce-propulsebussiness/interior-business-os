import Link from 'next/link';
import { brochureServices } from './service';
import { BrochureCreate, BrochureStatus } from './panels';
export default async function Brochures({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await brochureServices('brochure.view', true);
  const page = Math.max(
    1,
    Math.min(10000, Number((await searchParams).page) || 1),
  );
  const data = await s.brochure.list(page);
  return (
    <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Your studio, in print
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Brochures</h1>
        </div>
        <nav className="flex gap-5 text-sm underline">
          <Link href="/dashboard">Dashboard</Link>
          {s.allowed('brochure.brand.manage') && (
            <Link href="/dashboard/brochures/brand">
              Brand & approved content
            </Link>
          )}
          {s.allowed('brochure.media.manage') && (
            <Link href="/dashboard/brochures/media">Image library</Link>
          )}
        </nav>
      </header>
      <p className="text-sm text-muted-foreground">
        Create editable company profiles, service guides and portfolios. A
        website is not required.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {['Brochure', 'Type', 'Status', 'Updated', 'Actions'].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((b) => (
              <tr className="border-t" key={String(b.id)}>
                <td className="p-3">
                  <Link
                    className="font-semibold underline"
                    href={`/dashboard/brochures/${b.id}`}
                  >
                    {String(b.name)}
                  </Link>
                </td>
                <td className="p-3">{String(b.type)}</td>
                <td className="p-3">{String(b.status)}</td>
                <td className="p-3">{String(b.updated_at).slice(0, 10)}</td>
                <td className="p-3">
                  <BrochureStatus
                    id={String(b.id)}
                    version={Number(b.version)}
                    status={String(b.status)}
                    canManage={s.allowed('brochure.manage')}
                    canPublish={s.allowed('brochure.publish')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && (
          <p className="p-5">
            No brochures yet. Start with a blank page or an editable starter.
          </p>
        )}
      </div>
      <nav className="flex gap-4 text-sm underline">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {data.items.length === 25 && (
          <Link href={`?page=${page + 1}`}>Next</Link>
        )}
      </nav>
      {s.allowed('brochure.manage') && <BrochureCreate />}
    </main>
  );
}
