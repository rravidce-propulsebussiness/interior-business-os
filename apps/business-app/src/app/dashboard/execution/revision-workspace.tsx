import Link from 'next/link';
import { calculateRevisionCost } from './revision-cost';
import type { ExecutionRecord } from '@business-os/core/execution';
import { ExecutionForm } from './form';
import { record, text } from './presentation';
import type { executionServices } from './service';

type Workspace = Awaited<ReturnType<typeof executionServices>>;
type Cost = {
  line_id: string;
  revision_id: string;
  unit_cost: string;
  estimated_cost: string;
  waste_cost: string;
  currency: string;
};
type BoqLine = {
  id: string;
  scope_id: string;
  cost_kind: string;
  description: string;
  planned_purchase_quantity: string;
  purchase_unit: string;
  base_quantity: string;
  waste_quantity: string;
  accuracy: string;
  drawing_reference: string;
  measurement_note: string;
  calculation_snapshot: unknown;
  sort_order: number;
};
type BoqScope = {
  id: string;
  area_name: string;
  snapshot: unknown;
  coverage: string;
  source_type: string;
  source_id: string;
  sort_order: number;
};
const formatAmount = (value: number, currency: string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
const asNumber = (value: unknown) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n;
};

function dateLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return 'Not recorded';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf())
    ? raw
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(parsed);
}
function StateAction({
  title,
  operation,
  version,
  id,
  reason = false,
}: {
  title: string;
  operation: 'sync' | 'submit' | 'approve' | 'return' | 'revise';
  id: string;
  version: number;
  reason?: boolean;
}) {
  return (
    <ExecutionForm
      title={title}
      initial={{ action: 'estimate', operation, input: { id, version } }}
      fields={reason ? [{ key: 'reason', label: 'Reason for return', required: true }] : []}
    />
  );
}

