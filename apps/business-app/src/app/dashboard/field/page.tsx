import Link from 'next/link';
import { automationServices } from '../automations/service';

const fieldItems = new Set(['task', 'milestone', 'inspection', 'snag', 'material_request']);
const tableForKind: Record<string, string> = {
  task: 'project_tasks',
  milestone: 'project_milestones',
  inspection: 'project_inspections',
  snag: 'project_snags',
  material_request: 'material_issue_requests',
};

function safeFieldTarget(kind: string, id: unknown): string | null {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const table = tableForKind[kind];
  return table ? `/dashboard/operations/${table}/${id}` : null;
}

export default async function FieldWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // The canonical work_queue RPC checks current tenant permissions, task
  // visibility and project/site assignment. This page never lists raw tables.
  const query = await searchParams;
  const page = Math.min(10000, Math.max(1, Math.floor(Number(query.page)) || 1));
  const s = await automationServices('notification.view', true);
  const work = await s.automation.work('assigned', page);
  const items = work.rows.filter((row) => fieldItems.has(String(row.kind)));

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-700 underline">
          ← Business dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Assigned site operations</p>
          <h1 className="mt-3 text-3xl font-semibold">My field work</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Mobile-first access to authorized tasks, inspections, milestones,
            site material requests and snags. Only records that the server
            confirms you may access are shown; sensitive costs remain separate.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Visible this page</p>
            <p className="mt-2 text-3xl font-bold">{items.length}</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Assigned work items</p>
            <p className="mt-2 text-3xl font-bold">{work.total}</p>
          </section>
          <section className="col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-1">
            <p className="text-sm text-slate-500">Current workspace date</p>
            <p className="mt-2 text-lg font-semibold">{work.today}</p>
          </section>
        </div>
        {items.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-7">
            <h2 className="text-xl font-semibold">No assigned site work on this page</h2>
            <p className="mt-2 text-sm text-slate-600">
              A project manager can assign you to an existing project and task.
              Assignments and permission changes take effect through the
              canonical project and role system.
            </p>
          </section>
        ) : (
          <section aria-label="Assigned site work" className="space-y-3">
            {items.map((row) => {
              const kind = String(row.kind);
              const target = safeFieldTarget(kind, row.id);
              return (
                <article key={`${kind}-${String(row.id)}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className="rounded-lg bg-slate-100 px-3 py-1.5">{kind.replaceAll('_', ' ')}</span>
                    <span>{String(row.status ?? '')}</span>
                  </div>
                  <h2 className="mt-3 break-words text-xl font-semibold">{String(row.title ?? 'Assigned work')}</h2>
                  {row.project_name && <p className="mt-2 text-sm text-slate-600">{String(row.project_name)}</p>}
                  {row.due_at && (
                    <p className="mt-3 text-sm text-slate-600">
                      Due {new Date(String(row.due_at)).toLocaleString('en-IN', { timeZone: work.timezone })}
                    </p>
                  )}
                  {target && (
                    <Link href={target} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white">
                      Open authorized details →
                    </Link>
                  )}
                </article>
              );
            })}
          </section>
        )}
        <nav aria-label="Assigned work pages" className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5" href={`?page=${page-1}`}>Previous</Link>
          ) : <span />}
          {page*25 < work.total ? (
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5" href={`?page=${page+1}`}>Next</Link>
          ) : <span />}
        </nav>
        <p className="text-xs leading-5 text-slate-500">
          Work is read from the existing authenticated work queue. This is not
          a second task database or an alternate permission system.
        </p>
      </div>
    </main>
  );
}
