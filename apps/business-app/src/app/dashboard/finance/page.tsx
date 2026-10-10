import Link from 'next/link';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { financePermissions } from '@business-os/core/finance';
import { createFinanceRepository } from '@business-os/database/finance';
import { DomainError } from '@business-os/shared';
import { Metrics, titles } from './presentation';
export default async function Finance() {
  const s = await pageServices();
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const allowed = (permission: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      moduleKey: 'billing',
    }) &&
    ((!permission.startsWith('contract.') &&
      !permission.startsWith('change_order.')) ||
      context.entitlements.includes('projects'));
  const entities = (
    [
      'contracts',
      'payment_schedules',
      'payment_requests',
      'invoices',
      'payments',
      'receipts',
      'change_orders',
      'organization_billing_settings',
      'payment_methods',
      'tax_codes',
    ] as const
  ).filter((e) => allowed(financePermissions[e]));
  if (!entities.length && !allowed('financial_report.view'))
    throw new DomainError('FORBIDDEN');
  const metrics = allowed('financial_report.view')
    ? await createFinanceRepository(s.client, context.organizationId).summary()
    : [];
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">Finance &amp; billing</h1>
      <section className="my-5 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-slate-900">
        <h2 className="text-xl font-semibold">Everyday GST-ready invoices &amp; supplier bills</h2>
        <p className="mt-2 text-sm leading-6">Create standalone sales invoices, record supplier bills and access incoming marketplace invoices without requiring a project contract.</p>
        <Link href="/dashboard/billing" className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Open invoices &amp; bills →</Link>
      </section>
      <p className="my-3">
        Accepted scope, billing milestones, offline collections and approved
        variations.
      </p>
      <div className="my-6 grid gap-4 sm:grid-cols-3">
        {entities.map((e) => (
          <Link
            className="rounded border p-5 underline"
            key={e}
            href={`/dashboard/finance/${e}`}
          >
            {titles[e]}
          </Link>
        ))}
      </div>
      <Metrics data={metrics} />
    </main>
  );
}
