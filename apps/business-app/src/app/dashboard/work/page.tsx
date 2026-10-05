import Link from 'next/link';
import { automationServices } from '../automations/service';
const groups = [
  'assigned',
  'today',
  'overdue',
  'upcoming',
  'approvals',
  'escalated',
  'all',
];
function target(row: Record<string, unknown>) {
  const tables: Record<string, string> = {
    task: 'project_tasks',
    milestone: 'project_milestones',
    inspection: 'project_inspections',
    snag: 'project_snags',
    handover: 'handover_records',
    material_request: 'material_issue_requests',
  };
  const kind = String(row.kind);
  return kind === 'followup'
    ? '/dashboard/crm/followups'
    : kind === 'quotation'
      ? `/dashboard/quotations/${row.quotation_id}`
      : kind === 'requisition'
        ? `/dashboard/execution/purchase_requisitions/${row.id}`
        : `/dashboard/operations/${tables[kind]}/${row.id}`;
}
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; page?: string }>;
}) {
  const query = await searchParams,
    group = groups.includes(query.group ?? '') ? query.group! : 'assigned',
    page = Math.min(10000, Math.max(1, Math.floor(Number(query.page)) || 1));
  const s = await automationServices('notification.view', true),
    work = await s.automation.work(group, page);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard">
        Dashboard
      </Link>
      <h1 className="text-3xl font-semibold">My work</h1>
      <p>
        Live tasks, follow-ups and review items · {work.today} · {work.timezone}
      </p>
      <nav className="flex flex-wrap gap-3" aria-label="Work groups">
        {groups.map((item) => (
          <Link
            key={item}
            href={`?group=${item}`}
            aria-current={item === group ? 'page' : undefined}
            className={`rounded border px-3 py-2 capitalize ${item === group ? 'bg-slate-900 text-white' : ''}`}
          >
            {item === 'assigned'
              ? 'Assigned to me'
              : item === 'all'
                ? 'All authorized work'
                : item}
          </Link>
        ))}
      </nav>
      {group === 'approvals' && (
        <p>
          Review candidates you are permitted to approve. Open the source to
          check prerequisites and complete its existing approval workflow.
        </p>
      )}
      <p>{work.total} items</p>
      {!work.rows.length && (
        <p className="rounded border p-6">No work matches this view.</p>
      )}
      <ul className="divide-y rounded border">
        {work.rows.map((row) => (
          <li
            key={`${row.kind}-${row.id}`}
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div>
              <Link href={target(row)} className="font-semibold underline">
                {String(row.title)}
              </Link>
              <p className="text-sm text-slate-600">
                {String(row.kind)} · {String(row.status)} ·{' '}
                {String(row.project_name ?? '')}
              </p>
            </div>
            <div className="text-sm">
              {row.due_at
                ? new Date(String(row.due_at)).toLocaleString('en-IN', {
                    timeZone: work.timezone,
                  })
                : 'No due date'}
              {row.approval === true && (
                <span className="ml-3 rounded bg-amber-50 px-2 py-1">
                  Review
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <nav className="flex gap-5" aria-label="Work pages">
        {page > 1 && (
          <Link className="underline" href={`?group=${group}&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {page * 25 < work.total && (
          <Link className="underline" href={`?group=${group}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </main>
  );
}
