import Link from 'next/link';
import type { ExecutionRecord } from '@business-os/core/execution';
import type { executionServices } from './service';
import { label, text } from './presentation';

type Workspace = Awaited<ReturnType<typeof executionServices>>;
type Result = {
  rows: ExecutionRecord[];
  total: number;
  page: number;
};

function shortDate(value: unknown) {
  const raw = text(value);
  if (!raw) return 'Not recorded';
  const date = new Date(raw);
  return Number.isNaN(date.valueOf())
    ? raw
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date);
}

export async function RevisionRegister({
  s,
  data,
  filter,
}: {
  s: Workspace;
  data: Result;
  filter: {
    query?: string;
    status?: string;
    project?: string;
    page?: string;
  };
}) {
  const accessibleProjectIds = [
    ...new Set(data.rows.map((row) => text(row.project_id)).filter(Boolean)),
  ];
  // Never enumerate company projects unless the user can see projects.
  const projects = s.allowed('project.view') && accessibleProjectIds.length
    ? await s.client
        .from('projects')
        .select('id,name')
        .eq('organization_id', s.org)
        .in('id', accessibleProjectIds)
    : null;
  const projectNames = new Map(
    (projects?.data ?? []).map((project) => [project.id, project.name]),
  );
  const currentPage = data.rows.length;
  const approved = data.rows.filter((row) => row.status === 'approved').length;
  const draft = data.rows.filter((row) => row.status === 'draft').length;
  const underReview = data.rows.filter((row) => row.status === 'under_review').length;
  const page = Math.max(1, Number(filter.page) || 1);
  const hrefFor = (targetPage: number) => {
    const query = new URLSearchParams();
    if (filter.query) query.set('query', filter.query);
    if (filter.status) query.set('status', filter.status);
    if (filter.project) query.set('project', filter.project);
    query.set('page', String(targetPage));
    return '?' + query.toString();
  };

  return (
    <main id="main-content" tabIndex={-1} className="erp-page boq-register">
      <header className="erp-titlebar">
        <div>
          <p className="erp-eyebrow">ESTIMATE CONTROL CENTER</p>
          <h1>BOQ &amp; Estimate Revisions</h1>
          <p>Review real contract-based estimates, draft scopes and approved versions.</p>
        </div>
        <div className="erp-header-actions">
          <Link className="erp-button erp-button-outline" href="/dashboard/execution">Execution planner</Link>
          {s.allowed('estimate.create') && (
            <Link className="erp-button erp-button-primary" href="/dashboard/execution">
              + New from accepted contract
            </Link>
          )}
        </div>
      </header>
      <div className="erp-stats erp-stats-four" aria-label="Current page snapshot">
        {[
          { label: 'Matching revisions', value: String(data.total), detail: 'All filtered records', icon: '▤' },
          { label: 'Awaiting review', value: String(underReview), detail: 'On this page', icon: '◷' },
          { label: 'Approved', value: String(approved), detail: 'On this page', icon: '✓' },
          { label: 'Draft', value: String(draft), detail: currentPage + ' records on this page', icon: '✎' },
        ].map((metric) => (
          <section className="erp-stat" key={metric.label}>
            <div className="erp-stat-icon" aria-hidden="true">{metric.icon}</div>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          </section>
        ))}
      </div>
      <section className="erp-panel" aria-labelledby="revisions-list-heading">
        <div className="erp-panel-header">
          <div>
            <p className="erp-eyebrow">PROJECT ESTIMATE HISTORY</p>
            <h2 id="revisions-list-heading">Estimate register</h2>
            <p>Open a revision to view quantity lines, priced costs and review actions.</p>
          </div>
          <span className="erp-tag">{data.total} records</span>
        </div>
        <form action="/dashboard/execution/execution_estimate_revisions" method="get" className="erp-filterbar">
          <label>
            <span>Search records</span>
            <input name="query" type="search" maxLength={100} defaultValue={filter.query || ''} placeholder="Search revision records" />
          </label>
          <label>
            <span>Approval status</span>
            <select name="status" defaultValue={filter.status || ''}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="under_review">Under review</option>
              <option value="approved">Approved</option>
              <option value="superseded">Superseded</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            <span>Project ID</span>
            <input name="project" defaultValue={filter.project || ''} placeholder="Optional project UUID" />
          </label>
          <button type="submit" className="erp-button erp-button-primary">Apply filters</button>
          <Link className="erp-button erp-button-outline" href="/dashboard/execution/execution_estimate_revisions">Reset</Link>
        </form>
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead><tr>
              <th>Estimate revision</th>
              <th>Project</th>
              <th>Revision</th>
              <th>Status</th>
              <th>Created</th>
              <th>Approved</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              {data.rows.map((row) => {
                const id = text(row.id);
                const status = text(row.status);
                return (
                  <tr key={id}>
                    <td>
                      <Link className="erp-record-link" href={'/dashboard/execution/execution_estimate_revisions/' + id}>
                        {label(row)}
                      </Link>
                      <small className="erp-cell-secondary">Estimate {text(row.estimate_id).slice(0, 8) || 'not recorded'}</small>
                    </td>
                    <td>
                      <strong>{projectNames.get(text(row.project_id)) || 'Project record'}</strong>
                      <small className="erp-cell-secondary">{text(row.project_id).slice(0, 8) || '—'}</small>
                    </td>
                    <td>Rev {text(row.revision_number) || '—'}</td>
                    <td><span className={'erp-status erp-status-' + status}>{status.replaceAll('_', ' ') || 'Unknown'}</span></td>
                    <td>{shortDate(row.created_at)}</td>
                    <td>{shortDate(row.approved_at)}</td>
                    <td><Link className="erp-inline-action" href={'/dashboard/execution/execution_estimate_revisions/' + id}>Open BOQ →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.rows.length === 0 && (
            <div className="erp-empty">
              <strong>No estimate revisions match this selection</strong>
              <p>Choose another project or status, or create a revision from an accepted contract.</p>
            </div>
          )}
        </div>
        <footer className="erp-pagination">
          <p>Page {page} · Showing {data.rows.length} of {data.total} matching records</p>
          <div>
            {page > 1 && <Link href={hrefFor(page - 1)}>← Previous</Link>}
            {page * 25 < data.total && <Link href={hrefFor(page + 1)}>Next →</Link>}
          </div>
        </footer>
      </section>
    </main>
  );
}
