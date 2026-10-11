import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createGstRepository } from '@business-os/database/gst';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { GstTemplateStudio } from './template-studio';
import { DomainError } from '@business-os/shared';

export const dynamic = 'force-dynamic';
export default async function PlatformBilling() {
  const { authorization, client, repository } = await pageServices();
  let permissions: string[] = [];
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    permissions = (await authorization.requirePlatformPermission('platform.catalog.view')).permissions;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const [summary, tenants, modules, plans, templates] = await Promise.all([
    createGstRepository(client).platformSummary(),
    repository.organizationDirectory({ page: 1, pageSize: 12 }),
    repository.modules(),
    repository.plans(),
    createGstTemplatesRepository(client).platformList(),
  ]);
  const billing = modules.find((m) => m.key === 'billing');
  const planNames = new Map(plans.map((p) => [p.id, p.name]));
  const cards = [
    { label: 'Companies', value: summary.organizations },
    { label: 'Billing profiles', value: summary.configured },
    { label: 'GSTIN configured', value: summary.gstRegistered },
    { label: 'Issued invoices', value: summary.issuedInvoices },
    { label: 'Supplier bills', value: summary.purchaseBills },
  ];
  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">
        ProPulse Business OS · Invoice template management
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="os-secondary-heading">Billing &amp; Invoices</h1>
          <p className="os-secondary-subtitle">
            Create and customize reusable sales invoice and purchase bill designs,
            while monitoring GST adoption without accessing private tenant documents.
          </p>
        </div>
        <Link href="/admin/organizations" className="os-action">
          Manage companies →
        </Link>
      </div>
      <section className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((item) => (
          <div className="os-panel" key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <strong className="mt-2 block text-3xl">{item.value}</strong>
          </div>
        ))}
      </section>
      <div className="mt-8">
        <GstTemplateStudio templates={templates} canEdit={permissions.includes('platform.entitlements.manage')} />
      </div>
      <div className="os-content-grid mt-8">
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>GST document controls</h2>
          </div>
          <div className="space-y-4 text-sm leading-6">
            <div>
              <strong>Sales invoices</strong>
              <p className="text-slate-500">
                Company-issued invoices with client GSTIN, HSN/SAC, place of
                supply and IGST or CGST/SGST breakup.
              </p>
            </div>
            <div>
              <strong>Purchase bills</strong>
              <p className="text-slate-500">
                Record supplier bill numbers, taxable values and GST for
                accounting and reconciliation.
              </p>
            </div>
            <div>
              <strong>Marketplace purchases</strong>
              <p className="text-slate-500">
                An approved seller may draft an invoice from an accepted
                purchase request. The linked buyer sees the issued invoice in
                their incoming register.
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            These are GST-ready accounting documents. E-invoice IRN/QR
            registration, GST portal filing, input-credit eligibility, tax rate
            verification, online payments and automated filing are not enabled.
          </p>
        </section>
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Company access</h2>
          </div>
          <p className="os-secondary-subtitle">
            Billing visibility remains controlled by each company’s membership
            plan, enabled modules and authorized tenant roles.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="os-pill">
              Module: {billing?.name ?? 'Billing'}
            </span>
            <span className="os-pill">{billing?.status ?? 'Unavailable'}</span>
          </div>
          <p className="mt-4 text-sm">
            The Super Admin manages billing entitlements; tenant owners and
            authorized finance employees issue their own documents.
          </p>
          <Link
            href="/admin/organizations"
            className="os-action secondary mt-5"
          >
            Configure tenant billing →
          </Link>
        </section>
      </div>
      <section className="os-resource-panel mt-7">
        <div className="os-panel-heading">
          <h2>Recent company accounts</h2>
          <Link href="/admin/organizations">All companies ↗</Link>
        </div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Billing access</th>
              </tr>
            </thead>
            <tbody>
              {tenants.organizations.map((org) => (
                <tr key={org.id}>
                  <td className="font-semibold">{org.name}</td>
                  <td>
                    {org.plan_id
                      ? (planNames.get(org.plan_id) ?? 'Assigned')
                      : 'No plan'}
                  </td>
                  <td>{org.status}</td>
                  <td>
                    <Link href={'/admin/organizations/' + org.id}>
                      Manage entitlement ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tenants.organizations.length === 0 && (
          <p className="os-empty">No companies registered.</p>
        )}
      </section>
    </main>
  );
}
