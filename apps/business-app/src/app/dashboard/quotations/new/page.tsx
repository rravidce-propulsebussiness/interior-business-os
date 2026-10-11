import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { commercialServices } from '../../commercial/service';
import { CommandForm } from '../command-form';

export const dynamic = 'force-dynamic';

export default async function NewQuotation({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; project?: string }>;
}) {
  const s = await commercialServices('quotation.create', 'quotation', true);
  if (!s.allowed('project.view', 'projects')) notFound();
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? '1', 10) || 1));
  const results = commercialSearchResultSchema.parse(
    await s.commercial.search(s.org, 'projects', query, page, 'active'),
  );
  const selected = results.rows.find((project) => project.id === params.project);
  const { data: organization } = await s.client
    .from('organizations')
    .select('default_currency')
    .eq('id', s.org)
    .single();
  const next = (target: number) =>
    '?q=' + encodeURIComponent(query) + '&page=' + target;

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Business dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-sky-300">Company quotations</p>
          <h1 className="mt-3 text-3xl font-bold">Create Quotation</h1>
          <p className="mt-2 text-sm text-slate-300">
            Choose an active project in your company. The quotation will be created in this project's workspace.
          </p>
        </header>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">Choose project</h2>
            <form method="GET" action="/dashboard/quotations/new" className="mt-4 flex flex-wrap gap-2">
              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search project name"
                maxLength={100}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900"
              />
              <button type="submit" className="rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Search
              </button>
            </form>
            {results.rows.length ? (
              <div className="mt-4 grid gap-2">
                {results.rows.map((project) => (
                  <Link
                    key={project.id}
                    href={next(page) + '&project=' + project.id}
                    aria-current={selected?.id === project.id ? 'true' : undefined}
                    className={'rounded-xl border px-4 py-3 text-sm ' +
                      (selected?.id === project.id
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200')}
                  >
                    <strong className="block">{project.name}</strong>
                    <span className="mt-1 block text-xs capitalize">{project.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-600">No active projects match your search.</p>
            )}
            <nav className="mt-4 flex items-center justify-between gap-3 text-sm">
              {page > 1 ? <Link href={next(page - 1)} className="text-blue-700">← Previous</Link> : <span />}
              {page * 25 < results.total && <Link href={next(page + 1)} className="text-blue-700">Next →</Link>}
            </nav>
            <p className="mt-4 text-xs text-slate-500">
              Need a project first? <Link href="/dashboard/customers" className="text-blue-700 underline">Open clients to add a project.</Link>
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">Quotation details</h2>
            {selected ? (
              <>
                <p className="mt-3 text-sm text-slate-600">Project: <strong>{selected.name}</strong></p>
                <CommandForm
                  title="Create quotation"
                  initial={{
                    action: 'create',
                    project_id: selected.id,
                    currency: organization?.default_currency ?? 'INR',
                  }}
                  fields={[{ key: 'currency', label: 'Currency code', required: true }]}
                />
              </>
            ) : (
              <div className="mt-8 rounded-xl bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                Select one of your active projects to continue. Employees cannot access projects or quotations outside their assigned company permissions.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
