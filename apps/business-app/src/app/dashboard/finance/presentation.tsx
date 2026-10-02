import Link from 'next/link';
export const titles: Record<string, string> = {
  contracts: 'Contracts',
  payment_schedules: 'Payment schedules',
  payment_schedule_items: 'Milestones',
  payment_requests: 'Payment requests',
  invoices: 'Invoices and proformas',
  payments: 'Payments',
  payment_allocations: 'Allocations',
  receipts: 'Receipts',
  change_orders: 'Change orders',
  payment_methods: 'Payment methods',
  tax_codes: 'Tax codes',
  organization_billing_settings: 'Billing settings',
};
export const text = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === 'string'
    ? row[key]
    : typeof row[key] === 'number'
      ? String(row[key])
      : '';
export function RecordList({
  entity,
  rows,
}: {
  entity: string;
  rows: Record<string, unknown>[];
}) {
  if (!rows.length)
    return <p className="my-4 text-muted-foreground">No matching records.</p>;
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="p-3">Reference</th>
            <th className="p-3">Customer / description</th>
            <th className="p-3">Status</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Balance / unallocated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr className="border-t" key={text(r, 'id')}>
              <td className="p-3">
                <Link
                  className="underline"
                  href={`/dashboard/finance/${entity}/${text(r, 'id')}`}
                >
                  {text(r, 'contract_number') ||
                    text(r, 'invoice_number') ||
                    text(r, 'payment_number') ||
                    text(r, 'receipt_number') ||
                    text(r, 'change_order_number') ||
                    text(r, 'request_number') ||
                    text(r, 'label') ||
                    text(r, 'name') ||
                    text(r, 'code') ||
                    'Draft / details'}
                </Link>
              </td>
              <td className="p-3">
                {text(r, 'customer_name') ||
                  text(r, 'description') ||
                  text(r, 'reason')}
              </td>
              <td className="p-3">
                {text(r, 'effective_status') || text(r, 'status')}
              </td>
              <td className="p-3">
                {text(r, 'currency')}{' '}
                {text(r, 'current_contract_value') ||
                  text(r, 'total') ||
                  text(r, 'amount') ||
                  text(r, 'net_adjustment') ||
                  text(r, 'expected_amount')}
              </td>
              <td className="p-3">
                {text(r, 'balance') || text(r, 'unallocated_amount')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Metrics({ data }: { data: unknown }) {
  if (!Array.isArray(data)) return null;
  const labels: Record<string, string> = {
    original_contract_value: 'Original contract',
    approved_change_order_value: 'Approved changes',
    current_contract_value: 'Current contract',
    invoiced_amount: 'Invoiced (tax invoices)',
    paid_amount: 'Collected',
    outstanding_invoices: 'Outstanding invoices',
    unallocated_advance: 'Unallocated advance',
    unbilled_contract_value: 'Remaining unbilled',
    overdue: 'Overdue invoices',
    payments_this_month: 'Collected this month',
    schedule_unallocated: 'Unallocated schedule balance',
  };
  return (
    <>
      {data.map((item: Record<string, unknown>, index: number) => (
        <section className="my-6" key={index}>
          <h2 className="text-xl">
            Financial summary / {text(item, 'currency')}
          </h2>
          <dl className="my-3 grid gap-3 sm:grid-cols-3">
            {Object.entries(labels).map(([key, label]) => (
              <div className="rounded border p-3" key={key}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl">{text(item, key)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            Negative unbilled or schedule balances indicate a deduction that
            needs commercial reconciliation. Refunds and credit notes are
            separate workflows.
          </p>
        </section>
      ))}
    </>
  );
}
