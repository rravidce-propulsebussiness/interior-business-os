import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import {
  createPlatformCompaniesRepository,
  type PlatformUser,
} from '@business-os/database/platform-companies';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../dashboard-shell';

export const dynamic = 'force-dynamic';

const statusValues = ['active', 'pending', 'suspended'] as const;
const kinds = [
  { key: 'all', label: 'All' },
  { key: 'business_owner', label: 'Business Owners' },
  { key: 'seller', label: 'Sellers' },
] as const;

type DirectoryParams = {
  q?: string | string[];
  kind?: string | string[];
  status?: string | string[];
  industry?: string | string[];
  page?: string | string[];
  sort?: string | string[];
};
function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : (v?.[0] ?? '');
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x.charAt(0).toUpperCase())
      .join('') || 'U'
  );
}
function searchHref(
  filter: {
    q: string;
    kind: string;
    status: string;
    industry: string;
    sort: string;
  },
  overrides: Partial<{ kind: string; page: number }> = {},
) {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.status) params.set('status', filter.status);
  if (filter.industry) params.set('industry', filter.industry);
  if (filter.sort !== 'newest') params.set('sort', filter.sort);
  const kind = overrides.kind ?? filter.kind;
  if (kind !== 'all') params.set('kind', kind);
  if ((overrides.page ?? 1) > 1) params.set('page', String(overrides.page));
  return '/admin/organizations' + (params.size ? '?' + params.toString() : '');
}
const inputClass =
  'h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const countCard =
  'rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 sm:p-5';