export async function RevisionWorkspace({
  s,
  row,
}: {
  s: Workspace;
  row: ExecutionRecord;
}) {
  const id = text(row.id);
  const status = text(row.status);
  const revision = text(row.revision_number);
  const canSeeCost = s.allowed('estimate.view_cost');
  const currency = s.organization.default_currency || 'INR';
  const [scopeQuery, linesQuery, costQuery, previousQuery, projectQuery] = await Promise.all([
    s.client
      .from('execution_estimate_scope_items')
      .select('id,area_name,snapshot,coverage,source_type,source_id,sort_order', { count: 'exact' })
      .eq('organization_id', s.org).eq('revision_id', id)
      .order('sort_order', { ascending: true }).limit(201),
    s.client
      .from('execution_estimate_lines')
      .select('id,scope_id,cost_kind,description,planned_purchase_quantity,purchase_unit,base_quantity,waste_quantity,accuracy,drawing_reference,measurement_note,calculation_snapshot,sort_order', { count: 'exact' })
      .eq('organization_id', s.org).eq('revision_id', id)
      .order('sort_order', { ascending: true }).limit(401),
    canSeeCost
      ? s.client.from('execution_estimate_line_costs')
          .select('line_id,revision_id,unit_cost,estimated_cost,waste_cost,currency', { count: 'exact' })
          .eq('organization_id', s.org).eq('revision_id', id).limit(401)
      : Promise.resolve(null),
    s.client.from('execution_estimate_revisions')
      .select('id,revision_number,status')
      .eq('organization_id', s.org).eq('estimate_id', text(row.estimate_id))
      .lt('revision_number', Number(row.revision_number) || 1)
      .order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    s.allowed('project.view')
      ? s.client.from('projects').select('name').eq('organization_id', s.org)
          .eq('id', text(row.project_id)).maybeSingle()
      : Promise.resolve(null),
  ]);

  const readError = Boolean(scopeQuery.error || linesQuery.error || costQuery?.error || previousQuery.error);
  const scopes = (scopeQuery.data ?? []) as BoqScope[];
  const lines = (linesQuery.data ?? []) as BoqLine[];
  const costs = (costQuery?.data ?? []) as Cost[];
  const costByLine = new Map(costs.map((cost) => [cost.line_id, cost]));
  const fullyLoaded =
    !readError &&
    (scopeQuery.count ?? 0) === scopes.length &&
    (linesQuery.count ?? 0) === lines.length &&
    (!canSeeCost || (costQuery?.count ?? 0) === costs.length);
  const summary = calculateRevisionCost(
    lines,
    costs,
    currency,
    fullyLoaded && canSeeCost,
  );
  const canCompare = canSeeCost && Boolean(previousQuery.data?.id);
  const oldCosts = canCompare
    ? await s.client.from('execution_estimate_line_costs')
        .select('line_id,revision_id,unit_cost,estimated_cost,waste_cost,currency', { count: 'exact' })
        .eq('organization_id', s.org)
        .eq('revision_id', previousQuery.data!.id)
        .limit(401)
    : null;
  // Every previous priced line must be accounted for before reporting a difference.
  const oldLines = canCompare
    ? await s.client.from('execution_estimate_lines')
        .select('id', { count: 'exact' })
        .eq('organization_id', s.org)
        .eq('revision_id', previousQuery.data!.id)
        .limit(401)
    : null;
  const prior = canCompare && !oldCosts?.error && !oldLines?.error
    ? calculateRevisionCost(
        oldLines?.data ?? [],
        oldCosts?.data ?? [],
        currency,
        (oldCosts?.count ?? -1) === oldCosts?.data?.length &&
          (oldLines?.count ?? -1) === oldLines?.data?.length,
      )
    : null;
  const delta = summary.total !== null && prior?.total !== null
    ? summary.total - prior.total
    : null;
  const scopesById = new Map(scopes.map((scope) => [scope.id, scope]));
  const orphaned = lines.filter((line) => !scopesById.has(line.scope_id)).length;
  const totalCoverage = scopes.filter((scope) => scope.coverage === 'estimated').length;
  const numericRev = Number(row.revision_number) || 1;
  const emailNote = canSeeCost
    ? summary.complete
      ? 'All visible estimate lines have an authorized priced cost.'
      : 'Cost total is not certified: some lines are unpriced or the result is incomplete.'
    : 'Cost values are restricted to users with estimate.view_cost permission.';

  return (
    <main id="main-content" tabIndex={-1} className="erp-page boq-detail">
      <header className="erp-titlebar">
        <div>
          <p className="erp-eyebrow">CONSTRUCTION ESTIMATE / REVISION {revision}</p>
          <h1>BOQ &amp; Estimate Revisions</h1>
          <p>
            {projectQuery?.data?.name || 'Project record'} ·
            Revision {revision || '—'} · {text(row.estimate_id).slice(0, 8)}
          </p>
        </div>
        <div className="erp-header-actions">
          <Link href="/dashboard/execution/execution_estimate_revisions" className="erp-button erp-button-outline">← Estimate register</Link>
          {canSeeCost && (
            <Link className="erp-button erp-button-outline" href={'/dashboard/execution/execution_estimate_revisions/' + id + '/pdf'}>Export PDF</Link>
          )}
          {previousQuery.data && (
            <a className="erp-button erp-button-outline" href="#erp-comparison">Compare Rev {previousQuery.data.revision_number}</a>
          )}
        </div>
      </header>
      <div className="erp-detail-meta" aria-label="Estimate metadata">
        <span><strong>Project:</strong> {projectQuery?.data?.name || text(row.project_id).slice(0, 8)}</span>
        <span><strong>Revision:</strong> Rev {numericRev}</span>
        <span className={'erp-status erp-status-' + status}>{status.replaceAll('_', ' ')}</span>
        <span><strong>Recorded:</strong> {dateLabel(row.created_at)}</span>
      </div>
      <div className="erp-stats" aria-label="Estimate financial snapshot">
        {[
          { icon: '▤', label: 'Priced cost', value: summary.total === null ? 'Incomplete' : formatAmount(summary.total, currency), detail: summary.complete ? 'All priced lines' : summary.priced + ' priced of ' + lines.length + ' loaded lines' },
          { icon: '◇', label: 'Contingency', value: 'Not configured', detail: 'No separate approved contingency' },
          { icon: '▥', label: 'Selling value', value: 'Not linked', detail: 'Refer to accepted quotation' },
          { icon: '%', label: 'Gross margin', value: 'Not available', detail: 'Needs verified selling value' },
          { icon: '✓', label: 'Scope coverage', value: scopes.length ? totalCoverage + ' / ' + scopes.length : '—', detail: 'Estimated scopes in view' },
        ].map((item) => (
          <section className="erp-stat" key={item.label}>
            <div className="erp-stat-icon" aria-hidden="true">{item.icon}</div>
            <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>
          </section>
        ))}
      </div>
      <div className="erp-detail-grid">
        <div className="erp-stack">
          <section className="erp-panel" aria-labelledby="boq-detail-title">
            <div className="erp-panel-header">
              <div>
                <p className="erp-eyebrow">LIVE APPROVED CONTRACT SCOPE</p>
                <h2 id="boq-detail-title">BOQ — detailed estimate</h2>
                <p>{scopes.length} scopes loaded · {lines.length} resource / labour lines loaded</p>
              </div>
              <span className="erp-tag">Rev {numericRev}</span>
            </div>
            {readError && (
              <p className="erp-notice" role="alert">Some estimate details could not be loaded. No missing financial data is assumed to be zero.</p>
            )}
            {!fullyLoaded && !readError && (
              <p className="erp-notice" role="status">
                Large estimate: this view loads up to 200 scopes and 400 lines. Totals are hidden if the full revision has not been loaded. Open individual scopes for the remaining work.
              </p>
            )}
            {!canSeeCost && <p className="erp-notice">{emailNote}</p>}
            <div className="erp-table-scroll">
              <table className="erp-table">
                <thead><tr>
                  <th>Work scope / BOQ item</th><th>Quantity</th><th>Unit</th>
                  {canSeeCost && <><th>Unit rate</th><th>Amount</th></>}
                  <th>Cost type</th><th>Details</th>
                </tr></thead>
                <tbody>
                  {scopes.map((scope, position) => {
                    const snapshot = record(scope.snapshot);
                    const scopeLines = lines.filter((line) => line.scope_id === scope.id);
                    return (
                      <ScopeRows
                        key={scope.id}
                        scope={scope}
                        index={position + 1}
                        name={text(snapshot.name) || 'Unnamed contract scope'}
                        items={scopeLines}
                        costByLine={costByLine}
                        currency={currency}
                        canSeeCost={canSeeCost}
                      />
                    );
                  })}
                </tbody>
              </table>
              {!scopes.length && !readError && (
                <div className="erp-empty">
                  <strong>No scope rows found for this revision</strong>
                  <p>Use the execution planner to synchronize approved quotation or change-order scope.</p>
                </div>
              )}
            </div>
            {orphaned > 0 && (
              <p className="erp-notice">{orphaned} loaded requirements refer to scope rows outside this view.</p>
            )}
            <p className="erp-cell-secondary">Source records are the existing tenant-scoped execution estimates and their original line cost snapshots. Nothing here is demo data.</p>
          </section>
          <section className="erp-panel" aria-labelledby="approval-audit-heading">
            <div className="erp-panel-header">
              <div><p className="erp-eyebrow">APPROVAL HISTORY</p><h2 id="approval-audit-heading">Recorded events</h2></div>
            </div>
            <dl className="erp-audit-grid">
              <div><dt>Revision created</dt><dd>{dateLabel(row.created_at)}</dd></div>
              <div><dt>Submitted for review</dt><dd>{dateLabel(row.submitted_at)}</dd></div>
              <div><dt>Approved</dt><dd>{dateLabel(row.approved_at)}</dd></div>
              <div><dt>Decision / review note</dt><dd>{text(row.decision_reason) || 'No note recorded'}</dd></div>
            </dl>
          </section>
        </div>
        <aside className="erp-stack" aria-label="Revision review and comparison">
          <section className="erp-panel" id="erp-comparison">
            <div className="erp-panel-header"><div><p className="erp-eyebrow">CHANGE CONTROL</p><h2>Revision comparison</h2><p>Actual priced totals where both revisions are complete.</p></div></div>
            {previousQuery.data ? (
              <>
                <div className="erp-compare-cards">
                  <div><small>Previous</small><strong>Rev {previousQuery.data.revision_number}</strong><span>{prior?.total === null || prior?.total === undefined ? 'Incomplete' : formatAmount(prior.total, currency)}</span></div>
                  <div><small>Current</small><strong>Rev {numericRev}</strong><span>{summary.total === null ? 'Incomplete' : formatAmount(summary.total, currency)}</span></div>
                </div>
                <div className="erp-impact">
                  <span>Net cost movement</span>
                  <strong>{delta === null ? 'Cannot verify' : (delta > 0 ? '+' : '') + formatAmount(delta, currency)}</strong>
                </div>
                <p className="erp-cell-secondary">
                  A verified item-level additions/removals/changes comparison is not yet available. Differences are shown only when both revisions have complete priced line records.
                </p>
                <Link className="erp-inline-action" href={'/dashboard/execution/execution_estimate_revisions/' + previousQuery.data.id}>Open Rev {previousQuery.data.revision_number} →</Link>
              </>
            ) : (
              <p className="erp-notice">This is the earliest revision found for this estimate, or earlier versions are not accessible.</p>
            )}
          </section>
          <section className="erp-panel">
            <div className="erp-panel-header"><div><p className="erp-eyebrow">WORKFLOW CONTROL</p><h2>Approval workflow</h2><p>Existing server-validated estimate commands.</p></div></div>
            <div className="erp-flow">
              {[
                { label: 'Draft', active: status === 'draft', done: status !== 'draft' },
                { label: 'Under review', active: status === 'under_review', done: ['approved','superseded'].includes(status) },
                { label: 'Approved', active: status === 'approved', done: status === 'superseded' },
              ].map((step) => (
                <div className={'erp-step' + (step.done ? ' is-done' : step.active ? ' is-current' : '')} key={step.label}>
                  ● <span>{step.label}</span>
                </div>
              ))}
            </div>
            <div className="erp-action-forms">
              {status === 'draft' && s.allowed('estimate.edit') && (
                <>
                  <StateAction title="Synchronize approved scope" operation="sync" id={id} version={Number(row.version)} />
                  <StateAction title="Submit for review" operation="submit" id={id} version={Number(row.version)} />
                </>
              )}
              {status === 'under_review' && (
                <>
                  {s.allowed('estimate.approve') && <StateAction title="Approve estimate" operation="approve" id={id} version={Number(row.version)} />}
                  {s.allowed('estimate.review') && <StateAction title="Return with comments" operation="return" id={id} version={Number(row.version)} reason />}
                </>
              )}
              {['approved', 'superseded'].includes(status) && s.allowed('estimate.create') && (
                <StateAction title="Create revised estimate" operation="revise" id={id} version={Number(row.version)} />
              )}
              {status === 'approved' && s.allowed('purchase_requisition.create') && (
                <Link className="erp-button erp-button-primary" href={'/dashboard/execution/purchase_requisitions/new?revision=' + id}>Create purchase requisition</Link>
              )}
              {!['draft','under_review','approved','superseded'].includes(status) && (
                <p className="erp-notice">This revision has no available status transition.</p>
              )}
            </div>
          </section>
          <section className="erp-panel">
            <div className="erp-panel-header"><div><p className="erp-eyebrow">COST QUALITY</p><h2>Pricing completeness</h2></div></div>
            <dl className="erp-audit-grid">
              <div><dt>Priced lines</dt><dd>{canSeeCost ? summary.priced : 'Restricted'}</dd></div>
              <div><dt>Unpriced lines</dt><dd>{canSeeCost ? summary.unpriced : 'Restricted'}</dd></div>
              <div><dt>Currency</dt><dd>{currency}</dd></div>
            </dl>
            <p className="erp-cell-secondary">{emailNote}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ScopeRows({
  scope, index, name, items, costByLine, currency, canSeeCost,
}: {
  scope: BoqScope;
  index: number;
  name: string;
  items: BoqLine[];
  costByLine: Map<string, Cost>;
  currency: string;
  canSeeCost: boolean;
}) {
  const scopeUrl = '/dashboard/execution/execution_estimate_scope_items/' + scope.id;
  return (
    <>
      <tr className="erp-section-row">
        <td colSpan={canSeeCost ? 7 : 5}>
          <Link href={scopeUrl}>{index}. {name}</Link>
          <span className="erp-cell-secondary">{scope.area_name || 'Unassigned area'} · {scope.coverage.replaceAll('_', ' ')} · {scope.source_type.replaceAll('_', ' ')}</span>
        </td>
      </tr>
      {items.map((line, position) => {
        const cost = costByLine.get(line.id);
        const lineUrl = '/dashboard/execution/execution_estimate_lines/' + line.id;
        return (
          <tr key={line.id}>
            <td className="erp-boq-indented">
              <Link className="erp-record-link" href={lineUrl}>{index}.{position + 1} {line.description || 'Untitled requirement'}</Link>
              {line.drawing_reference && <small className="erp-cell-secondary">Drawing: {line.drawing_reference}</small>}
            </td>
            <td>{line.planned_purchase_quantity || '—'}</td>
            <td>{line.purchase_unit || '—'}</td>
            {canSeeCost && (
              <>
                <td>{cost ? formatAmount(asNumber(cost.unit_cost) ?? 0, cost.currency) : 'Unpriced'}</td>
                <td>{cost ? formatAmount(asNumber(cost.estimated_cost) ?? 0, cost.currency) : 'Unpriced'}</td>
              </>
            )}
            <td><span className="erp-tag">{line.cost_kind.replaceAll('_', ' ')}</span></td>
            <td>
              <details className="erp-line-expand">
                <summary>Cost build-up</summary>
                <div className="erp-breakdown">
                  <h3>{line.description || 'Requirement'}</h3>
                  <dl>
                    <div><dt>Type</dt><dd>{line.cost_kind.replaceAll('_', ' ')}</dd></div>
                    <div><dt>Base quantity</dt><dd>{line.base_quantity}</dd></div>
                    <div><dt>Waste quantity</dt><dd>{line.waste_quantity}</dd></div>
                    <div><dt>Rate per unit</dt><dd>{canSeeCost && cost ? formatAmount(asNumber(cost.unit_cost) ?? 0, currency) : 'Unavailable'}</dd></div>
                    <div><dt>Planned cost</dt><dd>{canSeeCost && cost ? formatAmount(asNumber(cost.estimated_cost) ?? 0, currency) : 'Unavailable'}</dd></div>
                    <div><dt>Waste cost (included in planned rate)</dt><dd>{canSeeCost && cost ? formatAmount(asNumber(cost.waste_cost) ?? 0, currency) : 'Unavailable'}</dd></div>
                  </dl>
                  <p className="erp-cell-secondary">{line.measurement_note || 'No measurement note recorded.'}</p>
                  <Link href={lineUrl} className="erp-inline-action">Open original rate/measurement editor →</Link>
                </div>
              </details>
            </td>
          </tr>
        );
      })}
      {!items.length && (
        <tr><td colSpan={canSeeCost ? 7 : 5} className="erp-cell-secondary">No resource or labour items loaded under this scope. <Link href={scopeUrl}>Open scope →</Link></td></tr>
      )}
    </>
  );
}
