import Link from 'next/link';
import { brochureServices } from '../service';
import { BrochureCreate, BrochureStatus, RestoreBrochure } from '../panels';
import { ShareBrochure } from '../share';
export default async function Brochure({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const s = await brochureServices('brochure.view', true);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [b, data] = await Promise.all([
    s.brochure.read(id, undefined, page),
    s.brochure.list(),
  ]);
  const path = `/brochure/${data.business.slug}/${b.slug}`;
  const base = process.env.BROCHURE_PUBLIC_ORIGIN ?? '';
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Link href="/dashboard/brochures" className="underline">
        ← Brochures
      </Link>
      <h1 className="text-3xl font-semibold">{b.name}</h1>
      <BrochureStatus
        id={id}
        version={b.version}
        status={b.status}
        canManage={s.allowed('brochure.manage')}
        canPublish={s.allowed('brochure.publish')}
      />
      <nav className="flex flex-wrap gap-5 underline">
        <Link href={`/dashboard/brochures/${id}/editor`}>Open editor</Link>
        <a href={`/dashboard/brochures/${id}/preview`} target="_blank">
          Print preview
        </a>
        {s.allowed('brochure.export') && (
          <a href={`/dashboard/brochures/${id}/pdf`}>Draft PDF</a>
        )}
        <Link href={`/dashboard/brochures/${id}/analytics`}>Analytics</Link>
      </nav>
      <ShareBrochure
        url={base ? new URL(path, base).toString() : path}
        published={b.status === 'published'}
      />
      <h2 className="text-xl font-semibold">Published history</h2>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Version</th>
              <th>Summary</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {b.versions.map((v) => (
              <tr className="border-t" key={String(v.id)}>
                <td className="p-3">{String(v.sequence)}</td>
                <td>{String(v.summary)}</td>
                <td>{String(v.created_at).slice(0, 10)}</td>
                <td className="space-x-3">
                  <a
                    className="underline"
                    href={`/dashboard/brochures/${id}/pdf?version=${v.id}`}
                  >
                    PDF
                  </a>
                  {s.allowed('brochure.restore') &&
                    s.allowed('brochure.publish') && (
                      <RestoreBrochure
                        id={id}
                        version={b.version}
                        restoreId={String(v.id)}
                      />
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-4 underline">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous versions</Link>}
        {b.versions.length === 25 && (
          <Link href={`?page=${page + 1}`}>More versions</Link>
        )}
      </nav>
      {s.allowed('brochure.manage') && <BrochureCreate copyId={id} />}
    </main>
  );
}
