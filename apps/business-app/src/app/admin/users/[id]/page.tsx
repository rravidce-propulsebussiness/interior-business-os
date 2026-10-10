import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createPlatformCompaniesRepository } from '@business-os/database/platform-companies';
import { DomainError, idSchema } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import {
  updatePlatformUserStatus,
  assignPlatformUserToCompany,
} from '../../organizations/control-actions';

export const dynamic = 'force-dynamic';

const label = {
  business_owner: 'Business Owner',
  seller: 'Seller',
  general_user: 'General User',
} as const;
const input='mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600';

export default async function UserDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const {authorization,client}=await pageServices();
  let permissions:string[];
  try {
    permissions=(await authorization.requirePlatformPermission('platform.organizations.view')).permissions;
  } catch(error) {
    if(error instanceof DomainError && error.code==='FORBIDDEN') notFound();
    throw error;
  }
  const userRepo=createPlatformCompaniesRepository(client);
  let user;
  try {
    user=await userRepo.userProfile(id);
  } catch(error) {
    if(error instanceof DomainError && ['NOT_FOUND','FORBIDDEN'].includes(error.code)) notFound();
    throw error;
  }
  const canManage=permissions.includes('platform.organizations.manage');
  const canManageRoles=canManage&&permissions.includes('platform.roles.manage');
  const companies=canManageRoles ? await userRepo.userCompanyChoices():[];
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/admin/organizations" className="hover:underline">Organizations &amp; Users</Link> / {user.name}
        </nav>
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-5">
            <div className="grid size-20 shrink-0 place-items-center rounded-full bg-blue-100 text-2xl font-extrabold text-blue-700">
              {user.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-700">User profile</p>
              <h1 className="mt-1 break-words text-3xl font-extrabold">{user.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">{label[user.kind]}</span>
                <span className={`rounded-full px-3 py-1.5 ${user.status==='active'?'bg-emerald-100 text-emerald-800':user.status==='pending'?'bg-amber-100 text-amber-900':'bg-red-100 text-red-800'}`}>
                  {user.status==='suspended'?'Inactive':user.status}
                </span>
                {user.verified && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">Verified email</span>}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><p className="text-slate-500">Email</p><p className="mt-1 break-all font-semibold">{user.email}</p></div>
            <div><p className="text-slate-500">Phone</p><p className="mt-1 font-semibold">{user.phone || 'Not provided'}</p></div>
            <div><p className="text-slate-500">Account</p><p className="mt-1 font-semibold">{user.verified?'Verified':'Awaiting email verification'}</p></div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">Linked organizations</h2><p className="mt-1 text-sm text-slate-600">Company roles and permissions are managed per organization, not shared across tenants.</p></div>
            {canManage && <Link href="/admin/organizations/create" className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-blue-700">Create Organization</Link>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {user.companies.map(company=>(
              <article key={company.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-sm">{company.name}</strong>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold capitalize text-slate-700">{company.memberStatus}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{company.slug} · {company.sellerStatus==='approved'?'Seller & buyer':'Business'}</p>
                <p className="mt-3 text-xs font-bold text-blue-700">{company.isOwner?'Default full company access':company.roles.length?company.roles.join(', '):'No roles assigned'}</p>
                <Link href={'/admin/organizations/'+company.id} className="mt-4 inline-block text-xs font-bold text-blue-700 underline">Manage roles, seller &amp; company →</Link>
              </article>
            ))}
            {user.companies.length===0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                No organization attached. This is a general user until a verified company role is assigned.
              </p>
            )}
          </div>
        </section>

        {canManage && (
          <section id="manage" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Manage user</h2>
            <p className="mt-1 text-sm text-slate-600">
              These actions never grant platform Super Admin permissions. Business owners receive the full company owner role through verified company provisioning.
            </p>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold">Account status</h3>
                <p className="mt-1 text-xs text-slate-600">Suspending blocks an ordinary user. Owners and platform administrators are protected from accidental suspension.</p>
                <div className="mt-4">
                  <ActionForm action={updatePlatformUserStatus} label={user.status==='suspended'?'Reactivate User':'Update user status'}>
                    <input type="hidden" name="userId" value={id}/>
                    <label className="block text-sm font-semibold">Action
                      <select className={input} name="status" defaultValue={user.status==='suspended'?'active':'suspended'}>
                        <option value="active">Activate</option>
                        <option value="suspended">Suspend</option>
                      </select>
                    </label>
                  </ActionForm>
                </div>
              </div>
              {canManageRoles && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Assign to an existing company</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Only verified users can be assigned. Owner role cannot be granted through this employee assignment.
                  </p>
                  <div className="mt-4">
                    <ActionForm action={assignPlatformUserToCompany} label="Assign employee role">
                      <input type="hidden" name="userId" value={id}/>
                      <label className="block text-sm font-semibold">Company and role
                        <select name="assignment" className={input} required defaultValue="">
                          <option value="" disabled>Choose company / non-owner role</option>
                          {companies.flatMap(company=>company.roles.map(role=>(
                            <option key={company.organizationId+':'+role.id} value={company.organizationId+':'+role.id}>
                              {company.organizationName} · {role.name}
                            </option>
                          )))}
                        </select>
                      </label>
                    </ActionForm>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
