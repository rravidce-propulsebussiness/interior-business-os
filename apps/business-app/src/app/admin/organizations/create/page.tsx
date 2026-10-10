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
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <Link className="hover:underline" href="/admin/organizations">
            Owners &amp; Sellers
          </Link>
          {' / Create organization'}
        </nav>
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            Super Admin · Organization onboarding
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">
            Create organization &amp; owner
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create one company with its owner login. The owner receives full
            company permissions automatically, subject to the subscribed
            modules. If they will sell materials, enable the seller storefront
            here. Employees can be added later by the owner from their
            workspace.
          </p>
        </header>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <OwnerOrganizationForm industries={industries} plans={plans} />
        </div>
      </div>
    </main>
  );
}
