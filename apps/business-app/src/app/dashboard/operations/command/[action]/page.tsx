import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  operationDefinitions,
  operationSourceEntity,
} from '@business-os/core/operations-command';
import { operationsServices } from '../../service';
import { OperationForm } from '../../command-form';
import { record, records, text } from '../../../execution/presentation';
export default async function CommandPage({
  params,
  searchParams,
}: {
  params: Promise<{ action: string }>;
  searchParams: Promise<{
    id?: string;
    project?: string;
    plan?: string;
    predecessor?: string;
  }>;
}) {
  const { action } = await params,
    q = await searchParams,
    definition = operationDefinitions[action];
  if (!definition) notFound();
  const s = await operationsServices(definition.permission, true);
  let initial: Record<string, unknown> = {
    ...(q.project ? { project_id: q.project } : {}),
    ...(q.plan ? { plan_id: q.plan } : {}),
    ...(q.predecessor ? { predecessor_id: q.predecessor } : {}),
    weight: '1',
    source_type: 'manual',
    scope_state: 'in_execution',
    priority: 'normal',
  };
  if (q.id) {
    const result = await s.operations.search(operationSourceEntity(action), {
        id: q.id,
      }),
      row = result.rows[0];
    if (!row) notFound();
    initial = { ...initial, ...row };
    if (action.startsWith('inspection_') || action.startsWith('handover_'))
      initial.results = records(row.checklist).map((item) => ({
        key: item.key,
        result: item.result,
        note: item.note,
      }));
    if (action === 'request_approve') {
      const all = [];
      for (let page = 1; page <= 4; page++) {
        const r = await s.operations.search(
          'material_issue_request_items',
          { request_id: q.id },
          page,
        );
        all.push(...r.rows);
        if (page * 25 >= r.total) break;
      }
      initial.items = all.map((item) => ({
        id: item.id,
        approved_quantity: item.approved_quantity ?? item.quantity,
      }));
    }
    if (definition.group === 'snag' && definition.operation === 'transition')
      initial.status = definition.fields.find((f) => f.key === 'status')
        ?.options?.[0];
  }
  if (definition.fields.some((f) => f.key === 'id') && !q.id) notFound();
  const project = text(initial.project_id) || q.project;
  return (
    <section className="space-y-4">
      <Link
        className="text-sm underline"
        href={`/dashboard/operations${project ? `?project=${project}` : ''}`}
      >
        Project execution
      </Link>
      <h1 className="text-xl font-semibold capitalize">{definition.label}</h1>
      {Array.isArray(initial.checklist) && (
        <div className="text-sm">
          {records(initial.checklist).map((item) => (
            <p key={text(item.key)}>
              {text(item.key)}: {text(item.label)}
              {item.required ? ' (required)' : ''}
            </p>
          ))}
        </div>
      )}
      <OperationForm
        action={action}
        initial={record(initial)}
        project={project}
      />
    </section>
  );
}
