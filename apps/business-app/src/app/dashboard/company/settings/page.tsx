import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';

export const dynamic = 'force-dynamic';

export default async function CompanySettings() {
  const { repository, client } = await pageServices();
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
  // Read only this tenant's linked ProPulse company, checked again in the RPC.
  const { data: rawLinked } = await client.rpc('propulse_company_link_mine', {
    p_organization_id: context.organizationId,
  });
  const linked =
    rawLinked && typeof rawLinked === 'object' && !Array.isArray(rawLinked) &&
    typeof rawLinked.name === 'string'
      ? rawLinked
      : null;
  const services = linked && Array.isArray(linked.services)
    ? linked.services
        .filter((value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
        )
        .map((value) => String(value.service ?? '').slice(0, 100))
        .filter(Boolean)
    : [];
  const locations = linked && Array.isArray(linked.locations)
    ? linked.locations
        .filter((value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
        )
        .map((value) => [value.city, value.state].filter(
          (name): name is string => typeof name === 'string' && !!name,
        ).join(', '))
        .filter(Boolean)
    : [];
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
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">ProPulse company connection</h2>
              <p className="mt-1 text-sm text-slate-600">
                Verified business details update on each ProPulse sign-in.
              </p>
            </div>
            <Link href="/auth/propulse" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
              {linked ? 'Refresh from ProPulse' : 'Connect ProPulse business'}
            </Link>
          </div>
          {linked ? (
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Company</dt><dd className="font-semibold">{String(linked.name)}</dd></div>
              <div><dt className="text-slate-500">Phone</dt><dd>{String(linked.phone || 'Not supplied')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Description</dt><dd className="mt-1 whitespace-pre-wrap">{String(linked.description || 'Not supplied')}</dd></div>
              <div><dt className="text-slate-500">Services</dt><dd>{services.join(', ') || 'Not supplied'}</dd></div>
              <div><dt className="text-slate-500">Locations</dt><dd>{locations.join(' · ') || 'Not supplied'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Last imported</dt><dd>{typeof linked.syncedAt === 'string' ? linked.syncedAt.slice(0, 19).replace('T', ' ') + ' UTC' : '—'}</dd></div>
            </dl>
          ) : (
            <p className="mt-5 text-sm text-slate-600">
              Connect the ProPulse account that owns your registered business.
              Ordinary user accounts do not receive Owner access automatically.
            </p>
          )}
        </section>
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
