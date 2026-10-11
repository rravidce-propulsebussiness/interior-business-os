import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OwnerOrganizationForm } from '../owner-organization-form';

export const dynamic = 'force-dynamic';

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

  const [industries, plans, modules] = await Promise.all([
    repository.industries(),
    repository.plans(),
    repository.modules(),
  ]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-[#f6f8fc] px-4 py-7 text-slate-950 sm:px-7 lg:px-9"
    >
      <div className="mx-auto max-w-[1420px] space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/organizations"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700"
          >
            <span aria-hidden="true">←</span> Back to organizations
          </Link>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">
              Workspace onboarding
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Create organization &amp; owner
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              One company, one owner login and a ready-to-use workspace.
              Seller storefronts match the company name automatically.
              Employees are managed later by their owner.
            </p>
          </div>
          <div
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:w-auto"
            aria-label="Setup summary"
          >
            {[
              ['01', 'Business details'],
              ['02', 'Owner login'],
              ['03', 'Access preview'],
            ].map(([number, label], index) => (
              <div key={label} className="flex min-w-0 items-center gap-2">
                {index > 0 && (
                  <span className="mx-1 h-px w-3 bg-slate-200 sm:w-5" />
                )}
                <span
                  className={
                    'grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ' +
                    (index === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500')
                  }
                >
                  {number}
                </span>
                <span className="hidden text-[11px] font-bold text-slate-700 sm:block">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </header>

        <OwnerOrganizationForm
          industries={industries}
          plans={plans}
          modules={modules}
        />
      </div>
    </main>
  );
}
