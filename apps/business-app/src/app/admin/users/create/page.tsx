import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { ActionForm } from '@business-os/ui/action-form';
import { DomainError } from '@business-os/shared';
import { invitePlatformUser } from '../../organizations/control-actions';

export const dynamic = 'force-dynamic';
const input =
  'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
export default async function CreateUser() {
  const { authorization } = await pageServices();
  try {
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link className="hover:underline" href="/admin/organizations">
            Organizations &amp; Users
          </Link>{' '}
          / Create User
        </nav>
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            Super Admin · Account onboarding
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Create User
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Send an email verification link to create a secure general user
            identity. If the email is already registered, the existing account
            is reused rather than duplicated. Company access is granted
            separately after verification.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ActionForm
            action={invitePlatformUser}
            label="Send account verification email"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Full name
                <input
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={200}
                  autoComplete="off"
                  className={input}
                  placeholder="Enter the person's full name"
                />
              </label>
              <label className="text-sm font-semibold">
                Email address
                <input
                  name="email"
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="off"
                  className={input}
                  placeholder="person@example.com"
                />
              </label>
            </div>
          </ActionForm>
          <div className="mt-6 space-y-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-bold">
              Choose the account type after verification
            </p>
            <p>
              <strong>General User:</strong> no business access until assigned.
            </p>
            <p>
              <strong>Business Owner:</strong> create a company with this
              verified owner&apos;s email; the company owner role receives the
              default full company permissions.
            </p>
            <p>
              <strong>Seller:</strong> create or enable a seller storefront on
              the person&apos;s company. Buyers and sellers can belong to the
              same organization.
            </p>
          </div>
        </section>
        <Link
          href="/admin/organizations/create"
          className="text-sm font-semibold text-blue-700 underline"
        >
          Create Organization →
        </Link>
      </div>
    </main>
  );
}
