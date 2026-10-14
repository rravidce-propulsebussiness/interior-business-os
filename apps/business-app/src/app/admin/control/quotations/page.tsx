import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { AdminSpecTemplateEditor } from './template-editor';

export const dynamic = 'force-dynamic';

export default async function AdminQuotationGovernance() {
  // The platform role configures entitlements, never creates or reads
  // another company's private quotation or invoice documents.
  const { authorization, client } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const defaults =
    await createConstructionPackagesRepository(client).template();
  return (
    <main id="main-content" className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div className="rounded-3xl bg-slate-950 px-7 py-9 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-300">
          ProPulse · Platform governance
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">
          Quotation module configuration
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Super Admin manages which companies can access quotations, catalog and
          pricing. Client quotations and invoices are created only inside each
          business workspace.
        </p>
      </div>
      <AdminSpecTemplateEditor initial={defaults} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase text-blue-700">
            1 · Platform administration
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Manage company access
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Enable or disable quotation, catalog and pricing modules and
            configure role permissions for each subscribed company. No customer
            billing documents are exposed here.
          </p>
          <Link
            href="/admin/organizations"
            className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white"
          >
            Manage organizations →
          </Link>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase text-blue-700">
            2 · Business owner workspace
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Company-specific customization
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Owners configure their company quotation code, branding, package
            rates, catalog, material and brand dropdowns. Only authorized
            company users generate and issue quotations.
          </p>
          <p className="mt-4 text-xs font-semibold text-slate-500">
            Two quotation modes: fixed package price per built-up sq ft, or
            customized material-wise pricing.
          </p>
        </section>
      </div>
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
        <strong>Separation of duties:</strong> Platform Super Admin does not
        create customer quotations, purchase bills or sales invoices. Those
        workflows belong to the authenticated business owner and their
        authorized employees. All issued quotation versions remain immutable.
      </section>
    </main>
  );
}
