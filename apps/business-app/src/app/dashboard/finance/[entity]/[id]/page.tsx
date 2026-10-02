import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import {
  financeEntitySchema,
  financePermissions,
} from '@business-os/core/finance';
import { financeServices } from '../../service';
import { FinanceForm } from '../../form';
import { titles, text, RecordList, Metrics } from '../../presentation';
export default async function FinanceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entity: raw, id } = await params,
    parsed = financeEntitySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const entity = parsed.data,
    q = await searchParams,
    s = await financeServices(financePermissions[entity], true),
    r = await s.finance.detail(entity, id),
    contractId = entity === 'contracts' ? id : text(r, 'contract_id'),
    status = text(r, 'status'),
    version = r.version;
  const items = Array.isArray(r.items)
    ? (r.items as Record<string, unknown>[])
    : [];
  const docs = [
    'invoices',
    'receipts',
    'payment_requests',
    'change_orders',
  ].includes(entity);
  const tabs = (
    [
      'payment_schedules',
      'payment_requests',
      'invoices',
      'payments',
      'receipts',
      'change_orders',
    ] as const
  ).filter((e) => s.allowed(financePermissions[e]));
  const tab = tabs.find((t) => t === q.tab) ?? tabs[0];
  const page = Math.max(1, Number(q.page) || 1);
  const related =
    entity === 'contracts' && tab
      ? await s.finance.search(tab, { contract_id: id }, page)
      : null;
  const heading =
    text(r, 'contract_number') ||
    text(r, 'invoice_number') ||
    text(r, 'payment_number') ||
    text(r, 'receipt_number') ||
    text(r, 'change_order_number') ||
    text(r, 'request_number') ||
    text(r, 'label') ||
    text(r, 'name') ||
    text(r, 'code') ||
    titles[entity];
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <Link className="underline" href={`/dashboard/finance/${entity}`}>
        {titles[entity]}
      </Link>
      <h1 className="my-4 text-3xl">{heading}</h1>
      <p>
        {text(r, 'effective_status') || status} / {text(r, 'currency')}{' '}
        {text(r, 'current_contract_value') ||
          text(r, 'total') ||
          text(r, 'amount') ||
          text(r, 'net_adjustment')}
      </p>
      {contractId && entity !== 'contracts' && s.allowed('contract.view') && (
        <Link
          className="my-3 inline-block underline"
          href={`/dashboard/finance/contracts/${contractId}`}
        >
          Open contract
        </Link>
      )}
      {text(r, 'balance') && (
        <p>Outstanding invoice balance: {text(r, 'balance')}</p>
      )}
      {text(r, 'unallocated_amount') && (
        <p>Unallocated advance: {text(r, 'unallocated_amount')}</p>
      )}
      {docs && (status !== 'draft' || entity === 'invoices') && (
        <nav className="my-4 flex gap-4" aria-label="Documents">
          <a
            className="underline"
            href={`/dashboard/finance/${entity}/${id}/preview`}
            target="_blank"
            rel="noreferrer"
          >
            Print preview
          </a>
          <a
            className="underline"
            href={`/dashboard/finance/${entity}/${id}/pdf`}
          >
            Download PDF
          </a>
        </nav>
      )}
      {entity === 'contracts' && (
        <>
          <p>
            Original accepted value: {text(r, 'currency')}{' '}
            {text(r, 'original_contract_value')}
          </p>
          <Link
            className="underline"
            href={`/dashboard/quotations/${text(r, 'revision_id')}`}
          >
            Accepted quotation
          </Link>
          {s.allowed('financial_report.view') && (
            <Metrics data={await s.finance.summary(id)} />
          )}
          {s.allowed('contract.manage') &&
            !['closed', 'cancelled'].includes(status) && (
              <FinanceForm
                title="Update commercial status"
                initial={{
                  action: 'contract_status',
                  id,
                  version,
                  status: 'active',
                  reason: '',
                }}
                fields={[
                  {
                    key: 'status',
                    label: 'Commercial status',
                    options: [
                      'active',
                      'on_hold',
                      'completed',
                      'closed',
                      'cancelled',
                    ].map((value) => ({
                      value,
                      label: value.replaceAll('_', ' '),
                    })),
                  },
                  { key: 'reason', label: 'Reason', type: 'textarea' },
                ]}
              />
            )}
          <nav
            className="my-6 flex flex-wrap gap-4"
            aria-label="Contract sections"
          >
            {tabs.map((t) => (
              <Link className="underline" href={`?tab=${t}`} key={t}>
                {titles[t]}
              </Link>
            ))}
            <Link href="?tab=timeline" className="underline">
              Timeline
            </Link>
          </nav>
          {q.tab === 'timeline' ? (
            <ul>
              {(
                (await s.finance.timeline(id, page)) as Record<
                  string,
                  unknown
                >[]
              ).map((event, index) => (
                <li className="border-b py-3" key={index}>
                  {text(event, 'created_at')} / {text(event, 'action')}
                </li>
              ))}
            </ul>
          ) : (
            tab &&
            related && (
              <>
                <h2 className="text-2xl">{titles[tab]}</h2>
                {(
                  {
                    payment_schedules: 'payment_schedule.manage',
                    invoices: 'invoice.create',
                    payments: 'payment.record',
                    change_orders: 'change_order.create',
                  } as Record<string, string>
                )[tab] &&
                  s.allowed(
                    (
                      {
                        payment_schedules: 'payment_schedule.manage',
                        invoices: 'invoice.create',
                        payments: 'payment.record',
                        change_orders: 'change_order.create',
                      } as Record<string, string>
                    )[tab]!,
                  ) && (
                    <Link
                      className="my-3 inline-block underline"
                      href={`/dashboard/finance/${tab}/new?contract_id=${id}`}
                    >
                      Create {titles[tab]?.toLowerCase()}
                    </Link>
                  )}
                <RecordList entity={tab} rows={related.rows} />
                <p>{related.total} records</p>
              </>
            )
          )}
          <nav className="flex gap-4" aria-label="Section pagination">
            {page > 1 && (
              <Link href={`?tab=${q.tab ?? tab}&page=${page - 1}`}>
                Previous
              </Link>
            )}
            {(q.tab === 'timeline' ||
              (related && page * 25 < related.total)) && (
              <Link href={`?tab=${q.tab ?? tab}&page=${page + 1}`}>Next</Link>
            )}
          </nav>
          <details className="my-6">
            <summary>Accepted scope</summary>
            <p>
              The accepted quotation remains the historical baseline. Original
              item references for variations are listed in the change-order
              editor.
            </p>
          </details>
        </>
      )}
      {entity === 'payment_schedules' && (
        <>
          <p>
            Calculation basis: {text(r, 'basis_value')}. Activated amounts
            remain historical.
          </p>
          {status === 'draft' && s.allowed('payment_schedule.manage') && (
            <>
              <Link
                className="underline"
                href={`/dashboard/finance/payment_schedules/new?contract_id=${contractId}&edit=${id}`}
              >
                Edit draft / reorder milestones
              </Link>
              <FinanceForm
                title="Activate and freeze schedule"
                initial={{ action: 'activate_schedule', id, version }}
              />
            </>
          )}
          {status === 'active' && s.allowed('payment_schedule.manage') && (
            <Link
              className="underline"
              href={`/dashboard/finance/payment_schedules/new?contract_id=${contractId}&supersedes_id=${id}`}
            >
              Replace unreferenced future schedule
            </Link>
          )}
          <div>
            {items.map((item) => (
              <section
                className="my-4 rounded border p-4"
                key={text(item, 'id')}
              >
                <h2 className="text-xl">{text(item, 'label')}</h2>
                <p>
                  {text(item, 'calculation_type')} {text(item, 'value')} /
                  Expected {text(item, 'expected_amount')} /{' '}
                  {text(item, 'effective_status')}
                </p>
                <p>
                  {text(item, 'due_trigger')} {text(item, 'due_date')}
                </p>
                {status === 'active' && s.allowed('payment_request.create') && (
                  <FinanceForm
                    title="Issue payment request"
                    initial={{
                      action: 'issue_request',
                      item_id: item.id,
                      due_date: item.due_date ?? null,
                      note: '',
                    }}
                    fields={[
                      {
                        key: 'due_date',
                        label: 'Due date',
                        type: 'date',
                        nullable: true,
                      },
                      { key: 'note', label: 'Request note' },
                    ]}
                  />
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {entity === 'invoices' && (
        <>
          {status === 'draft' && (
            <>
              {s.allowed('invoice.manage') && (
                <Link
                  className="underline"
                  href={`/dashboard/finance/invoices/new?contract_id=${contractId}&edit=${id}`}
                >
                  Edit draft
                </Link>
              )}
              {s.allowed('invoice.issue') && (
                <FinanceForm
                  title="Issue and freeze invoice"
                  initial={{ action: 'issue_invoice', id, version }}
                />
              )}
            </>
          )}
          {status !== 'void' && s.allowed('invoice.manage') && (
            <FinanceForm
              title="Void invoice"
              initial={{ action: 'void_invoice', id, reason: '' }}
              fields={[{ key: 'reason', label: 'Void reason', required: true }]}
            />
          )}
          <p>
            Subtotal {text(r, 'subtotal')} / Discount {text(r, 'discount')} /
            Tax {text(r, 'tax_amount')} / Total {text(r, 'total')}
          </p>
          <RecordList entity="invoice_items" rows={items} />
        </>
      )}
      {entity === 'payments' && (
        <>
          {s.allowed('receipt.view') && text(r, 'receipt_id') && (
            <Link
              className="underline"
              href={`/dashboard/finance/receipts/${text(r, 'receipt_id')}`}
            >
              Open receipt
            </Link>
          )}
          {status === 'recorded' && s.allowed('payment.allocate') && (
            <FinanceForm
              title="Allocate advance"
              initial={{
                action: 'allocate_payment',
                id,
                input: {
                  invoice_id: q.invoice_id ?? '',
                  amount: '',
                  idempotency_key: randomUUID(),
                },
              }}
              fields={[
                {
                  key: 'invoice_id',
                  label: 'Issued tax invoice',
                  options: s.allowed('invoice.view')
                    ? (
                        await s.finance.search(
                          'invoices',
                          { contract_id: contractId, status: 'issued' },
                          page,
                        )
                      ).rows
                        .filter((i) => i.invoice_type === 'tax_invoice')
                        .map((i) => ({
                          value: text(i, 'id'),
                          label: `${text(i, 'invoice_number')}  /  ${text(i, 'balance')} remaining`,
                        }))
                    : [],
                },
                { key: 'amount', label: 'Allocate amount', required: true },
              ]}
            />
          )}
          <RecordList
            entity="payment_allocations"
            rows={
              (
                await s.finance.search(
                  'payment_allocations',
                  { parent_id: id },
                  page,
                )
              ).rows
            }
          />
          {status === 'recorded' && s.allowed('payment.void') && (
            <FinanceForm
              title="Void payment and reverse allocations"
              initial={{ action: 'void_payment', id, reason: '' }}
              fields={[{ key: 'reason', label: 'Void reason', required: true }]}
            />
          )}
        </>
      )}
      {entity === 'payment_requests' &&
        status === 'issued' &&
        s.allowed('payment_request.manage') && (
          <FinanceForm
            title="Void request"
            initial={{ action: 'void_request', id, reason: '' }}
            fields={[{ key: 'reason', label: 'Reason', required: true }]}
          />
        )}
      {entity === 'change_orders' && (
        <>
          <p>{text(r, 'reason')}</p>
          <p>
            Previous contract: {text(r, 'previous_contract_value')} /
            Adjustment: {text(r, 'net_adjustment')} / Revised:{' '}
            {text(r, 'revised_contract_value')}
          </p>
          {status === 'draft' && s.allowed('change_order.manage') && (
            <Link
              className="underline"
              href={`/dashboard/finance/change_orders/new?contract_id=${contractId}&edit=${id}`}
            >
              Edit draft
            </Link>
          )}
          {status === 'draft' && s.allowed('change_order.issue') && (
            <FinanceForm
              title="Issue change order"
              initial={{
                action: 'change_order',
                input: {
                  action: 'issue',
                  contract_id: contractId,
                  id,
                  version,
                },
              }}
            />
          )}
          {status === 'issued' && s.allowed('change_order.approve') && (
            <FinanceForm
              title="Record customer approval"
              initial={{
                action: 'change_order',
                input: {
                  action: 'approve',
                  contract_id: contractId,
                  id,
                  version,
                  evidence: '',
                },
              }}
              fields={[
                {
                  key: 'evidence',
                  label: 'Customer approval evidence / reference',
                  type: 'textarea',
                  required: true,
                },
              ]}
            />
          )}
          {['draft', 'issued'].includes(status) &&
            s.allowed('change_order.manage') && (
              <FinanceForm
                title="Record decision"
                initial={{
                  action: 'change_order',
                  input: {
                    action: 'cancel',
                    contract_id: contractId,
                    id,
                    version,
                    reason: '',
                  },
                }}
                fields={[
                  {
                    key: 'action',
                    label: 'Decision',
                    options: [
                      { value: 'cancel', label: 'Cancel' },
                      ...(status === 'issued'
                        ? [{ value: 'reject', label: 'Reject' }]
                        : []),
                    ],
                  },
                  { key: 'reason', label: 'Reason', required: true },
                ]}
              />
            )}
          <RecordList entity="change_order_items" rows={items} />
        </>
      )}
      {[
        'organization_billing_settings',
        'payment_methods',
        'tax_codes',
      ].includes(entity) &&
        s.allowed('billing.manage') && (
          <Link
            className="my-4 inline-block underline"
            href={`/dashboard/finance/${entity}/new?edit=${id}`}
          >
            Edit configuration
          </Link>
        )}
    </main>
  );
}
