import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canUseOperations } from '../access';
import { createOperationsRepository } from '@business-os/database/operations';
import {
  operationsEntitySchema,
  operationsPermissions,
} from '@business-os/core/operations';
import { text } from '../../execution/presentation';
import { SiteForm } from '../site-form';
import { operationDefinitions } from '@business-os/core/operations-command';
export default async function OperationsList({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ project?: string; page?: string }>;
}) {
  const { entity } = await params,
    { project, page } = await searchParams;
  const parsed = operationsEntitySchema.safeParse(entity);
  if (!parsed.success) notFound();

  // Keep the active membership check server-side, then let the tenant-scoped
  // operations_search RPC make the authoritative permission/entitlement
  // decision. This avoids a false-negative UI preflight turning every record
  // list into the generic app error page; the RPC and table RLS still protect
  // the rows and reject callers without access.
  const { client } = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();
  const allowed = (permission: string) => canUseOperations(context, permission);
  const operations = createOperationsRepository(client, context.organizationId);
  const result = await operations.search(
    parsed.data,
    project &&
      ![
        'inventory_locations',
        'inventory_lots',
        'inventory_lot_costs',
        'inventory_counts',
        'vendor_execution_profiles',
        'inspection_templates',
        'handover_templates',
      ].includes(parsed.data)
      ? { project_id: project }
      : {},
    Number(page) || 1,
  );
  const columns = [
    'status',
    'completion_percentage',
    'quantity',
    'unit',
    'kind',
    'planned_end',
    'priority',
  ].filter((k) => result.rows.some((r) => r[k] != null));
  return (
    <section className="space-y-4">
      <Link
        className="text-sm underline"
        href={`/dashboard/operations${project ? `?project=${project}` : ''}`}
      >
        Project execution
      </Link>
      <h1 className="text-xl font-semibold capitalize">
        {entity.replaceAll('_', ' ')}
      </h1>
      <nav
        className="flex flex-wrap gap-3 text-sm"
        aria-label="Create or record actions"
      >
        {Object.entries(operationDefinitions)
          .filter(
            ([, d]) =>
              d.entity === entity &&
              !d.fields.some((f) => f.key === 'id') &&
              allowed(d.permission),
          )
          .map(([action, d]) => (
            <Link
              className="rounded border px-3 py-2 capitalize"
              key={action}
              href={`/dashboard/operations/command/${action}${project ? `?project=${project}` : ''}`}
            >
              {d.label}
            </Link>
          ))}
      </nav>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b p-2">Record</th>
              {columns.map((k) => (
                <th key={k} className="border-b p-2 capitalize">
                  {k.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={text(row.id)}>
                <td className="border-b p-2">
                  <Link
                    className="underline"
                    href={`/dashboard/operations/${entity}/${text(row.id)}`}
                  >
                    {text(
                      row.name ||
                        row.title ||
                        row.number ||
                        row.plan_number ||
                        row.request_number,
                    ) || 'Record'}
                  </Link>
                </td>
                {columns.map((k) => (
                  <td key={k} className="border-b p-2">
                    {text(row[k]).replaceAll('_', ' ')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && (
        <p className="text-sm text-muted-foreground">No records yet.</p>
      )}
      {entity === 'project_snags' && project && allowed('snag.create') && (
        <details>
          <summary className="cursor-pointer text-sm">Create snag</summary>
          <SiteForm kind="snag" project={project} />
        </details>
      )}
      <nav className="flex gap-4 text-sm" aria-label="Pagination">
        {result.page > 1 && (
          <Link
            href={`?page=${result.page - 1}${project ? `&project=${project}` : ''}`}
          >
            Previous
          </Link>
        )}
        <span>{result.total} records</span>
        {result.page * 25 < result.total && (
          <Link
            href={`?page=${result.page + 1}${project ? `&project=${project}` : ''}`}
          >
            Next
          </Link>
        )}
      </nav>
    </section>
  );
}
