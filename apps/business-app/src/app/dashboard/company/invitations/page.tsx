import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { ActionForm } from '@business-os/ui/action-form';
import { acceptEmployeeEmailInvitation } from './actions';

type Invitation = {
  id: string;
  organizationName: string;
  status: string;
  expiresAt: string;
  roleCount: number;
};

function isInvitation(value: unknown): value is Invitation {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'organizationName' in value &&
    typeof value.organizationName === 'string' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'string' &&
    'roleCount' in value &&
    typeof value.roleCount === 'number'
  );
}

export default async function MyEmployeeInvitations() {
  const { authorization, repository } = await pageServices();
  await authorization.requireAuthenticatedUser();
  const result = await repository.myEmployeeInvitations();
  const invitations = Array.isArray(result) ? result.filter(isInvitation) : [];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-3xl space-y-7">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-600 hover:underline"
        >
          ← Business dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">
            Account onboarding
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Your company invitations
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Invitations are visible only to the matching, email-verified
            account. Register or sign in with the exact invited email and
            confirm it before accepting. A forwarded link alone never grants
            workspace access.
          </p>
        </header>
        {invitations.length > 0 ? (
          <section className="space-y-4" aria-label="Available invitations">
            {invitations.map((invitation) => (
              <article
                key={invitation.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-semibold">
                  {invitation.organizationName}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {invitation.roleCount} assigned{' '}
                  {invitation.roleCount === 1 ? 'role' : 'roles'} · Expires{' '}
                  {new Date(invitation.expiresAt).toLocaleDateString('en-IN')}
                </p>
                {invitation.status === 'pending' ? (
                  <ActionForm
                    action={acceptEmployeeEmailInvitation}
                    label="Accept invitation"
                  >
                    <input
                      type="hidden"
                      name="inviteId"
                      value={invitation.id}
                    />
                    <p className="text-sm text-slate-600">
                      Accept to activate membership with the preapproved roles.
                    </p>
                  </ActionForm>
                ) : (
                  <p className="mt-3 text-sm text-amber-700">
                    This invitation has expired. Ask the company administrator
                    to resend it.
                  </p>
                )}
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">No pending invitations</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ask your company administrator to invite your verified email
              address. You can also register a new company from the dashboard.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