const roleLabel = {
  business_owner: 'Business Owner',
  seller: 'Seller',
  general_user: 'Legacy account',
} as const;
const kindColor = {
  business_owner: 'bg-blue-100 text-blue-700',
  seller: 'bg-violet-100 text-violet-700',
  general_user: 'bg-slate-100 text-slate-700',
} as const;
function UserCard({
  user,
  canManage,
}: {
  user: PlatformUser;
  canManage: boolean;
}) {
  const company =
    user.companies.find((c) => c.memberStatus === 'active') ??
    user.companies[0];
  const owner = user.companies.some(
    (c) => c.isOwner && c.memberStatus === 'active',
  );
  const roles = company?.roles ?? [];
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`grid size-14 shrink-0 place-items-center rounded-full text-lg font-bold ${user.kind === 'seller' ? 'bg-violet-100 text-violet-700' : user.kind === 'general_user' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}
          aria-label={user.name + ' avatar'}
        >
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3
              className="truncate text-sm font-bold text-slate-950"
              title={user.name}
            >
              {user.name}
            </h3>
            {owner && (
              <span className="text-amber-500" title="Company owner">
                ♛
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${kindColor[user.kind]}`}
            >
              {roleLabel[user.kind]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : user.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}
            >
              {user.status === 'suspended'
                ? 'Inactive'
                : user.status === 'pending'
                  ? 'Pending'
                  : 'Active'}
            </span>
          </div>
        </div>
        <Link
          href={'/admin/users/' + user.id}
          aria-label={'Open ' + user.name + ' details'}
          className="rounded-lg px-1.5 text-xl leading-6 text-slate-500 hover:bg-slate-100"
        >
          ⋮
        </Link>
      </div>
      <div className="mt-4 min-w-0 space-y-2.5 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="text-base leading-4">
            ▣
          </span>
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-slate-900"
              title={company?.name ?? 'Not linked'}
            >
              {company?.name ?? 'No company linked'}
            </p>
            <p className="mt-1 truncate text-slate-500">
              {company?.industries.join(' · ') || 'General account'}
            </p>
          </div>
        </div>
        <p className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">✉</span>
          <span className="truncate" title={user.email}>
            {user.email}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true">⌕</span>
          {user.phone || 'Phone not added'}
        </p>
      </div>
      <div
        className={`mt-4 rounded-xl px-3 py-2.5 text-xs ${owner ? 'bg-blue-50 text-blue-800' : user.kind === 'seller' ? 'bg-violet-50 text-violet-800' : 'bg-orange-50 text-orange-800'}`}
      >
        <div className="flex items-start gap-2">
          <OsIcon name={owner ? 'crown' : 'users'} size={19} />
          <div className="min-w-0">
            <p className="font-bold">
              {owner ? 'Full owner access' : 'Linked company access'}
            </p>
            <p className="mt-0.5 line-clamp-2 opacity-80">
              {owner
                ? 'Owner controls company permissions, subject to subscribed modules'
                : roles.join(', ')}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <Link
          href={'/admin/users/' + user.id}
          className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl bg-blue-600 px-2 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
        >
          View Details
        </Link>
        {canManage && (
          <Link
            href={
              company
                ? '/admin/organizations/' + company.id
                : '/admin/users/' + user.id
            }
            className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Manage company
          </Link>
        )}

      </div>
    </article>
  );
}
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
  const q = one(params.q)
    .trim()
    .replace(/[\\%_]/g, '')
    .slice(0, 80);
  const selectedKind = one(params.kind);
  const kind = kinds.some((x) => x.key === selectedKind) ? selectedKind : 'all';
  const selectedStatus = one(params.status);
  const status = statusValues.includes(
    selectedStatus as (typeof statusValues)[number],
  )
    ? selectedStatus
    : '';
  const selectedSort = one(params.sort);
  const sort = ['newest', 'oldest', 'name'].includes(selectedSort)
    ? selectedSort
    : 'newest';
  const industries = await repository.industries();
  const selectedIndustry = one(params.industry);
  const industry = industries.some((i) => i.id === selectedIndustry)
    ? selectedIndustry
    : '';
  const rawPage = Number(one(params.page) || '1');
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
  const companyRepository = createPlatformCompaniesRepository(client);
  const result = await companyRepository.ownerDirectory({
    query: q,
    kind,
    status,
    sort,
    ...(industry ? { industryId: industry } : {}),
    page,
  });
  const canManage = permissions.includes('platform.organizations.manage');
  const filters = { q, kind, status, industry, sort };
  const stats = result.stats;
  const first = result.total === 0 ? 0 : (page - 1) * 20 + 1;
  const last = Math.min(page * 20, result.total);
  const tabCount = {
    all: stats.totalUsers,
    business_owner: stats.businessOwners,
    seller: stats.sellers,
  };
  const metrics = [
    {
      label: 'Total Organizations',
      value: stats.organizations,
      theme: 'border-blue-100 bg-blue-50 text-blue-700',
      icon: '▦',
    },
    {
      label: 'Business Owners',
      value: stats.businessOwners,
      theme: 'border-teal-100 bg-teal-50 text-teal-700',
      icon: '♙',
    },
    {
      label: 'Sellers',
      value: stats.sellers,
      theme: 'border-violet-100 bg-violet-50 text-violet-700',
      icon: '◇',
    },
    {
      label: 'Active Owners',
      value: stats.activeUsers,
      theme: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      icon: '✓',
    },
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-4 py-7 text-slate-950 sm:px-6 xl:px-8"
    >
      <div className="mx-auto max-w-[1480px] space-y-6">
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <Link href="/admin" className="hover:text-blue-700 hover:underline">
            Dashboard
          </Link>{' '}
          / Organizations &amp; Users
        </nav>
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Organizations &amp; Owners
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1.5 text-xs font-semibold text-teal-800">
                <OsIcon name="crown" size={15} /> Super Admin
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage company owners, subscriptions and approved sellers in one
              place. Employees are managed by each business owner.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/admin/organizations/create"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-blue-700 shadow-sm hover:bg-slate-50"
              >
                <span className="text-lg">▦</span> Create Organization
              </Link>
            </div>
          )}
        </header>
        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
          aria-label="Account summary"
        >
          {metrics.map((m) => (
            <div key={m.label} className={`${countCard} ${m.theme}`}>
              <div className="flex items-start gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/70 text-xl font-bold"
                  aria-hidden="true"
                >
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <strong className="mt-1 block text-3xl font-extrabold tracking-tight text-slate-950">
                    {m.value}
                  </strong>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Current database total
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
        <section aria-label="Search and filter users" className="space-y-3">
          <form
            method="get"
            action="/admin/organizations"
            className="flex flex-wrap items-end gap-2.5"
          >
            <div className="relative min-w-[220px] flex-[2_1_330px]">
              <label htmlFor="organization-user-search" className="sr-only">
                Search users and companies
              </label>
              <span className="pointer-events-none absolute left-3 top-3 text-slate-500">
                <OsIcon name="search" size={20} />
              </span>
              <input
                id="organization-user-search"
                name="q"
                type="search"
                maxLength={80}
                defaultValue={q}
                placeholder="Search owners, companies, email or phone..."
                className={inputClass + ' pl-11'}
              />
            </div>
            <label className="min-w-36 flex-[1_1_140px]">
              <span className="sr-only">Account type</span>
              <select name="kind" defaultValue={kind} className={inputClass}>
                {kinds.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.key === 'all' ? 'All Types' : x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-32 flex-[1_1_130px]">
              <span className="sr-only">Status</span>
              <select
                name="status"
                defaultValue={status}
                className={inputClass}
              >
                <option value="">All Statuses</option>
                {statusValues.map((x) => (
                  <option key={x} value={x}>
                    {x === 'suspended'
                      ? 'Inactive'
                      : x.charAt(0).toUpperCase() + x.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-32 flex-[1_1_150px]">
              <span className="sr-only">Industry</span>
              <select
                name="industry"
                defaultValue={industry}
                className={inputClass}
              >
                <option value="">All Industries</option>
                {industries.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-32 flex-[1_1_130px]">
              <span className="sr-only">Sort users</span>
              <select name="sort" defaultValue={sort} className={inputClass}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <OsIcon name="search" size={17} /> Search
            </button>
            <Link
              href="/admin/organizations"
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold hover:bg-slate-100"
            >
              Clear
            </Link>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {kinds.map((item) => (
              <Link
                key={item.key}
                href={searchHref(filters, { kind: item.key })}
                aria-current={kind === item.key ? 'page' : undefined}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${kind === item.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600'}`}
              >
                {item.label} ({tabCount[item.key]})
              </Link>
            ))}
            <span className="ml-auto text-xs text-slate-500">
              Grid view · {first}–{last} of {result.total}
            </span>
          </div>
        </section>
        <section
          aria-label="Company owners directory"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          {result.rows.map((user) => (
            <UserCard key={user.id} user={user} canManage={canManage} />
          ))}
        </section>
        {result.rows.length === 0 && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
            <h2 className="text-lg font-bold">
              No company owners match these filters
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Try a different search or create a new organization with an owner.
            </p>
            <Link
              href="/admin/organizations"
              className="mt-4 inline-block text-sm font-semibold text-blue-700 underline"
            >
              Reset filters
            </Link>
          </section>
        )}
        <nav
          className="flex items-center justify-between gap-4 pb-6 text-sm"
          aria-label="Pagination"
        >
          {page > 1 ? (
            <Link
              href={searchHref(filters, { page: page - 1 })}
              className="rounded-xl border bg-white px-4 py-2.5 font-semibold hover:bg-slate-100"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-slate-500">Page {page}</span>
          {page * 20 < result.total ? (
            <Link
              href={searchHref(filters, { page: page + 1 })}
              className="rounded-xl border bg-white px-4 py-2.5 font-semibold hover:bg-slate-100"
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
