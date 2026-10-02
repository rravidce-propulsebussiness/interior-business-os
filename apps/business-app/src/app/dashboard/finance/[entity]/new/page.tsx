import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { financeServices } from '../../service';
import { FinanceForm } from '../../form';
import type { FinanceField } from '../../form';
import { titles, text } from '../../presentation';
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));
export default async function NewFinance({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entity } = await params,
    q = await searchParams;
  const permissions: Record<string, string> = {
    contracts: 'contract.create',
    payment_schedules: 'payment_schedule.manage',
    invoices: 'invoice.create',
    payments: 'payment.record',
    change_orders: 'change_order.create',
    organization_billing_settings: 'billing.manage',
    payment_methods: 'billing.manage',
    tax_codes: 'billing.manage',
  };
  if (!permissions[entity]) notFound();
  const s = await financeServices(permissions[entity]!, true);
  const contractId = q.contract_id;
  const contract =
    contractId && s.allowed('contract.view')
      ? await s.finance.detail('contracts', contractId)
      : null;
  const today = new Date().toISOString().slice(0, 10);
  let initial: Record<string, unknown> = {},
    fields: FinanceField[] = [],
    itemFields: FinanceField[] | undefined,
    itemDefaults: Record<string, unknown> = {},
    itemsKey = 'items';
  const searchFilter = {
    q: q.lookup ?? '',
    ...(contractId ? { contract_id: contractId } : {}),
  };
  const lookupPage = Math.max(1, Number(q.lookup_page) || 1);
  const taxRows = s.allowed('invoice.view')
    ? (
        await s.finance.search(
          'tax_codes',
          { q: q.tax_q ?? '' },
          Math.max(1, Number(q.tax_page) || 1),
        )
      ).rows
    : [];
  const taxOptions = [
    { value: '', label: 'No tax' },
    ...taxRows.map((r) => ({ value: text(r, 'id'), label: text(r, 'code') })),
  ];
  const scope =
    contractId && ['invoices', 'change_orders'].includes(entity)
      ? await s.finance.scope(contractId)
      : [];
  if (entity === 'contracts') {
    initial = { action: 'create_contract', revision_id: q.revision_id ?? '' };
    fields = [
      {
        key: 'revision_id',
        label: 'Accepted quotation revision',
        required: true,
        hint: 'Open an approved quotation and use Create Contract to prefill this reference.',
      },
    ];
  } else if (entity === 'organization_billing_settings') {
    initial = {
      action: 'settings',
      input: {
        legal_name: '',
        billing_address: '',
        tax_identifier: '',
        invoice_prefix: 'INV',
        receipt_prefix: 'RCPT',
        contract_prefix: 'CT',
        default_terms: '',
        payment_instructions: '',
        invoice_notes: '',
        receipt_footer: '',
      },
    };
    fields = [
      { key: 'legal_name', label: 'Legal business name', required: true },
      { key: 'billing_address', label: 'Billing address', type: 'textarea' },
      { key: 'tax_identifier', label: 'Tax registration / GSTIN' },
      ...['invoice_prefix', 'receipt_prefix', 'contract_prefix'].map((key) => ({
        key,
        label: key.replaceAll('_', ' '),
        required: true,
      })),
      ...[
        'default_terms',
        'payment_instructions',
        'invoice_notes',
        'receipt_footer',
      ].map((key) => ({
        key,
        label: key.replaceAll('_', ' '),
        type: 'textarea' as const,
      })),
    ];
  } else if (entity === 'payment_methods') {
    initial = {
      action: 'payment_method',
      input: { name: '', kind: 'bank_transfer', active: true },
    };
    fields = [
      { key: 'name', label: 'Method name', required: true },
      {
        key: 'kind',
        label: 'Payment method',
        options: options([
          'bank_transfer',
          'upi',
          'cash',
          'cheque',
          'card_offline',
          'other',
        ]),
      },
      { key: 'active', label: 'Enabled', type: 'checkbox' },
    ];
  } else if (entity === 'tax_codes') {
    itemsKey = 'components';
    itemDefaults = { name: '', rate: '0' };
    initial = {
      action: 'tax_code',
      input: {
        code: '',
        jurisdiction: '',
        active: true,
        components: [itemDefaults],
      },
    };
    fields = [
      { key: 'code', label: 'Tax code', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'active', label: 'Enabled', type: 'checkbox' },
    ];
    itemFields = [
      { key: 'name', label: 'Component name', required: true },
      { key: 'rate', label: 'Rate (%)', required: true },
    ];
  } else if (!contractId) {
    const choices = s.allowed('contract.view')
      ? await s.finance.search('contracts', { q: q.lookup ?? '' }, lookupPage)
      : { rows: [], total: 0 };
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
        <h1 className="text-3xl">Choose contract</h1>
        <form className="my-4">
          <label>
            Contract number
            <input
              name="lookup"
              className="rounded border p-2"
              defaultValue={q.lookup}
            />
          </label>
          <button className="border p-2">Search</button>
        </form>
        {choices.rows.map((r) => (
          <p key={text(r, 'id')}>
            <Link className="underline" href={`?contract_id=${text(r, 'id')}`}>
              {text(r, 'contract_number')} / {text(r, 'customer_name')}
            </Link>
          </p>
        ))}
        {lookupPage * 25 < choices.total && (
          <Link
            href={`?lookup=${encodeURIComponent(q.lookup ?? '')}&lookup_page=${lookupPage + 1}`}
          >
            Next contracts
          </Link>
        )}
        <p>Open a contract to start this workflow.</p>
      </main>
    );
  } else if (entity === 'payment_schedules') {
    itemDefaults = {
      label: 'Milestone',
      description: '',
      calculation_type: 'percentage',
      value: '0',
      due_trigger: '',
      due_date: null,
    };
    initial = {
      action: 'save_schedule',
      contract_id: contractId,
      input: {
        label: 'Payment schedule',
        supersedes_id: q.supersedes_id ?? null,
        items: [
          { ...itemDefaults, label: 'Booking advance', value: '10' },
          {
            ...itemDefaults,
            label: 'Remaining balance',
            calculation_type: 'remaining',
            value: '0',
          },
        ],
      },
    };
    fields = [{ key: 'label', label: 'Schedule name', required: true }];
    itemFields = [
      { key: 'label', label: 'Milestone', required: true },
      { key: 'description', label: 'Description' },
      {
        key: 'calculation_type',
        label: 'Calculation',
        options: options(['percentage', 'fixed', 'remaining']),
      },
      {
        key: 'value',
        label: 'Percentage / fixed amount',
        required: true,
        hint: 'Use 0 for remaining balance. A remaining-balance line must be last.',
      },
      { key: 'due_trigger', label: 'Due trigger' },
      { key: 'due_date', label: 'Due date', type: 'date', nullable: true },
    ];
  } else if (entity === 'invoices') {
    const milestones = s.allowed('payment_schedule.view')
      ? (
          await s.finance.search(
            'payment_schedule_items',
            searchFilter,
            lookupPage,
          )
        ).rows
      : [];
    const changes = s.allowed('change_order.view')
      ? (
          await s.finance.search(
            'change_orders',
            { ...searchFilter, status: 'approved' },
            lookupPage,
          )
        ).rows
      : [];
    const sourceOptions = [
      ...(s.allowed('invoice.manage')
        ? [{ value: 'manual', label: 'Authorized custom line' }]
        : []),
      ...milestones.map((r) => ({
        value: `milestone:${text(r, 'id')}`,
        label: `Milestone: ${text(r, 'label')} (${text(r, 'expected_amount')})`,
      })),
      ...scope.map((r) => ({
        value: `quotation:${text(r, 'id')}`,
        label: `Accepted scope: ${text(r, 'name')} (${text(r, 'contracted_amount')})`,
      })),
      ...changes
        .filter((r) => !text(r, 'net_adjustment').startsWith('-'))
        .map((r) => ({
          value: `change_order:${text(r, 'id')}`,
          label: `Change: ${text(r, 'change_order_number')}`,
        })),
    ];
    itemDefaults = {
      description: '',
      quantity: '1',
      unit: 'each',
      unit_rate: '0',
      discount: '0',
      tax_code_id: null,
      hsn_sac: '',
      source_ref: sourceOptions[0]?.value ?? 'manual',
    };
    initial = {
      action: 'save_invoice',
      contract_id: contractId,
      input: {
        invoice_type: 'tax_invoice',
        issue_date: today,
        due_date: null,
        tax_mode: 'exclusive',
        tax_application: 'line',
        tax_code_id: null,
        place_of_supply: '',
        billing_state: '',
        notes: '',
        items: [itemDefaults],
      },
    };
    fields = [
      {
        key: 'invoice_type',
        label: 'Document type',
        options: options(['tax_invoice', 'proforma']),
      },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
      { key: 'due_date', label: 'Due date', type: 'date', nullable: true },
      {
        key: 'tax_mode',
        label: 'Tax treatment',
        options: options(['exclusive', 'inclusive']),
      },
      {
        key: 'tax_application',
        label: 'Apply tax',
        options: options(['line', 'document']),
      },
      {
        key: 'tax_code_id',
        label: 'Document tax code',
        options: taxOptions,
        nullable: true,
      },
      { key: 'billing_state', label: 'Billing state' },
      { key: 'place_of_supply', label: 'Place of supply' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    itemFields = [
      { key: 'source_ref', label: 'Source', options: sourceOptions },
      { key: 'description', label: 'Description', required: true },
      { key: 'quantity', label: 'Quantity (custom lines)', required: true },
      { key: 'unit', label: 'Unit', required: true },
      {
        key: 'unit_rate',
        label: 'Unit rate (custom lines)',
        required: true,
        hint: 'Milestone and approved change amounts are calculated by the server.',
      },
      { key: 'discount', label: 'Discount amount', required: true },
      {
        key: 'tax_code_id',
        label: 'Line tax code',
        options: taxOptions,
        nullable: true,
      },
      { key: 'hsn_sac', label: 'HSN/SAC (if applicable)' },
    ];
  } else if (entity === 'payments') {
    const methods = (
      await s.finance.search(
        'payment_methods',
        { q: q.method_q ?? '' },
        Math.max(1, Number(q.method_page) || 1),
      )
    ).rows.filter((r) => r.active === true);
    const invoices = s.allowed('invoice.view')
      ? (
          await s.finance.search(
            'invoices',
            { ...searchFilter, status: 'issued' },
            lookupPage,
          )
        ).rows.filter(
          (r) => r.invoice_type === 'tax_invoice' && text(r, 'balance') !== '0',
        )
      : [];
    itemDefaults = {
      invoice_id: invoices[0]?.id ?? '',
      amount: '0',
      idempotency_key: randomUUID(),
    };
    itemsKey = 'allocations';
    initial = {
      action: 'record_payment',
      contract_id: contractId,
      input: {
        idempotency_key: randomUUID(),
        payment_date: today,
        amount: '',
        method_id: methods[0]?.id ?? '',
        external_reference: '',
        notes: '',
        allocations: [],
      },
    };
    fields = [
      {
        key: 'payment_date',
        label: 'Received date',
        type: 'date',
        required: true,
      },
      { key: 'amount', label: 'Amount received', required: true },
      {
        key: 'method_id',
        label: 'Payment method',
        options: methods.map((r) => ({
          value: text(r, 'id'),
          label: text(r, 'name'),
        })),
      },
      { key: 'external_reference', label: 'Bank / UPI / cheque reference' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    if (s.allowed('payment.allocate'))
      itemFields = [
        {
          key: 'invoice_id',
          label: 'Allocate to invoice',
          options: invoices.map((r) => ({
            value: text(r, 'id'),
            label: `${text(r, 'invoice_number')}  /  ${text(r, 'balance')} remaining`,
          })),
        },
        { key: 'amount', label: 'Allocated amount', required: true },
      ];
  } else if (entity === 'change_orders') {
    itemDefaults = {
      change_type: 'addition',
      description: '',
      reason: '',
      area: '',
      original_item_id: null,
      pricing_type: 'manual',
      quantity: '1',
      unit: 'each',
      unit_rate: '0',
      adjustment: '0',
      specifications: [],
    };
    initial = {
      action: 'change_order',
      input: {
        action: 'save',
        contract_id: contractId,
        reason: '',
        terms: '',
        items: [itemDefaults],
      },
    };
    fields = [
      {
        key: 'reason',
        label: 'Change reason',
        type: 'textarea',
        required: true,
      },
      { key: 'terms', label: 'Terms', type: 'textarea' },
    ];
    itemFields = [
      {
        key: 'change_type',
        label: 'Change type',
        options: options([
          'addition',
          'deletion',
          'modification',
          'price_adjustment',
        ]),
      },
      { key: 'description', label: 'Scope description', required: true },
      { key: 'reason', label: 'Line reason', required: true },
      { key: 'area', label: 'Room / area' },
      {
        key: 'original_item_id',
        label: 'Original accepted item reference',
        nullable: true,
        hint: 'Required for deletion or modification. Choose a reference from the contract scope.',
      },
      { key: 'quantity', label: 'New quantity', required: true },
      { key: 'unit', label: 'Unit', required: true },
      { key: 'unit_rate', label: 'New unit rate', required: true },
      {
        key: 'adjustment',
        label: 'Signed adjustment (price adjustment only)',
        required: true,
      },
    ];
  }
  if (entity === 'change_orders' && itemFields) {
    itemFields = itemFields.map((f) =>
      f.key === 'original_item_id'
        ? {
            ...f,
            label: 'Original accepted scope',
            hint: 'Deduction uses the original contracted value, including its share of quotation discounts.',
            options: [
              { value: '', label: 'No original item (addition / adjustment)' },
              ...scope
                .filter((r) => !r.already_changed)
                .map((r) => ({
                  value: text(r, 'id'),
                  label: `${text(r, 'name')}  /  ${text(r, 'contracted_amount')}`,
                })),
            ],
          }
        : f,
    );
  }
  if (q.edit) {
    const old = await s.finance.detail(entity, q.edit);
    if (
      entity === 'change_orders' &&
      Array.isArray(old.items) &&
      old.items.some(
        (row) =>
          (row as Record<string, unknown>).new_snapshot &&
          (
            (row as Record<string, unknown>).new_snapshot as Record<
              string,
              unknown
            >
          ).line_type === 'catalog',
      )
    ) {
      return (
        <main id="main-content" className="mx-auto max-w-5xl p-6">
          <h1 className="text-3xl">Catalog-priced change</h1>
          <p className="my-4">
            To revise catalog specifications, cancel this draft and create a
            replacement using current catalog configuration. The replacement is
            priced again before issue.
          </p>
          <Link
            className="underline"
            href={`/dashboard/finance/change_orders/${q.edit}`}
          >
            Return to change order
          </Link>
        </main>
      );
    }
    const target = initial.input as Record<string, unknown>;
    const restored: Record<string, unknown> = {
      ...target,
      ...Object.fromEntries(
        Object.keys(target).map((k) => [k, old[k] ?? target[k]]),
      ),
      id: q.edit,
      version: old.version,
    };
    if (itemFields && Array.isArray(old[itemsKey]))
      restored[itemsKey] = (old[itemsKey] as Record<string, unknown>[]).map(
        (row) => ({
          ...itemDefaults,
          ...Object.fromEntries(
            Object.keys(itemDefaults).map((k) => [
              k,
              row[k] ?? itemDefaults[k],
            ]),
          ),
          ...(entity === 'invoices'
            ? {
                source_ref: `${text(row, 'source_type')}${text(row, 'source_id') ? ':' + text(row, 'source_id') : ''}`,
              }
            : {}),
          ...(entity === 'change_orders'
            ? {
                quantity:
                  (row.new_snapshot as Record<string, unknown> | null)
                    ?.quantity ?? '1',
                unit_rate:
                  (row.new_snapshot as Record<string, unknown> | null)
                    ?.display_rate ?? '0',
                unit:
                  (
                    (row.new_snapshot as Record<string, unknown> | null)
                      ?.unit as Record<string, unknown> | undefined
                  )?.label ?? 'each',
                specifications:
                  (row.new_snapshot as Record<string, unknown> | null)
                    ?.customer_specifications ?? [],
                adjustment:
                  row.change_type === 'price_adjustment'
                    ? row.net_adjustment
                    : '0',
              }
            : {}),
        }),
      );
    initial = { ...initial, input: restored };
  }
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl">
        {q.edit ? 'Edit' : 'Create'} {titles[entity]?.toLowerCase()}
      </h1>
      {contract && (
        <p className="my-3">
          {text(contract, 'contract_number')} / {text(contract, 'currency')}{' '}
          {text(contract, 'current_contract_value')}
        </p>
      )}
      {entity === 'payments' && (
        <p className="my-3">
          Leave allocations empty to retain the receipt as an unallocated
          advance.
        </p>
      )}
      {entity === 'tax_codes' && (
        <p className="my-3">
          Tax codes configure arithmetic only. Confirm the applicable treatment
          before issuing a tax invoice.
        </p>
      )}
      {contractId && (
        <form className="my-4 flex flex-wrap gap-2">
          <input type="hidden" name="contract_id" value={contractId} />
          <label>
            Find source / invoice
            <input
              className="block rounded border p-2"
              name="lookup"
              defaultValue={q.lookup}
            />
          </label>
          <label>
            Source page
            <input
              className="block rounded border p-2"
              name="lookup_page"
              type="number"
              min="1"
              defaultValue={lookupPage}
            />
          </label>
          <label>
            Tax code
            <input
              className="block rounded border p-2"
              name="tax_q"
              defaultValue={q.tax_q}
            />
          </label>
          <label>
            Method
            <input
              className="block rounded border p-2"
              name="method_q"
              defaultValue={q.method_q}
            />
          </label>
          <button className="rounded border p-2">Find</button>
        </form>
      )}
      {entity === 'change_orders' && contractId && (
        <p className="my-4">
          <Link
            className="underline"
            href={`/dashboard/finance/change_orders/catalog?contract_id=${contractId}`}
          >
            Price added or modified scope from catalog
          </Link>
        </p>
      )}
      <FinanceForm
        initial={initial}
        title={
          entity === 'payments'
            ? 'Record payment and receipt'
            : 'Save draft / configuration'
        }
        fields={fields}
        {...(itemFields ? { itemFields } : {})}
        itemsKey={itemsKey}
        itemDefaults={itemDefaults}
      />
    </main>
  );
}
