import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  executionEntitySchema,
  executionPermissions,
} from '@business-os/core/execution';
import { executionServices } from '../service';
import { RecordTable, titles } from '../presentation';
import { configurationEntities, configurationPermission } from '../forms';
export default async function ExecutionList({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{
    page?: string;
    query?: string;
    project?: string;
    status?: string;
    variant_id?: string;
  }>;
}) {
  const { entity: raw } = await params,
    parsed = executionEntitySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const entity = parsed.data,
    q = await searchParams,
    s = await executionServices(executionPermissions[entity], true),
    page = Math.max(1, Number(q.page) || 1);
  const projectScoped =
    /^(execution_estimate_revisions|purchase_requisitions|rfqs|vendor_quotes|purchase_orders|goods_receipts)$/.test(
      entity,
    );
  const data = await s.execution.search(
    entity,
    {
      ...(q.query ? { query: q.query } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.variant_id ? { variant_id: q.variant_id } : {}),
      ...(q.project && projectScoped ? { project_id: q.project } : {}),
    },
    page,
  );
  const configure =
    (configurationEntities as readonly string[]).includes(entity) &&
    s.allowed(configurationPermission(entity)) &&
    (entity !== 'estimation_recipe_item_costs' ||
      s.allowed('estimate.view_cost'));
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">{titles[entity]}</h1>
      <form className="my-4 flex flex-wrap gap-3">
        {q.variant_id && (
          <input type="hidden" name="variant_id" value={q.variant_id} />
        )}
        <label>
          Search{' '}
          <input
            className="rounded border p-2"
            name="query"
            defaultValue={q.query}
          />
        </label>
        <label>
          Status{' '}
          <input
            className="rounded border p-2"
            name="status"
            defaultValue={q.status}
          />
        </label>
        {q.project && <input type="hidden" name="project" value={q.project} />}
        <button className="rounded border p-2">Filter</button>
      </form>
      {configure && (
        <Link className="underline" href={`/dashboard/execution/${entity}/new`}>
          Create {titles[entity]?.toLowerCase()}
        </Link>
      )}
      {entity === 'material_cost_revisions' &&
        s.allowed('material_cost.manage') && (
          <Link
            className="underline"
            href={`/dashboard/execution/${entity}/new`}
          >
            Record cost revision
          </Link>
        )}
      {entity === 'execution_estimate_revisions' &&
        s.allowed('estimate.create') && (
          <Link
            className="underline"
            href={`/dashboard/execution${q.project ? `?project=${q.project}` : ''}`}
          >
            Create estimate from accepted contract
          </Link>
        )}
      {entity === 'materials' && (
        <nav className="my-4 flex flex-wrap gap-4">
          {(
            [
              'material_categories',
              'material_variants',
              'material_unit_conversions',
              'material_cost_revisions',
            ] as const
          )
            .filter((e) => s.allowed(executionPermissions[e]))
            .map((e) => (
              <Link
                className="underline"
                key={e}
                href={`/dashboard/execution/${e}`}
              >
                {titles[e]}
              </Link>
            ))}
        </nav>
      )}
      <RecordTable
        rows={data.rows}
        entity={entity}
        columns={[
          'status',
          'code',
          'revision_number',
          'quantity',
          'unit',
          'unit_cost',
          'currency',
          'valid_from',
          'valid_until',
          'source_reference',
          'total',
        ]}
      />
      <p>
        {data.total} records · Page {page}
      </p>
      <div className="my-4 flex gap-4">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ ...q, page: String(page - 1) } as Record<string, string>)}`}
          >
            Previous
          </Link>
        )}
        {page * 25 < data.total && (
          <Link
            href={`?${new URLSearchParams({ ...q, page: String(page + 1) } as Record<string, string>)}`}
          >
            Next
          </Link>
        )}
      </div>
    </main>
  );
}
