import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';

const PAGE_SIZE = 20;
const statuses = ['active', 'trial', 'suspended', 'archived'] as const;
type Status = (typeof statuses)[number];
type DirectoryParams = {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : (value?.[0] ?? '');
}

function directoryHref(
  query: string,
  status: Status | undefined,
  page: number,
) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return `/admin/organizations${suffix ? `?${suffix}` : ''}`;
}

const statusStyles: Record<Status, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  trial: 'border-blue-200 bg-blue-50 text-blue-800',
  suspended: 'border-amber-200 bg-amber-50 text-amber-900',
  archived: 'border-slate-200 bg-slate-100 text-slate-700',
};

export default async function OrganizationsDirectory({
  searchParams,
}: {
  searchParams: Promise<DirectoryParams>;
}) {
  const { authorization, repository } = await pageServices();
  try {
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  const params = await searchParams;
  const q = single(params.q)
    .trim()
    .replace(/[\\%_]/g, '')
    .slice(0, 80);
  const rawStatus = single(params.status);
  const status = statuses.includes(rawStatus as Status)
    ? (rawStatus as Status)
    : undefined;
  const requestedPage = Number(single(params.page) || '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10_000)
      : 1;
  const result = await repository.organizationDirectory({
    query: q,
    ...(status ? { status } : {}),
    page,
    pageSize: PAGE_SIZE,
  });
  const { organizations, total } = result;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
          <Link href="/admin" className="hover:underline">
            Platform dashboard
          </Link>{' '}
          / Organizations
        </nav>

        <header className="rounded-3xl bg-slate-950 p-8 text-white shadow-xl sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-300 uppercase">
            Platform control plane
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Organizations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            View tenant organizations and open their existing, permission-gated
            plan and entitlement controls. Tenant records remain protected by
            database row-level security.
          </p>
          <p className="mt-6 text-2xl font-semibold" aria-live="polite">
            {total.toLocaleString()}{' '}
            <span className="text-sm font-normal text-slate-300">
              matching organizations
            </span>
          </p>
        </header>

        <section
          aria-label="Organization filters"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <form
            action="/admin/organizations"
            method="get"
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <label className="flex-1 space-y-2 text-sm font-medium">
              <span className="block">Company name</span>
              <input
                type="search"
                name="q"
                maxLength={80}
                defaultValue={q}
                placeholder="Search organizations"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-offset-2 focus:border-sky-600"
              />
            </label>
            <label className="space-y-2 text-sm font-medium sm:w-56">
              <span className="block">Status</span>
              <select
                name="status"
                defaultValue={status ?? ''}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="">All statuses</option>
                {statuses.map((value) => (
                  <option value={value} key={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Apply filters
            </button>
            <Link
              href="/admin/organizations"
              className="rounded-xl px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset
            </Link>
          </form>
        </section>

        <section aria-label="Organization results" className="space-y-4">
          <p className="text-sm text-slate-600">
            Showing {first}–{last} of {total.toLocaleString()} matching
            organizations
          </p>
          {organizations.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {organizations.map((organization) => {
                const organizationStatus = organization.status as Status;
                return (
                  <li key={organization.id}>
                    <article className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="min-w-0 text-xl font-semibold break-words">
                          {organization.name}
                        </h2>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[organizationStatus] ?? statusStyles.archived}`}
                        >
                          {organization.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {organization.slug} · {organization.country_code}
                      </p>
                      <p className="mt-3 text-xs text-slate-500">
                        {organization.plan_id
                          ? 'Plan assigned'
                          : 'No plan assigned'}
                      </p>
                      <Link
                        href={`/admin/organizations/${organization.id}`}
                        className="mt-5 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      >
                        View organization{' '}
                        <span aria-hidden="true" className="ml-2">
                          →
                        </span>
                      </Link>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <h2 className="text-lg font-semibold">No organizations found</h2>
              <p className="mt-2 text-sm text-slate-600">
                Adjust your filters, or return to the first page.
              </p>
            </div>
          )}
        </section>

        <nav
          aria-label="Organization pagination"
          className="flex items-center justify-between gap-4 pb-8"
        >
          {page > 1 ? (
            <Link
              href={directoryHref(q, status, page - 1)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-slate-100"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-600">Page {page}</span>
          {page * PAGE_SIZE < total ? (
            <Link
              href={directoryHref(q, status, page + 1)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-slate-100"
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
