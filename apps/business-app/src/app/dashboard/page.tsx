import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { signOut, switchOrganization } from '@business-os/auth/actions';
import { canAccess, moduleNavigation } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { Button } from '@business-os/ui';
import { createAutomationRepository } from '@business-os/database/automation';

export default async function Dashboard() {
  const { authorization, repository, client } = await pageServices();
  const user = await authorization.requireAuthenticatedUser();
  // Platform administrators have one canonical dashboard: /admin.
  // An organization Owner is not a platform administrator. Redirect only when
  // every permission required by /admin's dashboard is verified server-side.
  let canOpenPlatformDashboard = false;
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await authorization.requirePlatformPermission('platform.catalog.view');
    canOpenPlatformDashboard = true;
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'FORBIDDEN'))
      throw error;
  }
  if (canOpenPlatformDashboard) redirect('/admin');
  const [allOrganizations, memberships, modules] = await Promise.all([
    repository.organizations(),
    repository.memberships(),
    repository.modules(),
  ]);
  const organizations = allOrganizations.filter((org) =>
    memberships.some(
      (m) =>
        m.organization_id === org.id &&
        m.user_id === user.id &&
        m.status === 'active',
    ),
  );
  let context: Awaited<ReturnType<typeof activeOrganization>> = null;
  let invalidSelection = false;
  try {
    context = await activeOrganization();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN')
      invalidSelection = true;
    else throw error;
  }
  const organization = context
    ? organizations.find((org) => org.id === context.organizationId)
    : null;
  const branches = context
    ? await repository.branches(context.organizationId)
    : [];
  const canViewTeam =
    context &&
    canAccess(context, {
      organizationId: context.organizationId,
      permission: 'team.view',
    });
  const team =
    context && canViewTeam ? await repository.team(context.organizationId) : [];
  const nav = context ? moduleNavigation(context, modules) : [];
  const notificationSummary =
    context &&
    canAccess(context, {
      organizationId: context.organizationId,
      permission: 'notification.view',
    })
      ? await createAutomationRepository(
          client,
          context.organizationId,
        ).notifications(1, 'unread')
      : null;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="dashboard-shell tenant-dashboard-v2"
    >
      <header className="tenant-v2-topbar">
        <Link className="tenant-v2-brand" href="/dashboard">
          <span className="tenant-v2-monogram" aria-hidden="true">
            P
          </span>
          <span>
            <strong>ProPulse Business OS</strong>
            <small>Company workspace</small>
          </span>
        </Link>
        <div className="tenant-v2-account">
          <span>{user.email ?? 'Signed in'}</span>
          <form action={signOut}>
            <Button>Sign out</Button>
          </form>
        </div>
      </header>

      <section className="tenant-v2-hero">
        <div>
          <p className="eyebrow">Your business, one workspace</p>
          <h1>Business overview</h1>
          <p className="tenant-v2-lead">
            {organization
              ? 'Welcome to ' +
                organization.name +
                '. Your work, tools and team in one place.'
              : 'Select your company to access your business tools and daily operations.'}
          </p>
          <div className="tenant-v2-hero-actions">
            {context && (
              <Link
                className="premium-link-secondary"
                href="/dashboard/reports/overview"
              >
                Management overview →
              </Link>
            )}
          </div>
        </div>
        <div className="tenant-v2-art" aria-hidden="true">
          <span>OS</span>
        </div>
      </section>

      {invalidSelection && (
        <p className="tenant-v2-alert" role="alert">
          Your previously selected company is unavailable. Select an active
          company below.
        </p>
      )}

      {organizations.length > 0 && (
        <form action={switchOrganization} className="dashboard-controlbar">
          <label>
            Active company
            <select
              name="organizationId"
              defaultValue={context?.organizationId}
              className="mt-2"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <Button>Switch company</Button>
        </form>
      )}

      {organization && context ? (
        <>
          <section className="tenant-v2-metrics" aria-label="Company snapshot">
            <div className="tenant-v2-metric">
              <span>Accessible modules</span>
              <strong>{nav.length}</strong>
              <small>Available to your account</small>
            </div>
            <div className="tenant-v2-metric">
              <span>Company branches</span>
              <strong>{branches.length}</strong>
              <small>Visible branches</small>
            </div>
            <div className="tenant-v2-metric">
              <span>Team memberships</span>
              <strong>{canViewTeam ? team.length : '—'}</strong>
              <small>
                {canViewTeam ? 'Your company team' : 'Access restricted'}
              </small>
            </div>
            <div className="tenant-v2-metric">
              <span>Unread notifications</span>
              <strong>
                {notificationSummary ? (notificationSummary.unread ?? 0) : '—'}
              </strong>
              <small>
                {notificationSummary ? 'Pending updates' : 'Access restricted'}
              </small>
            </div>
          </section>

          <div className="tenant-v2-columns">
            <div className="tenant-v2-stack">
              <section className="tenant-v2-panel">
                <p className="eyebrow">Daily operations</p>
                <h2>Quick access</h2>
                <div className="tenant-v2-actions">
                  {(canAccess(context, {
                    organizationId: context.organizationId,
                    permission: 'customer.view',
                    moduleKey: 'quotation',
                  }) ||
                    canAccess(context, {
                      organizationId: context.organizationId,
                      permission: 'customer.view',
                      moduleKey: 'crm',
                    })) && (
                    <Link href="/dashboard/customers">
                      <span>Customers</span>
                      <small>Contacts and enquiries</small>
                      <b aria-hidden="true">↗</b>
                    </Link>
                  )}
                  {(canViewTeam ||
                    canAccess(context, {
                      organizationId: context.organizationId,
                      permission: 'role.view',
                    })) && (
                    <Link href="/dashboard/company/team">
                      <span>People &amp; roles</span>
                      <small>Employees and access</small>
                      <b aria-hidden="true">↗</b>
                    </Link>
                  )}
                  <Link href="/dashboard/reports">
                    <span>Reports</span>
                    <small>Company performance</small>
                    <b aria-hidden="true">↗</b>
                  </Link>
                  <Link href="/dashboard/company/invitations">
                    <span>Invitations</span>
                    <small>Company invitations</small>
                    <b aria-hidden="true">↗</b>
                  </Link>
                  {context.entitlements.includes('billing') &&
                    context.grants.some(
                      (grant) =>
                        [
                          'contract.view',
                          'invoice.view',
                          'payment.view',
                          'financial_report.view',
                        ].includes(grant.permission) &&
                        grant.scope.kind === 'organization',
                    ) && (
                      <Link href="/dashboard/finance">
                        <span>Finance</span>
                        <small>Commercial execution</small>
                        <b aria-hidden="true">↗</b>
                      </Link>
                    )}
                  {notificationSummary && (
                    <Link href="/dashboard/work">
                      <span>My work</span>
                      <small>Tasks and notifications</small>
                      <b aria-hidden="true">↗</b>
                    </Link>
                  )}
                  {canAccess(context, {
                    organizationId: context.organizationId,
                    permission: 'automation.view',
                  }) && (
                    <Link href="/dashboard/automations">
                      <span>Automations</span>
                      <small>Workflow management</small>
                      <b aria-hidden="true">↗</b>
                    </Link>
                  )}
                </div>
              </section>

              <section className="tenant-v2-panel">
                <p className="eyebrow">Company tools</p>
                <h2>Enabled modules</h2>
                {nav.length ? (
                  <div className="tenant-v2-modules">
                    {nav.map((item) => (
                      <Link key={item.key} href={item.href}>
                        <span className="tenant-v2-dot" aria-hidden="true" />
                        {item.label}
                        <span aria-hidden="true">→</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    No modules are available to your account yet.
                  </p>
                )}
              </section>
            </div>
            <aside className="tenant-v2-stack" aria-label="Company information">
              <section className="tenant-v2-panel">
                <p className="eyebrow">Active company</p>
                <h2>{organization.name}</h2>
                <dl className="tenant-v2-details">
                  <div>
                    <dt>Status</dt>
                    <dd>{organization.status}</dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>{organization.default_currency}</dd>
                  </div>
                  <div>
                    <dt>Time zone</dt>
                    <dd>{organization.default_timezone}</dd>
                  </div>
                  <div>
                    <dt>Branches</dt>
                    <dd>{branches.length}</dd>
                  </div>
                </dl>
              </section>
              <section className="tenant-v2-panel">
                <p className="eyebrow">Secure workspace</p>
                <h2>Only what you need</h2>
                <p className="muted">
                  Your workspace shows the modules and tools assigned to your
                  company membership. Detailed permissions are managed in the
                  employee access area rather than on this dashboard.
                </p>
                {(canViewTeam ||
                  canAccess(context, {
                    organizationId: context.organizationId,
                    permission: 'role.view',
                  })) && (
                  <Link
                    href="/dashboard/company/team"
                    className="premium-link-secondary"
                  >
                    Manage access →
                  </Link>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : (
        <section className="tenant-v2-panel">
          <h2>No active company selected</h2>
          <p>
            Select an active membership above or ask an organization
            administrator to invite you.
          </p>
        </section>
      )}
      <footer className="tenant-v2-footer">
        <div>
          <h2>Need another business workspace?</h2>
          <p>Apply to register a construction or interiors company.</p>
        </div>
        <Link
          href="/dashboard/company/apply"
          className="premium-link-secondary"
        >
          Register a company →
        </Link>
      </footer>
    </main>
  );
}
