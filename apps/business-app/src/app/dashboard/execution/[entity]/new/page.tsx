import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { executionEntitySchema } from '@business-os/core/execution';
import { executionServices } from '../../service';
import { ExecutionForm, type ExecutionField } from '../../form';
import {
  choices,
  documentItems,
  configurationEntities,
  configurationFields,
  configurationPermission,
} from '../../forms';
import { label, text, titles, records, RecordTable } from '../../presentation';
export default async function ExecutionNew({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{
    edit?: string;
    revision?: string;
    requisition?: string;
    rfq?: string;
    quote?: string;
    po?: string;
  }>;
}) {
  const { entity: raw } = await params,
    parsed = executionEntitySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const entity = parsed.data,
    q = await searchParams,
    isConfig = (configurationEntities as readonly string[]).includes(entity);
  const permission = isConfig
    ? configurationPermission(entity)
    : (
        {
          material_cost_revisions: 'material_cost.manage',
          purchase_requisitions: 'purchase_requisition.create',
          rfqs: 'rfq.create',
          vendor_quotes: 'vendor_quote.manage',
          purchase_orders: 'purchase_order.create',
          goods_receipts: 'goods_receipt.record',
        } as Record<string, string>
      )[entity];
  if (!permission) notFound();
  const s = await executionServices(permission, true);
  let progress: ReturnType<typeof records> = [];
  let initial: Record<string, unknown> = {},
    fields: ExecutionField[] = [],
    itemFields: ExecutionField[] | undefined,
    itemsKey = 'items';
  const today = new Date().toISOString().slice(0, 10),
    retryKey = randomUUID();
  const field = (
    key: string,
    label: string,
    required = true,
  ): ExecutionField => ({ key, label, required });
  const named = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    optional = false,
  ): ExecutionField => ({
    key,
    label,
    required: !optional,
    optional,
    options: [{ value: '', label: optional ? 'None' : 'Select…' }, ...options],
  });
  if (isConfig) {
    if (
      entity === 'estimation_recipe_item_costs' &&
      !s.allowed('estimate.view_cost')
    )
      notFound();
    const prior = q.edit ? await s.execution.detail(entity, q.edit) : {};
    const configuration = await configurationFields(s, entity, prior);
    fields = configuration.fields;
    const keys = [...new Set(fields.map((f) => f.key.split('.')[0]!))];
    const input = {
      ...configuration.defaults,
      ...Object.fromEntries(
        keys
          .filter((key) => prior[key] !== undefined)
          .map((key) => [key, prior[key]]),
      ),
      ...(q.edit ? { id: q.edit, version: prior.version } : {}),
    };
    initial = { action: 'configure', entity, input };
  } else if (entity === 'material_cost_revisions') {
    fields = [
      named(
        'variant_id',
        'Material variant',
        await choices(s, 'material_variants', { status: 'active' }),
      ),
      named(
        'vendor_id',
        'Vendor-specific rate (optional)',
        await choices(s, 'vendors', { status: 'active' }),
        true,
      ),
      field('currency', 'Currency'),
      field('unit_cost', 'Unit cost'),
      field('source_reference', 'Source / reference'),
      {
        key: 'valid_from',
        label: 'Effective from',
        type: 'date',
        required: true,
      },
      {
        key: 'valid_until',
        label: 'Effective until (exclusive)',
        type: 'date',
        optional: true,
      },
    ];
    const prior = q.edit ? await s.execution.detail(entity, q.edit) : null;
    initial = {
      action: 'cost_record',
      input: {
        currency: s.organization.default_currency,
        valid_from: today,
        ...(prior
          ? {
              variant_id: prior.variant_id,
              vendor_id: prior.vendor_id ?? undefined,
              replaces_id: q.edit,
              version: prior.version,
              unit_cost: prior.unit_cost,
              source_reference: prior.source_reference,
            }
          : {}),
      },
    };
  } else if (entity === 'purchase_requisitions') {
    if (!q.revision) notFound();
    const revision = await s.execution.detail(
      'execution_estimate_revisions',
      q.revision,
    );
    if (revision.status !== 'approved') notFound();
    const lines = {
      rows: records((await s.execution.demand(q.revision)).items),
    };
    progress = lines.rows;
    fields = [
      {
        key: 'required_date',
        label: 'Required date',
        type: 'date',
        optional: true,
      },
      {
        key: 'priority',
        label: 'Priority',
        options: ['low', 'normal', 'high', 'urgent'].map((value) => ({
          value,
          label: value,
        })),
      },
      field('delivery_location', 'Delivery location'),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    itemFields = [
      named(
        'line_id',
        'Estimated requirement',
        lines.rows.map((row) => ({
          value: text(row.id),
          label: `${label(row)} · required ${text(row.required)}, ordered ${text(row.ordered)}, available to requisition ${text(row.remaining)} ${text(row.unit)}`,
        })),
      ),
      field('quantity', 'Quantity to requisition'),
    ];
    itemsKey = 'sources';
    initial = {
      action: 'requisition_create',
      input: {
        revision_id: q.revision,
        idempotency_key: retryKey,
        priority: 'normal',
      },
    };
  } else if (entity === 'rfqs') {
    if (!q.requisition) notFound();
    const pr = await s.execution.detail('purchase_requisitions', q.requisition),
      items = await documentItems(s, 'purchase_requisition_items', {
        requisition_id: q.requisition,
      });
    fields = [
      {
        key: 'vendor_ids',
        label: 'Invited vendors',
        required: true,
        multiple: true,
        options: await choices(s, 'vendors', { status: 'active' }),
        hint: 'Select all vendors who should receive this request.',
      },
      {
        key: 'required_date',
        label: 'Required date',
        type: 'date',
        optional: true,
      },
      field('delivery_location', 'Delivery location'),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    itemFields = [
      named(
        'requisition_item_id',
        'Requisition item',
        items.rows.map((row) => ({
          value: text(row.id),
          label: `${label(row)} · ${text(row.quantity)} ${text(row.unit)}`,
        })),
      ),
      field('quantity', 'Requested quantity'),
    ];
    initial = {
      action: 'rfq_create',
      input: {
        requisition_id: q.requisition,
        idempotency_key: retryKey,
        delivery_location: pr.delivery_location,
        required_date: pr.required_date ?? undefined,
      },
    };
  } else if (entity === 'vendor_quotes') {
    const prior = q.edit ? await s.execution.detail(entity, q.edit) : null;
    const rfqId = q.rfq || text(prior?.rfq_id);
    if (!rfqId) notFound();
    const rfq = await s.execution.detail('rfqs', rfqId),
      vendors = await s.execution.search('rfq_vendors', { rfq_id: rfqId }),
      items = await documentItems(s, 'rfq_items', { rfq_id: rfqId });
    fields = [
      named(
        'vendor_id',
        'Vendor',
        vendors.rows.map((row) => ({
          value: text(row.vendor_id),
          label: text((row.vendor_snapshot as Record<string, unknown>)?.name),
        })),
      ),
      field('reference', 'Vendor quote reference'),
      field('currency', 'Currency'),
      {
        key: 'valid_until',
        label: 'Valid until',
        type: 'date',
        required: true,
      },
      field('freight', 'Freight (quote total)'),
      { key: 'lead_time_days', label: 'Lead time (days)', type: 'integer' },
      field('payment_terms', 'Payment terms', false),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    itemFields = [
      named(
        'rfq_item_id',
        'Requested item',
        items.rows.map((row) => ({
          value: text(row.id),
          label: `${label(row)} · ${text(row.quantity)} ${text(row.unit)}`,
        })),
      ),
      field('quantity', 'Quoted quantity'),
      field('unit_price', 'Rate per unit'),
      field('discount', 'Line discount amount'),
      {
        key: 'tax_mode',
        label: 'Tax mode',
        options: [
          { value: 'exclusive', label: 'Exclusive' },
          { value: 'inclusive', label: 'Inclusive' },
        ],
      },
      field('tax_components.0.name', 'Tax component'),
      field('tax_components.0.rate', 'Tax rate (%)'),
      field('minimum_order', 'Minimum order'),
      {
        key: 'lead_time_days',
        label: 'Item lead time (days)',
        type: 'integer',
      },
    ];
    const existingItems = prior
      ? (await documentItems(s, 'vendor_quote_items', { quote_id: q.edit }))
          .rows
      : [];
    initial = {
      action: 'quote_save',
      input: {
        rfq_id: rfq.id,
        idempotency_key: retryKey,
        currency: s.organization.default_currency,
        valid_until: today,
        freight: '0',
        lead_time_days: 0,
        ...(prior
          ? Object.fromEntries(
              [
                'id',
                'version',
                'vendor_id',
                'reference',
                'currency',
                'valid_until',
                'freight',
                'lead_time_days',
                'payment_terms',
                'notes',
              ].map((key) => [key, prior[key]]),
            )
          : {}),
        items: existingItems.length
          ? existingItems.map((row) =>
              Object.fromEntries(
                itemFields!
                  .map((f) => f.key.split('.')[0]!)
                  .filter((key, i, a) => a.indexOf(key) === i)
                  .map((key) => [
                    key,
                    key === 'tax_components'
                      ? ((row[key] as Record<string, unknown>[]) ?? []).map(
                          (t) => ({ name: t.name, rate: t.rate }),
                        )
                      : row[key],
                  ]),
              ),
            )
          : [
              {
                discount: '0',
                tax_mode: 'exclusive',
                tax_components: [{ name: 'Tax', rate: '0' }],
                minimum_order: '0',
                lead_time_days: 0,
              },
            ],
      },
    };
  } else if (entity === 'purchase_orders') {
    if (!q.quote) notFound();
    const quote = await s.execution.detail('vendor_quotes', q.quote),
      items = await documentItems(s, 'vendor_quote_items', {
        quote_id: q.quote,
      }),
      rfq = await s.execution.detail('rfqs', text(quote.rfq_id));
    fields = [
      { key: 'order_date', label: 'Order date', type: 'date', required: true },
      {
        key: 'delivery_date',
        label: 'Delivery date',
        type: 'date',
        optional: true,
      },
      field('delivery_location', 'Delivery location'),
      { key: 'notes', label: 'Notes / delivery terms', type: 'textarea' },
    ];
    itemFields = [
      named(
        'quote_item_id',
        'Quoted item to award',
        items.rows.map((row) => ({
          value: text(row.id),
          label: `${label(row)} · ${text(row.quantity)} ${text(row.unit)} at ${text(row.unit_price)} ${text(quote.currency)}`,
        })),
      ),
      field('quantity', 'Award quantity'),
    ];
    initial = {
      action: 'po_create',
      input: {
        quote_id: q.quote,
        idempotency_key: retryKey,
        order_date: today,
        delivery_location: rfq.delivery_location,
      },
    };
  } else if (entity === 'goods_receipts') {
    if (!q.po) notFound();
    await s.execution.detail('purchase_orders', q.po);
    const items = { rows: records((await s.execution.receiving(q.po)).items) };
    progress = items.rows;
    fields = [
      {
        key: 'receipt_date',
        label: 'Received date',
        type: 'date',
        required: true,
      },
      field('supplier_reference', 'Supplier reference', false),
      { key: 'notes', label: 'Receipt notes', type: 'textarea' },
    ];
    itemFields = [
      named(
        'po_item_id',
        'Ordered item',
        items.rows.map((row) => ({
          value: text(row.id),
          label: `${label(row)} · ordered ${text(row.ordered)}, received ${text(row.received)}, remaining ${text(row.remaining)} ${text(row.unit)}`,
        })),
      ),
      field('received_quantity', 'Receiving now'),
      field('accepted_quantity', 'Accepted'),
      field('rejected_quantity', 'Rejected / damaged'),
      {
        key: 'notes',
        label: 'Rejection reason / line notes',
        type: 'textarea',
      },
    ];
    initial = {
      action: 'receipt_record',
      input: {
        po_id: q.po,
        idempotency_key: retryKey,
        receipt_date: today,
        items: [{ rejected_quantity: '0' }],
      },
    };
  }
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">
        {q.edit ? 'Update' : 'Create'} {titles[entity]?.toLowerCase()}
      </h1>
      <p className="my-3">
        All quantities and amounts are checked when saved. Issued records retain
        their source data.
      </p>
      {entity === 'purchase_requisitions' && q.revision && (
        <RecordTable
          rows={progress}
          entity="execution_estimate_lines"
          columns={[
            'required',
            'requisitioned',
            'ordered',
            'remaining',
            'unit',
          ]}
        />
      )}
      {entity === 'goods_receipts' && q.po && (
        <RecordTable
          rows={progress}
          entity="purchase_order_items"
          columns={[
            'ordered',
            'received',
            'accepted',
            'rejected',
            'remaining',
            'unit',
          ]}
        />
      )}
      <ExecutionForm
        title="Save"
        initial={initial}
        fields={fields}
        {...(itemFields ? { itemFields } : {})}
        itemsKey={itemsKey}
        itemDefaults={
          entity === 'vendor_quotes'
            ? {
                discount: '0',
                tax_mode: 'exclusive',
                tax_components: [{ name: 'Tax', rate: '0' }],
                minimum_order: '0',
                lead_time_days: 0,
              }
            : {}
        }
      />
    </main>
  );
}
