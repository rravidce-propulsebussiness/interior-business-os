import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createPlatformCompaniesRepository } from '@business-os/database/platform-companies';
import { DomainError, idSchema } from '@business-os/shared';

export const dynamic = 'force-dynamic';

export default async function OwnerDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { authorization, client } = await pageServices();
  try {
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const companyRepository = createPlatformCompaniesRepository(client);
  const owner = await companyRepository.userProfile(id);
  // This Super Admin screen is for company owners, not general employees.
  const ownedCompanies = owner.companies.filter(
    (company) => company.isOwner && company.memberStatus === 'active',
  );
  if (ownedCompanies.length === 0) notFound();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/admin/organizations" className="hover:underline">
            Organizations &amp; Owners
          </Link>{' '}
          / {owner.name}
        </nav>
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Company owner profile
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">{owner.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
              Business Owner · Full company access
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 capitalize">
              {owner.status}
            </span>
            {owner.verified && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Verified identity
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-500">Email</span>
              <p className="font-semibold">{owner.email}</p>
            </div>
            <div>
              <span className="text-slate-500">Phone</span>
              <p className="font-semibold">{owner.phone || 'Not provided'}</p>
            </div>
          </div>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Owned organizations</h2>
          <p className="mt-2 text-sm text-slate-600">
            Owners automatically have full tenant permissions, within their
            subscribed modules. Super Admin manages company plans,
            industry and seller approval. The owner manages employees,
            invitations and roles within their company dashboard.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ownedCompanies.map((company) => (
              <article
                key={company.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{company.name}</strong>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize">
                    {company.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {company.slug} ·{' '}
                  {company.sellerStatus === 'approved'
                    ? 'Owner of approved seller'
                    : 'Business owner'}
                </p>
                <p className="mt-3 text-sm font-bold text-blue-700">
                  Full company owner permissions
                </p>
                <Link
                  className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white"
                  href={'/admin/organizations/' + company.id}
                >
                  Manage organization →
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">
            Owner login &amp; employee access
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Company owners can change their password from Forgot password at
            sign-in. A temporary password is provided only when the account is
            newly created. Staff access is managed by the owner inside their own
            company workspace, not by creating platform users here.
          </p>
          <Link
            className="mt-4 inline-block text-sm font-semibold text-blue-700 underline"
            href="/admin/organizations"
          >
            ← Back to organization owners
          </Link>
        </section>
      </div>
    </main>
  );
}
