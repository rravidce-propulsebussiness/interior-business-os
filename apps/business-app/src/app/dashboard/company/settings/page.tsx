import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export default async function CompanySettings() {
  const { repository } = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();

  const canView = (permission: string, moduleKey?: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  if (!canView('organization.view')) notFound();

  const company = await repository.organization(context.organizationId);
  if (!company) notFound();
  const source = await repository.propulseCompanyProfile(context.organizationId);
  const imported = z.object({
    description: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    services: z.array(z.object({industry:z.string(),service:z.string()})).optional(),
    locations: z.array(z.object({city:z.string(),state:z.string()})).optional(),
    syncedAt: z.string(),
  }).safeParse(source);
  const synced = imported.success ? imported.data : null;
  const options = [
    {
      label: 'Team and access',
      description:
        'Invite employees, give them roles, and control their permissions.',
      href: '/dashboard/company/team',
      enabled: canView('team.view') || canView('role.view'),
    },
    {
      label: 'Website studio',
      description: 'Manage your company website and publish updates.',
      href: '/dashboard/website',
      enabled: canView('website.view', 'website'),
    },
    {
      label: 'Quotation settings',
      description: 'Set your quotation brand, defaults and document rules.',
      href: '/dashboard/quotations/settings',
      enabled: canView('settings.manage', 'quotation'),
    },
    {
      label: 'GST billing profile',
      description: 'Update business billing and tax information.',
      href: '/dashboard/billing',
      enabled: canView('billing.manage', 'billing'),
    },
  ].filter((item) => item.enabled);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8"
    >
      <div className="mx-auto max-w-5xl space-y-7">
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Back to your dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-300">
            Your company only
          </p>
          <h1 className="mt-3 text-3xl font-bold">Company Settings</h1>
          <p className="mt-2 text-sm text-slate-300">
            Manage the workspace for {company.name}.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Business details</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Company name</dt>
              <dd className="mt-1 font-semibold">{company.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Workspace status</dt>
              <dd className="mt-1 font-semibold capitalize">
                {company.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Currency</dt>
              <dd className="mt-1 font-semibold">{company.default_currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Time zone</dt>
              <dd className="mt-1 font-semibold">{company.default_timezone}</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs leading-6 text-slate-500">
            Core company identity and subscriptions are administered by the
            platform. Your business tools and employee access can be managed
            below.
          </p>
        </section>
        {synced && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Imported from ProPulse</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Business details belong to the ProPulse account linked to this
                  company. Reconnect through ProPulse to refresh them.
                </p>
              </div>
              <Link href="/auth/propulse" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                Sync from ProPulse →
              </Link>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {synced.description && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Business description</dt>
                  <dd className="mt-1 text-sm text-slate-800">{synced.description}</dd>
                </div>
              )}
              {synced.phone && (
                <div>
                  <dt className="text-xs text-slate-500">Contact phone</dt>
                  <dd className="mt-1 font-semibold">{synced.phone}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Last synced</dt>
                <dd className="mt-1 text-sm">{new Date(synced.syncedAt).toLocaleString('en-IN')}</dd>
              </div>
              {Boolean(synced.services?.length) && (
                <div>
                  <dt className="text-xs text-slate-500">Services</dt>
                  <dd className="mt-1 text-sm">
                    {synced.services?.map((item) => item.service).filter(Boolean).join(', ')}
                  </dd>
                </div>
              )}
              {Boolean(synced.locations?.length) && (
                <div>
                  <dt className="text-xs text-slate-500">Service locations</dt>
                  <dd className="mt-1 text-sm">
                    {synced.locations?.map((item) => [item.city, item.state].filter(Boolean).join(', ')).join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
        <section className="grid gap-4 sm:grid-cols-2">
          {options.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300"
            >
              <h2 className="font-bold">
                {item.label} <span aria-hidden="true">↗</span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
