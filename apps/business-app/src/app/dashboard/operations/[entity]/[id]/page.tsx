import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  operationsEntitySchema,
  operationsPermissions,
} from '@business-os/core/operations';
import { operationsServices } from '../../service';
import { SiteForm } from '../../site-form';
import { text } from '../../../execution/presentation';
import {
  operationDefinitions,
  operationSourceEntity,
} from '@business-os/core/operations-command';
export default async function OperationDetail({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params,
    parsed = operationsEntitySchema.safeParse(entity);
  if (!parsed.success) notFound();
  const s = await operationsServices(operationsPermissions[parsed.data], true),
    result = await s.operations.search(parsed.data, { id }),
    row = result.rows[0];
  if (!row) notFound();
  const fields = [
    'status',
    'description',
    'kind',
    'quantity',
    'unit',
    'completion_percentage',
    'planned_start',
    'planned_end',
    'actual_start',
    'actual_end',
    'priority',
    'block_reason',
    'reason',
    'notes',
    'resolution',
    'verification',
    'created_at',
  ];
  const actionLinks = Object.entries(operationDefinitions).filter(
    ([action, d]) =>
      operationSourceEntity(action) === entity &&
      (d.group === 'save' || d.fields.some((f) => f.key === 'id')) &&
      s.allowed(d.permission),
  );
  const documentKind =
    entity === 'inventory_transactions'
      ? row.kind === 'issue_to_site'
        ? 'material_issue'
        : 'inventory_movement'
      : entity === 'project_inspections' && row.approved_at
        ? 'inspection'
        : entity === 'handover_records' && row.status === 'approved'
          ? 'handover'
          : entity === 'subcontractor_work_orders' && row.status !== 'draft'
            ? 'work_order'
            : undefined;
  return (
    <section className="space-y-4">
      <Link
        className="text-sm underline"
        href={`/dashboard/operations/${entity}${row.project_id ? `?project=${text(row.project_id)}` : ''}`}
      >
        Back to records
      </Link>
      <h1 className="text-xl font-semibold">
        {text(
          row.title ||
            row.name ||
            row.number ||
            row.plan_number ||
            row.request_number,
        ) || 'Execution record'}
      </h1>
      {documentKind && (
        <div className="flex gap-4 text-sm">
          <Link
            className="underline"
            href={`/dashboard/operations/documents/${documentKind}/${id}/preview`}
          >
            Preview document
          </Link>
          <Link
            className="underline"
            href={`/dashboard/operations/documents/${documentKind}/${id}/pdf`}
          >
            Download PDF
          </Link>
        </div>
      )}
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Record actions">
        {actionLinks.map(([action, d]) => (
          <Link
            className="rounded border px-3 py-2 capitalize"
            key={action}
            href={`/dashboard/operations/command/${action}?id=${id}${row.project_id ? `&project=${text(row.project_id)}` : ''}`}
          >
            {d.label}
          </Link>
        ))}
        {entity === 'execution_plans' && (
          <Link
            className="rounded border px-3 py-2"
            href={`/dashboard/operations/execution_plan_revisions?project=${text(row.project_id)}`}
          >
            Plan revisions
          </Link>
        )}
        {entity === 'project_inspections' &&
          ['failed', 'requires_rework'].includes(text(row.status)) &&
          s.allowed('inspection.create') && (
            <Link
              className="rounded border px-3 py-2"
              href={`/dashboard/operations/command/inspection_create?project=${text(row.project_id)}&predecessor=${id}`}
            >
              Reinspect
            </Link>
          )}
      </nav>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields
          .filter((k) => text(row[k]))
          .map((k) => (
            <div key={k}>
              <dt className="text-xs capitalize text-muted-foreground">
                {k.replaceAll('_', ' ')}
              </dt>
              <dd className="whitespace-pre-wrap text-sm">{text(row[k])}</dd>
            </div>
          ))}
      </dl>
      {entity === 'project_tasks' &&
        s.allowed('task.manage') &&
        !['done', 'cancelled'].includes(text(row.status)) && (
          <SiteForm
            kind="task"
            id={id}
            version={Number(row.version)}
            status={text(row.status)}
            progress={text(row.completion_percentage)}
          />
        )}
    </section>
  );
}
