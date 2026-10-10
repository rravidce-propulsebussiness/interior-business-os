import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createPlatformCompaniesRepository } from '@business-os/database/platform-companies';
import { DomainError, idSchema } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { changeEntitlement, changeOrganization } from '../../actions';
import {
  enablePlatformSeller, updateCompanySeller, updateCompanyIndustry, updateCompanyRole,
} from '../control-actions';

export const dynamic = 'force-dynamic';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600';

export default async function OrganizationDetail({
  params,searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { authorization, repository, client } = await pageServices();
  if (!idSchema.safeParse(id).success) notFound();
  let permissions: string[];
  try {
    permissions = (await authorization.requirePlatformPermission('platform.organizations.view')).permissions;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const canManage = permissions.includes('platform.organizations.manage');
  const canManageRoles = canManage && permissions.includes('platform.roles.manage');
  const canSeeEntitlements = permissions.includes('platform.entitlements.view');
  const canManageEntitlements = permissions.includes('platform.entitlements.manage');
  let organization;
  try {
    organization = await repository.organization(id);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const companies = createPlatformCompaniesRepository(client);
  const [company, industries, plans, modules, mappings, entitlements] = await Promise.all([
    companies.profile(id),
    repository.industries(),
    repository.plans(),
    canSeeEntitlements ? repository.modules() : Promise.resolve([]),
    canSeeEntitlements ? repository.planModules() : Promise.resolve([]),
    canSeeEntitlements ? repository.entitlements(id) : Promise.resolve([]),
  ]);
  const selectedIndustries = new Set(company.industries.map((item) => item.id));
  const plan = plans.find((item) => item.id === organization.plan_id);
  const currentModules = modules
    .filter((m) => mappings.some((pm) => pm.plan_id === organization.plan_id && pm.module_id === m.id))
    .map((item) => item.name);
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/admin" className="hover:underline">Dashboard</Link> /{' '}
          <Link href="/admin/organizations" className="hover:underline">Companies</Link> / {organization.name}
        </nav>
        <header className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-lg sm:px-9">
          <p className="text-xs font-semibold uppercase tracking-[.19em] text-teal-300">Company control centre</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
            <div><h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
              <p className="mt-3 text-sm text-slate-300">{organization.slug} · {organization.country_code} · {organization.default_currency} · {organization.default_timezone}</p>
              <p className="mt-2 text-sm text-slate-300">Owner account: {company.ownerEmail ?? 'Unavailable'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold capitalize">{organization.status}</span>
              <span className="rounded-full bg-teal-300 px-4 py-2 text-xs font-semibold text-slate-950">{company.seller?.status === 'approved' ? 'Seller + buyer' : company.seller ? 'Seller ' + company.seller.status : 'Business buyer'}</span>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {company.industries.map((item) => <span key={item.id} className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-100">{item.name}</span>)}
            <span className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-100">Plan: {plan?.name ?? 'Unassigned'}</span>
            <span className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-100">{company.members.filter((m) => m.status === 'active').length} active people</span>
          </div>
        </header>
        {created === '1' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Company workspace created with verified owner, roles, industries and seller status, if requested.</p>}

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Company classification</p>
              <h2 className="mt-1 text-xl font-semibold">Industries &amp; services</h2>
            </div><Link href="/admin/control/marketplace" className="text-sm font-semibold text-blue-700 hover:underline">Manage industry registry ↗</Link></div>
            <p className="mt-3 text-sm leading-6 text-slate-600">A business can operate in multiple industries. Adding an industry enables that company classification; removing one is blocked if it has published seller listings.</p>
            <div className="mt-4 divide-y divide-slate-100">
              {industries.map((industry) => {
                const active = selectedIndustries.has(industry.id);
                return <div key={industry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><strong className="text-sm">{industry.name}</strong><p className="text-xs text-slate-500">{active ? 'Enabled for company' : 'Not enabled'}</p></div>
                  {canManage ? <ActionForm action={updateCompanyIndustry} label={active ? 'Remove industry' : 'Enable industry'}>
                    <input type="hidden" name="organizationId" value={id}/>
                    <input type="hidden" name="industryId" value={industry.id}/>
                    <input type="hidden" name="enabled" value={active ? 'false' : 'true'}/>
                  </ActionForm> : <span className="text-xs text-slate-600">{active ? 'Enabled' : 'Not enabled'}</span>}
                </div>;
              })}
            </div>
            {industries.length === 0 && <p className="mt-4 text-sm text-slate-600">No industries available. Add one in Marketplace settings.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">B2B commerce</p>
            <h2 className="mt-1 text-xl font-semibold">Seller account</h2>
            {company.seller ? <>
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="font-semibold">{company.seller.name}</p>
                <p className="mt-1 text-sm capitalize text-slate-600">Storefront status: {company.seller.status}</p>
              </div>
              {canManage && <div className="mt-4 flex flex-wrap gap-3">
                {company.seller.status !== 'approved' && (
                  <ActionForm action={updateCompanySeller} label="Approve seller">
                    <input type="hidden" name="organizationId" value={id}/><input type="hidden" name="sellerId" value={company.seller.id}/>
                    <input type="hidden" name="action" value="approve"/>
                  </ActionForm>
                )}
                {company.seller.status === 'approved' && (
                  <ActionForm action={updateCompanySeller} label="Suspend seller">
                    <input type="hidden" name="organizationId" value={id}/><input type="hidden" name="sellerId" value={company.seller.id}/>
                    <input type="hidden" name="action" value="suspend"/>
                  </ActionForm>
                )}
                {company.seller.status === 'pending' && (
                  <ActionForm action={updateCompanySeller} label="Reject application">
                    <input type="hidden" name="organizationId" value={id}/><input type="hidden" name="sellerId" value={company.seller.id}/>
                    <input type="hidden" name="action" value="reject"/>
                  </ActionForm>
                )}
              </div>}
            </> : <>
              <p className="mt-3 text-sm leading-6 text-slate-600">This business does not have a supplier storefront. Enable selling to give its owner a seller catalog and incoming orders.</p>
              {canManage && <div className="mt-5">
                <ActionForm action={enablePlatformSeller} label="Create seller account">
                  <input type="hidden" name="organizationId" value={id}/>
                  <label className="grid gap-2 text-sm font-medium">Seller storefront name
                    <input required name="storeName" minLength={2} maxLength={150} defaultValue={organization.name} className={field}/>
                  </label>
                </ActionForm>
              </div>}
            </>}
            <p className="mt-5 text-xs leading-5 text-slate-500">Seller approval controls marketplace publishing, not payment onboarding or legal verification. A verified existing company owner is required.</p>
            <Link href="/admin/control/marketplace" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">Open marketplace administration →</Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Team management</p><h2 className="mt-1 text-xl font-semibold">Members &amp; company roles</h2></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{company.members.length} people · {company.roles.length} roles</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">Roles belong to this company, not to another tenant. Platform changes are audited and removing the final Owner role is blocked. Industry membership is managed independently above.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {company.members.map((member) => {
                const assigned = company.roles.filter((role) => member.roleIds.includes(role.id));
                return <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold break-all">{member.email}</h3>
                  <p className="mt-1 text-xs capitalize text-slate-500">{member.status}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {assigned.length ? assigned.map((role) => <span key={role.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">{role.name}</span>) : <span className="text-xs text-slate-500">No organization-wide roles assigned</span>}
                  </div>
                  {canManageRoles && member.status === 'active' && (
                    <div className="mt-4">
                      <ActionForm action={updateCompanyRole} label="Save member role">
                        <input type="hidden" name="organizationId" value={id}/>
                        <input type="hidden" name="membershipId" value={member.id}/>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1.5 text-xs font-medium">Role
                            <select className={field} name="roleId">
                              {company.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select></label>
                          <label className="grid gap-1.5 text-xs font-medium">Action
                            <select name="remove" className={field}><option value="false">Assign role</option><option value="true">Remove role</option></select></label>
                        </div>
                      </ActionForm>
                    </div>
                  )}
                </article>;
              })}
            </div>
            {company.members.length === 0 && <p className="mt-3 text-sm text-slate-500">No company memberships found.</p>}
            <p className="mt-4 text-xs text-slate-500">To invite new employees, the company owner uses its secure team invitation workflow. Platform access does not impersonate tenant users.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Subscription governance</p>
            <h2 className="mt-1 text-xl font-semibold">Company status &amp; plan</h2>
            <p className="mt-3 text-sm text-slate-600">Current plan: <strong>{plan?.name ?? 'Unassigned'}</strong></p>
            {canManage && (
              <div className="mt-5">
                <ActionForm action={changeOrganization} label="Save company settings">
                  <input type="hidden" name="organizationId" value={id}/>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm">Company status
                      <select name="status" defaultValue={organization.status} className={field}>
                        {['active','trial','suspended','archived'].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select></label>
                    <label className="grid gap-2 text-sm">Subscription plan
                      <select name="planId" defaultValue={organization.plan_id ?? ''} className={field}>
                        <option value="">No plan</option>
                        {plans.filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select></label>
                  </div>
                </ActionForm>
              </div>
            )}
            {canSeeEntitlements && <p className="mt-5 text-xs text-slate-500">Plan modules: {currentModules.join(', ') || 'No modules included'}</p>}
          </section>

          {canSeeEntitlements && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Modules &amp; permissions</p>
            <h2 className="mt-1 text-xl font-semibold">Entitlement overrides</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {entitlements.map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                {modules.find((module) => module.id === item.module_id)?.name ?? 'Module'} · {item.enabled ? 'Enabled' : 'Disabled'} ({item.source})
              </span>)}
            </div>
            {entitlements.length === 0 && <p className="mt-3 text-sm text-slate-500">No manual overrides.</p>}
            {canManageEntitlements && <div className="mt-5"><ActionForm action={changeEntitlement} label="Save module override">
              <input type="hidden" name="organizationId" value={id}/>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">Module
                  <select name="moduleKey" className={field}>{modules.map((m) => <option key={m.id} value={m.key}>{m.name}</option>)}</select></label>
                <label className="grid gap-2 text-sm">Access
                  <select name="enabled" className={field}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
              </div>
            </ActionForm></div>}
          </section>}
        </div>
      </div>
    </main>
  );
}
