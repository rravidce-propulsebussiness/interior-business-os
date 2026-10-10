import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createPlatformCompaniesRepository } from '@business-os/database/platform-companies';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { createPlatformCompany } from './control-actions';

export const dynamic = 'force-dynamic';
const statuses = ['active', 'trial', 'suspended', 'archived'] as const;
const kinds = [
  { key: 'all', label: 'All companies' },
  { key: 'seller', label: 'Approved sellers' },
  { key: 'business', label: 'Business owners' },
  { key: 'pending', label: 'Seller applications' },
] as const;

type DirectoryParams = {
  q?: string | string[];
  status?: string | string[];
  industry?: string | string[];
  kind?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : (value?.[0] ?? '');
}
function directoryHref(
  filters: { q: string; status: string; industry: string; kind: string },
  page: number,
) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.industry) params.set('industry', filters.industry);
  if (filters.kind !== 'all') params.set('kind', filters.kind);
  if (page > 1) params.set('page', String(page));
  return '/admin/organizations' + (params.size ? '?' + params.toString() : '');
}
const field =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-sky-600';

export default async function OrganizationsDirectory({
  searchParams,
}: {
  searchParams: Promise<DirectoryParams>;
}) {
  const { authorization, repository, client } = await pageServices();
  let permissions: string[];
  try {
    permissions = (
      await authorization.requirePlatformPermission(
        'platform.organizations.view',
      )
    ).permissions;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const params = await searchParams;
  const q = single(params.q)
    .trim()
    .replace(/[\\%_]/g, '')
    .slice(0, 80);
  const statusValue = single(params.status);
  const status = statuses.includes(statusValue as (typeof statuses)[number])
    ? statusValue
    : '';
  const industryValue = single(params.industry);
  const kindValue = single(params.kind);
  const kind = kinds.some((item) => item.key === kindValue) ? kindValue : 'all';
  const requestedPage = Number(single(params.page) || '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;
  const industries = await repository.industries();
  const industry = industries.some((item) => item.id === industryValue)
    ? industryValue
    : '';
  const filters = { q, status, industry, kind };
  const companies = createPlatformCompaniesRepository(client);
  const result = await companies.directory({
    query: q,
    ...(status ? { status } : {}),
    ...(industry ? { industryId: industry } : {}),
    kind,
    page,
  });
  const first = result.total === 0 ? 0 : (page - 1) * 20 + 1;
  const last = Math.min(page * 20, result.total);
  const canManage = permissions.includes('platform.organizations.manage');
  const plans = canManage ? await repository.plans() : [];

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/admin" className="hover:underline">
            Dashboard
          </Link>{' '}
          / Companies
        </nav>
        <header className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-lg sm:px-9">
          <p className="text-xs font-semibold uppercase tracking-[.19em] text-teal-300">
            Super Admin · Company management
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Companies &amp; sellers
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                One company account for buyers and suppliers. Manage active
                industries, seller approval, subscriptions and team roles from a
                single control centre.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/applications"
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Review applications ↗
              </Link>
              <Link
                href="/admin/control/marketplace"
                className="rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-200"
              >
                Marketplace ↗
              </Link>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Matching companies</p>
              <strong className="mt-2 block text-3xl">{result.total}</strong>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Active industries</p>
              <strong className="mt-2 block text-3xl">
                {industries.length}
              </strong>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/15 bg-white/5 p-4 sm:col-span-1">
              <p className="text-xs text-slate-300">Company types</p>
              <strong className="mt-2 block text-base">
                Buyer · Supplier · Both
              </strong>
            </div>
          </div>
        </header>

        {canManage && (
          <details className="group rounded-2xl border border-teal-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                ＋ Create a business or seller company
              </span>
              <span className="ml-3 text-xs font-normal text-slate-500">
                Existing verified owner email required
              </span>
            </summary>
            <div className="border-t border-slate-100 px-6 pb-6 pt-5">
              <p className="mb-5 max-w-3xl text-sm text-slate-600">
                The owner must first sign up and verify their email. Creating a
                company provisions its owner role, tenant permissions, plan and
                selected industries. Enabling seller creates an approved
                storefront as well. It never creates a password or sends login
                credentials.
              </p>
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
                        <input
                          type="checkbox"
                          name="industries"
                          value={item.key}
                        />
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
            </div>
          </details>
        )}

        <section
          aria-label="Company filters"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <form
            method="get"
            action="/admin/organizations"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="grid gap-2 text-sm font-medium lg:col-span-2">
              Search companies
              <input
                type="search"
                name="q"
                maxLength={80}
                defaultValue={q}
                placeholder="Name or URL slug"
                className={field}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Company type
              <select name="kind" defaultValue={kind} className={field}>
                {kinds.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Industry
              <select name="industry" defaultValue={industry} className={field}>
                <option value="">All industries</option>
                {industries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Status
              <select name="status" defaultValue={status} className={field}>
                <option value="">Any status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-5">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply filters
              </button>
              <Link
                href="/admin/organizations"
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-100"
              >
                Clear
              </Link>
            </div>
          </form>
        </section>

        <section aria-label="Company results">
          <div className="mb-4 flex flex-wrap justify-between gap-2">
            <h2 className="text-xl font-semibold">Company directory</h2>
            <p className="text-sm text-slate-600">
              Showing {first}–{last} of {result.total}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.rows.map((item) => (
              <article
                key={item.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold break-words">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.slug} · {item.country}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">
                    {item.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span
                    className={
                      'rounded-full px-3 py-1 text-xs font-semibold ' +
                      (item.sellerStatus === 'approved'
                        ? 'bg-emerald-50 text-emerald-800'
                        : item.sellerStatus === 'pending'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-sky-50 text-sky-800')
                    }
                  >
                    {item.sellerStatus === 'approved'
                      ? 'Seller + buyer'
                      : item.sellerStatus === 'pending'
                        ? 'Seller review pending'
                        : item.sellerStatus
                          ? 'Seller ' + item.sellerStatus
                          : 'Business buyer'}
                  </span>
                  {item.industries.map((industry) => (
                    <span
                      key={industry.id}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs"
                    >
                      {industry.name}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {item.memberCount} active team members ·{' '}
                  {item.planId ? 'Plan active' : 'No plan'}
                </p>
                <Link
                  href={'/admin/organizations/' + item.id}
                  className="mt-auto inline-flex items-center pt-5 text-sm font-semibold text-blue-700 hover:underline"
                >
                  Manage company, seller &amp; roles →
                </Link>
              </article>
            ))}
          </div>
          {result.rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <h3 className="font-semibold">No matching companies</h3>
              <p className="mt-2 text-sm text-slate-600">
                Change the filters or create your first company above.
              </p>
            </div>
          )}
        </section>
        <nav
          className="flex justify-between gap-4 pb-6 text-sm font-semibold"
          aria-label="Company pagination"
        >
          {page > 1 ? (
            <Link
              className="rounded-xl border border-slate-300 bg-white px-5 py-3"
              href={directoryHref(filters, page - 1)}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="self-center text-slate-600">Page {page}</span>
          {page * 20 < result.total ? (
            <Link
              className="rounded-xl border border-slate-300 bg-white px-5 py-3"
              href={directoryHref(filters, page + 1)}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}
