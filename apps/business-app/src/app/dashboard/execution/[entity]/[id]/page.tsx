import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  executionEntitySchema,
  executionPermissions,
  type ExecutionEntity,
} from '@business-os/core/execution';
import { executionServices } from '../../service';
import { ExecutionForm } from '../../form';
import { configurationEntities, configurationPermission } from '../../forms';
import { ScopeBuilder } from '../../builder';
import { label, records, RecordTable, text, titles } from '../../presentation';
export default async function ExecutionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { entity: raw, id } = await params,
    parsed = executionEntitySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const entity = parsed.data,
    s = await executionServices(executionPermissions[entity], true),
    row = await s.execution.detail(entity, id),
    q = await searchParams,
    page = Math.max(1, Number(q.page) || 1);
  const childMap: Partial<Record<ExecutionEntity, [ExecutionEntity, string]>> =
    {
      material_categories: ['materials', 'category_id'],
      materials: ['material_variants', 'material_id'],
      material_variants: ['material_unit_conversions', 'variant_id'],
      vendors: ['vendor_contacts', 'vendor_id'],
      estimation_recipes: ['estimation_recipe_items', 'recipe_id'],
      execution_estimates: ['execution_estimate_revisions', 'estimate_id'],
      execution_estimate_revisions: [
        'execution_estimate_scope_items',
        'revision_id',
      ],
      purchase_requisitions: ['purchase_requisition_items', 'requisition_id'],
      purchase_requisition_items: ['purchase_requisition_sources', 'item_id'],
      rfqs: ['rfq_items', 'rfq_id'],
      vendor_quotes: ['vendor_quote_items', 'quote_id'],
      purchase_orders: ['purchase_order_items', 'po_id'],
      goods_receipts: ['goods_receipt_items', 'receipt_id'],
    };
  const child = childMap[entity];
  const childData = child
    ? await s.execution.search(child[0], { [child[1]]: id }, page)
    : null;
  const links: Record<string, ExecutionEntity> = {
    contract_id: 'execution_estimates',
    revision_id: 'execution_estimate_revisions',
    scope_id: 'execution_estimate_scope_items',
    material_id: 'materials',
    variant_id: 'material_variants',
    vendor_id: 'vendors',
    recipe_id: 'estimation_recipes',
    requisition_id: 'purchase_requisitions',
    rfq_id: 'rfqs',
    quote_id: 'vendor_quotes',
    quote_item_id: 'vendor_quote_items',
    rfq_item_id: 'rfq_items',
    item_id: 'purchase_requisition_items',
    requisition_item_id: 'purchase_requisition_items',
    po_id: 'purchase_orders',
    po_item_id: 'purchase_order_items',
    estimate_line_id: 'execution_estimate_lines',
  };
  const status = text(row.status);
  const documentPermission =
    entity === 'execution_estimate_revisions'
      ? 'estimate.view_cost'
      : entity === 'purchase_orders' && row.issued_at
        ? 'purchase_order.view_cost'
        : entity === 'goods_receipts'
          ? 'goods_receipt.view'
          : null;
  const recipients =
    entity === 'rfqs' && row.issued_at
      ? (await s.execution.search('rfq_vendors', { rfq_id: id })).rows
      : [];
  const version = Number(row.version);
  const action = (
    title: string,
    action: string,
    operation: string,
    permission: string,
    reason = false,
  ) =>
    s.allowed(permission) ? (
      <ExecutionForm
        key={operation}
        title={title}
        initial={
          action === 'estimate'
            ? { action, operation, input: { id, version } }
            : { action, operation, id, version }
        }
        fields={
          reason
            ? [
                {
                  key: action === 'estimate' ? 'reason' : 'reason',
                  label: 'Reason',
                  required: true,
                },
              ]
            : []
        }
      />
    ) : null;
  const comparison =
    entity === 'rfqs' && s.allowed('vendor_quote.view')
      ? await s.execution.comparison(id)
      : null;
  const costs =
    entity === 'purchase_orders' && s.allowed('purchase_order.view_cost')
      ? await s.execution.search('purchase_order_costs', { po_id: id })
      : null;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <Link className="underline" href={`/dashboard/execution/${entity}`}>
        {titles[entity]}
      </Link>
      <h1 className="my-4 text-3xl">{label(row)}</h1>
      {status && (
        <p className="my-3 font-semibold">{status.replaceAll('_', ' ')}</p>
      )}
      {documentPermission && s.allowed(documentPermission) && (
        <nav className="my-4 flex gap-4" aria-label="Documents">
          <Link
            className="underline"
            href={`/dashboard/execution/${entity}/${id}/preview`}
          >
            Document preview
          </Link>
          <Link
            className="underline"
            href={`/dashboard/execution/${entity}/${id}/pdf`}
          >
            Download PDF
          </Link>
        </nav>
      )}
      {recipients.length > 0 && (
        <section className="my-4">
          <h2 className="font-semibold">RFQ documents</h2>
          {recipients.map((recipient) => (
            <p key={text(recipient.vendor_id)}>
              <Link
                className="underline"
                href={`/dashboard/execution/rfqs/${id}/pdf?vendor=${text(recipient.vendor_id)}`}
              >
                {text(
                  (recipient.vendor_snapshot as Record<string, unknown>)?.name,
                )}{' '}
                — Download RFQ PDF
              </Link>
            </p>
          ))}
        </section>
      )}
      <dl className="my-5 grid gap-3 sm:grid-cols-3">
        {Object.entries(row)
          .filter(
            ([key, value]) =>
              !key.endsWith('_id') &&
              ![
                'id',
                'organization_id',
                'request_hash',
                'idempotency_key',
                'created_by',
                'updated_at',
                'created_at',
                'status',
                'version',
              ].includes(key) &&
              (typeof value === 'string' || typeof value === 'number'),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt className="text-sm text-muted-foreground">
                {key.replaceAll('_', ' ')}
              </dt>
              <dd className="break-words">{text(value) || '—'}</dd>
            </div>
          ))}
      </dl>
      <nav className="my-4 flex flex-wrap gap-4" aria-label="Source records">
        {Object.entries(links)
          .filter(
            ([key, target]) =>
              key !== 'contract_id' &&
              row[key] &&
              s.allowed(executionPermissions[target]),
          )
          .map(([key, target]) => (
            <Link
              className="underline"
              key={key}
              href={`/dashboard/execution/${target}/${text(row[key])}`}
            >
              {key.replaceAll('_id', '').replaceAll('_', ' ')}
            </Link>
          ))}
        {row.contract_id && s.allowed('estimate.view') && (
          <Link
            className="underline"
            href={`/dashboard/execution?contract=${text(row.contract_id)}&project=${text(row.project_id)}`}
          >
            Contract scope
          </Link>
        )}
      </nav>
      {(configurationEntities as readonly string[]).includes(entity) &&
        entity !== 'material_unit_conversions' &&
        s.allowed(configurationPermission(entity)) && (
          <Link
            className="underline"
            href={`/dashboard/execution/${entity}/new?edit=${id}`}
          >
            Edit / deactivate
          </Link>
        )}
      {entity === 'material_cost_revisions' &&
        s.allowed('material_cost.manage') && (
          <Link
            className="underline"
            href={`/dashboard/execution/${entity}/new?edit=${id}`}
          >
            Record successor rate
          </Link>
        )}
      {child && childData && (
        <section className="my-6">
          <h2 className="text-2xl">{titles[child[0]]}</h2>
          <RecordTable
            rows={childData.rows}
            entity={child[0]}
            columns={[
              'coverage',
              'status',
              'cost_kind',
              'base_quantity',
              'planned_purchase_quantity',
              'quantity',
              'unit',
              'unit_price',
              'total',
              'received_quantity',
              'accepted_quantity',
              'rejected_quantity',
            ]}
          />
          {childData.total > 25 && (
            <nav className="flex gap-4">
              {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
              {page * 25 < childData.total && (
                <Link href={`?page=${page + 1}`}>Next</Link>
              )}
            </nav>
          )}
        </section>
      )}
      {entity === 'materials' && s.allowed('material.manage') && (
        <Link
          className="underline"
          href="/dashboard/execution/material_variants/new"
        >
          Add variant
        </Link>
      )}
      {entity === 'material_variants' && (
        <nav className="my-4 flex gap-4">
          {s.allowed('material.manage') && (
            <Link
              className="underline"
              href="/dashboard/execution/material_unit_conversions/new"
            >
              Add explicit conversion
            </Link>
          )}
          {s.allowed('material_cost.view') && (
            <Link
              className="underline"
              href={`/dashboard/execution/material_cost_revisions?variant_id=${id}`}
            >
              Cost history
            </Link>
          )}
        </nav>
      )}
      {entity === 'vendors' && s.allowed('vendor.manage') && (
        <nav className="my-4 flex gap-4">
          <Link
            className="underline"
            href="/dashboard/execution/vendor_contacts/new"
          >
            Add contact
          </Link>
          <Link
            className="underline"
            href="/dashboard/execution/vendor_materials/new"
          >
            Material mapping
          </Link>
        </nav>
      )}
      {entity === 'estimation_recipes' &&
        s.allowed('estimate.manage_recipes') && (
          <Link
            className="underline"
            href="/dashboard/execution/estimation_recipe_items/new"
          >
            Add recipe component
          </Link>
        )}
      {entity === 'estimation_recipe_items' &&
        s.allowed('estimate.manage_recipes') &&
        s.allowed('estimate.view_cost') && (
          <Link
            className="underline"
            href="/dashboard/execution/estimation_recipe_item_costs/new"
          >
            Set service cost basis
          </Link>
        )}
      {entity === 'execution_estimate_scope_items' && (
        <ScopeBuilder s={s} scope={row} />
      )}
      {entity === 'execution_estimate_lines' && (
        <ScopeBuilder
          s={s}
          scope={await s.execution.detail(
            'execution_estimate_scope_items',
            text(row.scope_id),
          )}
          line={row}
        />
      )}
      {entity === 'execution_estimate_revisions' && (
        <section className="my-5">
          <h2 className="text-2xl">Estimate actions</h2>
          {status === 'draft' && (
            <>
              {action(
                'Synchronize approved scope',
                'estimate',
                'sync',
                'estimate.edit',
              )}
              {action(
                'Submit for review',
                'estimate',
                'submit',
                'estimate.edit',
              )}
            </>
          )}
          {status === 'under_review' && (
            <>
              {action(
                'Approve estimate',
                'estimate',
                'approve',
                'estimate.approve',
              )}
              {action(
                'Return for changes',
                'estimate',
                'return',
                'estimate.review',
                true,
              )}
            </>
          )}
          {['approved', 'superseded'].includes(status) &&
            action('Create revision', 'estimate', 'revise', 'estimate.create')}
          {status === 'approved' &&
            s.allowed('purchase_requisition.create') && (
              <Link
                className="underline"
                href={`/dashboard/execution/purchase_requisitions/new?revision=${id}`}
              >
                Create requisition from requirements
              </Link>
            )}
        </section>
      )}
      {entity === 'purchase_requisitions' && (
        <>
          {status === 'draft' &&
            action(
              'Submit requisition',
              'requisition_transition',
              'submit',
              'purchase_requisition.create',
            )}
          {status === 'submitted' &&
            action(
              'Approve requisition',
              'requisition_transition',
              'approve',
              'purchase_requisition.approve',
            )}
          {status === 'approved' && s.allowed('rfq.create') && (
            <Link
              className="underline"
              href={`/dashboard/execution/rfqs/new?requisition=${id}`}
            >
              Create RFQ
            </Link>
          )}
          {status !== 'cancelled' &&
            action(
              'Cancel requisition',
              'requisition_transition',
              'cancel',
              'purchase_requisition.create',
              true,
            )}
        </>
      )}
      {entity === 'rfqs' && (
        <>
          {status === 'draft' &&
            action('Issue RFQ', 'rfq_transition', 'issue', 'rfq.manage')}
          {status === 'issued' && (
            <>
              {s.allowed('vendor_quote.manage') && (
                <Link
                  className="underline"
                  href={`/dashboard/execution/vendor_quotes/new?rfq=${id}`}
                >
                  Enter vendor quote
                </Link>
              )}
              {action('Close RFQ', 'rfq_transition', 'close', 'rfq.manage')}
            </>
          )}
          {comparison && (
            <section className="my-6">
              <h2 className="text-2xl">Vendor comparison</h2>
              <p>Recorded commercial terms. No ranking or automatic award.</p>
              {records(comparison.vendors).map((vendor) => (
                <article
                  key={text(vendor.vendor_id)}
                  className="my-4 rounded border p-4"
                >
                  <h3 className="font-semibold">
                    {text(vendor.vendor_name)} · {text(vendor.response_status)}
                  </h3>
                  {records(vendor.quotes).map((quote) => (
                    <div className="my-3" key={text(quote.id)}>
                      <Link
                        className="underline"
                        href={`/dashboard/execution/vendor_quotes/${text(quote.id)}`}
                      >
                        {text(quote.reference)}
                      </Link>
                      <p>
                        {text(quote.total)} {text(quote.currency)} · Freight{' '}
                        {text(quote.freight)} · Lead{' '}
                        {text(quote.lead_time_days)} days · Valid until{' '}
                        {text(quote.valid_until)}
                        {quote.expired ? ' · Expired' : ''}
                      </p>
                      <p>{text(quote.payment_terms)}</p>
                      <RecordTable
                        rows={records(quote.items)}
                        entity="vendor_quote_items"
                        columns={[
                          'quantity',
                          'unit',
                          'unit_price',
                          'discount',
                          'tax_amount',
                          'minimum_order',
                          'lead_time_days',
                          'total',
                        ]}
                      />
                    </div>
                  ))}
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {entity === 'vendor_quotes' && (
        <>
          {status === 'draft' && (
            <>
              <Link
                className="underline"
                href={`/dashboard/execution/vendor_quotes/new?edit=${id}`}
              >
                Edit quote
              </Link>
              {action(
                'Record vendor quote',
                'quote_transition',
                'record',
                'vendor_quote.manage',
              )}
            </>
          )}
          {status === 'recorded' && s.allowed('purchase_order.create') && (
            <Link
              className="underline"
              href={`/dashboard/execution/purchase_orders/new?quote=${id}`}
            >
              Create purchase order / split award
            </Link>
          )}
        </>
      )}
      {entity === 'purchase_orders' && (
        <>
          {costs?.rows.map((cost) => (
            <p className="my-4 text-xl" key={text(cost.id)}>
              Order total: {text(cost.total)} {text(row.currency)} · Tax{' '}
              {text(cost.tax_amount)} · Freight {text(cost.freight)}
            </p>
          ))}
          {status === 'draft' &&
            action(
              'Issue purchase order',
              'po_transition',
              'issue',
              'purchase_order.issue',
            )}
          {['issued', 'partially_received'].includes(status) &&
            s.allowed('goods_receipt.record') && (
              <Link
                className="underline"
                href={`/dashboard/execution/goods_receipts/new?po=${id}`}
              >
                Receive goods / services
              </Link>
            )}
          {['draft', 'issued'].includes(status) &&
            action(
              'Cancel purchase order',
              'po_transition',
              'cancel',
              'purchase_order.manage',
              true,
            )}
          {status === 'received' &&
            action(
              'Close purchase order',
              'po_transition',
              'close',
              'purchase_order.manage',
              true,
            )}
        </>
      )}
    </main>
  );
}
