import Link from 'next/link';
import { WorkspaceOnboardingHeader } from '../onboarding-header';
import { pageServices } from '@business-os/auth/server';
import { ActionForm } from '@business-os/ui/action-form';
import { acceptEmployeeEmailInvitation, acceptEmployeeInvitationByCode } from './actions';
import './invite-entry.css';

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
    <>
      <WorkspaceOnboardingHeader />
    <main
      id="main-content"
      tabIndex={-1}
      className="invite-entry min-h-screen px-5 py-10 sm:px-8"
    >
      <div className="mx-auto max-w-3xl space-y-7">

        <header className="invite-entry-hero rounded-3xl p-8">
          <p className="text-xs font-semibold uppercase tracking-widest">
            WORKSPACE ACCESS
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Join your company
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Enter the code shared by your company owner, or accept an
            email invitation already assigned to you. Access is limited to
            your verified email and the approved company role.
          </p>
        </header>
        <section className="invite-entry-code rounded-2xl p-6" aria-label="Redeem an invitation code">
          <div className="invite-entry-code-icon" aria-hidden="true">✦</div>
          <h2 className="text-xl font-semibold">Have an invitation code?</h2>
          <p className="mt-2 text-sm">
            Enter the one-time code from your company administrator. Sign in
            with the same verified email address they invited.
          </p>
          <ActionForm action={acceptEmployeeInvitationByCode} label="Join company">
            <label className="invite-entry-label" htmlFor="company-invite-code">Invitation code</label>
            <input id="company-invite-code" type="text" name="code"
              required minLength={32} maxLength={50} autoComplete="off"
              spellCheck={false} autoCapitalize="characters"
              placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              aria-describedby="invite-code-help" />
            <span id="invite-code-help" className="invite-entry-help">
              Company access only; client projects continue through their existing project invitation.
            </span>
          </ActionForm>
        </section>
        <div className="invite-entry-divider"><span>Or use an email invitation</span></div>
        {invitations.length > 0 ? (
          <section className="space-y-4" aria-label="Available invitations">
            {invitations.map((invitation) => (
              <article
                key={invitation.id}
                className="invite-entry-card rounded-2xl p-6 shadow-sm"
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
          <section className="invite-entry-card rounded-2xl p-6">
            <h2 className="text-xl font-semibold">No email invitations waiting</h2>
            <p className="mt-2 text-sm text-slate-600">
              If your owner supplied a code, enter it above. Otherwise ask them to invite your verified email, or create your own company.
            </p>
            <Link
              href="/dashboard/company/apply"
              className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Create my company →
            </Link>
            <Link
              href="/auth/propulse"
              className="mt-3 ml-3 inline-flex rounded-xl border border-blue-200 px-5 py-3 text-sm font-semibold text-blue-700"
            >
              Import existing ProPulse business →
            </Link>
          </section>
        )}
      </div>
    </main>
    </>
  );
}
