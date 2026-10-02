import Link from 'next/link';
import { operationsPermissions } from '@business-os/core/operations';
import { operationsServices } from './service';
import { text, record } from '../execution/presentation';
export const dynamic = 'force-dynamic';
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; query?: string; page?: string }>;
}) {
  const { project, query = '', page: requestedPage } = await searchParams,
    s = await operationsServices('execution.view', true);
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(requestedPage)) || 1),
  );
  const projects = await s.operations.options(
    'projects',
    undefined,
    query.slice(0, 100),
    page,
  );
  const summary = project ? await s.operations.dashboard(project) : null;
  const sections = [
    'project_execution_members',
    'execution_plans',
    'work_packages',
    'project_milestones',
    'project_tasks',
    'inventory_locations',
    'material_issue_requests',
    'inventory_transactions',
    'vendor_execution_profiles',
    'subcontractor_work_orders',
    'work_measurements',
    'inspection_templates',
    'project_inspections',
    'project_snags',
    'handover_templates',
    'handover_records',
  ] as const;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Project execution</h1>
        <p className="text-sm text-muted-foreground">
          Planning, site work and handover
        </p>
      </header>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Find project
          <input
            name="query"
            defaultValue={query}
            maxLength={100}
            className="block rounded border p-2"
          />
        </label>
        <button className="rounded border px-3 py-2 text-sm">
          Search projects
        </button>
      </form>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Project
          <select
            name="project"
            defaultValue={project ?? ''}
            required
            className="block max-w-full rounded border p-2"
          >
            <option value="">Select project</option>
            {project && !projects.rows.some((row) => row.id === project) && (
              <option value={project}>Selected project</option>
            )}
            {projects.rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded border px-3 py-2 text-sm">
          Open execution
        </button>
      </form>
      <nav className="flex gap-4 text-sm" aria-label="Project choices">
        {page > 1 && (
          <Link
            className="underline"
            href={`?query=${encodeURIComponent(query)}&page=${page - 1}`}
          >
            Previous projects
          </Link>
        )}
        {projects.has_more && (
          <Link
            className="underline"
            href={`?query=${encodeURIComponent(query)}&page=${page + 1}`}
          >
            More projects
          </Link>
        )}
      </nav>
      {summary && (
        <div className="flex flex-wrap gap-5 rounded-md border p-3 text-sm">
          <span>
            Progress <strong>{text(summary.progress)}%</strong>
          </span>
          <span>
            Blocked <strong>{text(summary.blocked_tasks)}</strong>
          </span>
          <span>
            Overdue <strong>{text(summary.overdue_tasks)}</strong>
          </span>
          <span>
            Open snags <strong>{text(summary.open_snags)}</strong>
          </span>
          <span>
            Handover{' '}
            <strong>
              {record(summary.readiness).ready ? 'Ready' : 'Pending checks'}
            </strong>
          </span>
        </div>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Execution sections">
        {project && (
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            href={`/dashboard/operations/documents?project=${project}`}
          >
            Documents
          </Link>
        )}
        {project && (
          <>
            <Link
              className="rounded-md border px-3 py-2 text-sm"
              href={`/dashboard/operations/scope?project=${project}`}
            >
              Approved scope
            </Link>
            <Link
              className="rounded-md border px-3 py-2 text-sm"
              href={`/dashboard/operations/timeline?project=${project}`}
            >
              Timeline
            </Link>
          </>
        )}
        {project && s.allowed('inventory.view') && (
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            href={`/dashboard/operations/materials?project=${project}`}
          >
            Material usage
          </Link>
        )}
        {project && (
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            href={`/dashboard/operations/closure?project=${project}`}
          >
            Completion review
          </Link>
        )}
        {project && s.allowed('cost.execution.view') && (
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            href={`/dashboard/execution/costs?project=${project}`}
          >
            Cost summary
          </Link>
        )}
        {sections
          .filter((e) => s.allowed(operationsPermissions[e]))
          .map((e) => (
            <Link
              className="rounded-md border px-3 py-2 text-sm capitalize hover:bg-muted"
              key={e}
              href={`/dashboard/operations/${e}${project ? `?project=${project}` : ''}`}
            >
              {e.replaceAll('_', ' ')}
            </Link>
          ))}
        {s.allowed('inventory.view') && (
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            href={`/dashboard/operations/stock${project ? `?project=${project}` : ''}`}
          >
            Stock balances
          </Link>
        )}
      </nav>
      <Link
        className="text-sm underline"
        href={`/dashboard/execution${project ? `?project=${project}` : ''}`}
      >
        Estimates and procurement
      </Link>
    </section>
  );
}
