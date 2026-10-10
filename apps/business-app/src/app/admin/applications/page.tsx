import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import {
  decideCompanyApplication,
  setCompanyOnboardingPolicy,
} from './actions';

type Application = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  country_code: string;
  currency: string;
  industry_keys: string[];
  applicant_email: string;
  requested_plan_id: string | null;
};

function isApplication(value: unknown): value is Application {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Application>;
  return (
    typeof row.id === 'string' &&
    typeof row.company_name === 'string' &&
    typeof row.slug === 'string' &&
    typeof row.status === 'string' &&
    typeof row.country_code === 'string' &&
    typeof row.currency === 'string' &&
    typeof row.applicant_email === 'string' &&
    Array.isArray(row.industry_keys) &&
    row.industry_keys.every((key) => typeof key === 'string')
  );
}

const filters = ['pending_review', 'approved', 'rejected'] as const;
type Status = (typeof filters)[number];

export default async function CompanyApplications({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { authorization, repository } = await pageServices();
  try {
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const query = await searchParams;
  const status = filters.includes(query.status as Status)
    ? (query.status as Status)
    : 'pending_review';
  const suppliedPage = Number(query.page ?? '1');
  const page =
    Number.isSafeInteger(suppliedPage) && suppliedPage > 0
      ? Math.min(suppliedPage, 10_000)
      : 1;
  const [data, approvalPolicy] = await Promise.all([
    repository.reviewCompanyApplications(status, page),
    repository.companyOnboardingPolicy(),
  ]);
  const approvalRequired =
    approvalPolicy !== null &&
    typeof approvalPolicy === 'object' &&
    !Array.isArray(approvalPolicy) &&
    approvalPolicy.approvalRequired === true;
  const response =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as { rows?: unknown; total?: unknown })
      : {};
  const rows = Array.isArray(response.rows)
    ? response.rows.filter(isApplication)
    : [];
  const total = typeof response.total === 'number' ? response.total : 0;
  const previous = `/admin/applications?status=${status}&page=${page - 1}`;
  const next = `/admin/applications?status=${status}&page=${page + 1}`;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <Link
          href="/admin"
          className="text-sm font-medium text-slate-600 hover:underline"
        >
          ← Platform dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-300 uppercase">
            Platform Super Admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Company applications</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Only authorized Platform Administrators can review requests.
            Approval creates the canonical organization, verified Owner
            membership, plan selection and enabled industries in one
            transaction.
          </p>
        </header>
        <section
          aria-label="Company creation policy"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">New company approvals</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {approvalRequired
              ? 'Required: legacy direct creation is blocked. New companies must pass platform review.'
              : 'Compatibility mode: existing direct-creation integrations remain available. Administrator review is not yet mandatory.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Switch only after verifying legacy integrations and hosted Auth.
            This changes new organization creation, not existing company data.
            The change is permission-gated and recorded in the audit log.
          </p>
          <ActionForm
            action={setCompanyOnboardingPolicy}
            label={
              approvalRequired
                ? 'Restore compatibility mode'
                : 'Require approval for all new companies'
            }
          >
            <input
              type="hidden"
              name="approvalRequired"
              value={approvalRequired ? 'false' : 'true'}
            />
          </ActionForm>
        </section>
        <nav aria-label="Application status" className="flex flex-wrap gap-3">
          {filters.map((filter) => (
            <Link
              key={filter}
              href={`/admin/applications?status=${filter}`}
              aria-current={status === filter ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                status === filter
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white'
              }`}
            >
              {filter.replace(/_/g, ' ')}
            </Link>
          ))}
        </nav>
        <section aria-label="Review queue" className="space-y-4">
          <p className="text-sm text-slate-600">
            {total} applications · Page {page}
          </p>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p>No applications match this status.</p>
            </div>
          ) : (
            rows.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {item.company_name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.slug} · {item.country_code} / {item.currency}
                    </p>
                    <p className="mt-2 text-sm">
                      Applicant: {item.applicant_email}
                    </p>
                    <p className="mt-2 text-sm">
                      Industry: {item.industry_keys.join(', ')}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.requested_plan_id
                        ? 'Requested a specific plan'
                        : 'Requested administrator-recommended plan'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold capitalize">
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {item.status === 'pending_review' && (
                  <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
                    <ActionForm
                      action={decideCompanyApplication}
                      label="Approve and create workspace"
                    >
                      <input
                        type="hidden"
                        name="applicationId"
                        value={item.id}
                      />
                      <input type="hidden" name="decision" value="approve" />
                      <label className="grid gap-2 text-sm">
                        Internal approval note (optional)
                        <input
                          name="note"
                          maxLength={500}
                          className="rounded-lg border border-slate-300 p-3"
                        />
                      </label>
                    </ActionForm>
                    <ActionForm
                      action={decideCompanyApplication}
                      label="Reject application"
                    >
                      <input
                        type="hidden"
                        name="applicationId"
                        value={item.id}
                      />
                      <input type="hidden" name="decision" value="reject" />
                      <label className="grid gap-2 text-sm">
                        Rejection reason (required)
                        <textarea
                          name="note"
                          required
                          minLength={3}
                          maxLength={500}
                          rows={2}
                          className="rounded-lg border border-slate-300 p-3"
                        />
                      </label>
                    </ActionForm>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
        <nav
          aria-label="Review pagination"
          className="flex justify-between pb-8 text-sm"
        >
          {page > 1 ? (
            <Link href={previous} className="underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {page * 25 < total ? (
            <Link href={next} className="underline">
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
