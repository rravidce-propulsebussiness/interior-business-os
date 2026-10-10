import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { createPlatformCompany } from '../control-actions';

export const dynamic = 'force-dynamic';
const field =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-blue-600';

export default async function CreateOrganization() {
  const { authorization, repository } = await pageServices();
  try {
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const [industries, plans] = await Promise.all([
    repository.industries(),
    repository.plans(),
  ]);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 p-5 text-slate-950 sm:p-8"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/admin/organizations" className="hover:underline">
            Organizations &amp; Users
          </Link>{' '}
          / Create Organization
        </nav>
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            Super Admin · New organization
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Create Organization</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Create a business owner, seller, or both within one company account.
            An existing verified email is required as owner. The owner role is
            provisioned with full company permissions automatically; module
            subscriptions still apply.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <ActionForm action={createPlatformCompany} label="Create company">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Company name
                <input
                  required
                  name="name"
                  minLength={2}
                  maxLength={200}
                  placeholder="Example Business Pvt Ltd"
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Company URL slug
                <input
                  required
                  name="slug"
                  maxLength={80}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="example-business"
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Verified owner email
                <input
                  required
                  name="ownerEmail"
                  type="email"
                  maxLength={254}
                  placeholder="owner@example.com"
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Legal name (optional)
                <input name="legalName" maxLength={200} className={field} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Plan
                <select name="planId" className={field}>
                  <option value="">Platform default</option>
                  {plans
                    .filter((item) => item.status === 'active')
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Country code
                <input
                  required
                  name="country"
                  maxLength={2}
                  defaultValue="IN"
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Currency code
                <input
                  required
                  name="currency"
                  maxLength={3}
                  defaultValue="INR"
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Time zone
                <input
                  required
                  name="timezone"
                  defaultValue="Asia/Kolkata"
                  maxLength={100}
                  className={field}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Storefront name (seller only)
                <input
                  name="storeName"
                  maxLength={150}
                  placeholder="Defaults to company name"
                  className={field}
                />
              </label>
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">
                Industries (select one or more)
              </legend>
              <div className="mt-3 flex flex-wrap gap-3">
                {industries.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                  >
                    <input type="checkbox" name="industries" value={item.key} />
                    {item.name}
                  </label>
                ))}
              </div>
              {industries.length === 0 && (
                <p className="mt-2 text-sm text-amber-700">
                  Add an active industry from Marketplace settings first.
                </p>
              )}
            </fieldset>
            <label className="mt-5 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="seller" value="true" /> Create an
              approved seller storefront for this company
            </label>
          </ActionForm>
        </section>
        <p className="text-sm text-slate-600">
          Need an account first?{' '}
          <Link
            href="/admin/users/create"
            className="font-semibold text-blue-700 underline"
          >
            Create User →
          </Link>
        </p>
      </div>
    </main>
  );
}
