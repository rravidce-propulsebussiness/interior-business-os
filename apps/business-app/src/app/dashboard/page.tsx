import Link from 'next/link';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { signOut, switchOrganization } from '@business-os/auth/actions';
import { canAccess, moduleNavigation } from '@business-os/auth';
import { DomainError, isHostedOrigin } from '@business-os/shared';
import { Button } from '@business-os/ui';
import { createAutomationRepository } from '@business-os/database/automation';

export default async function Dashboard() {
  const { authorization, repository, client } = await pageServices();
  const user = await authorization.requireAuthenticatedUser();
  // Being an organization Owner does NOT make a user a Platform Super Admin.
  // Only a server-verified platform permission can reveal the admin entry.
  let hasPlatformAccess = false;
  try {
    await authorization.requirePlatformPermission('platform.access');
    hasPlatformAccess = true;
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'FORBIDDEN'))
      throw error;
  }
  const platformOrigin =
    process.env.PLATFORM_ADMIN_ORIGIN &&
    isHostedOrigin(process.env.PLATFORM_ADMIN_ORIGIN)
      ? process.env.PLATFORM_ADMIN_ORIGIN.replace(/\/$/, '')
      : null;
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
    <main id="main-content" tabIndex={-1} className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Operations workspace</p>
          <h1>Business dashboard</h1>
          <p>
            Manage the organization, modules, permissions, and daily work from
            one secure view.
          </p>
        </div>
      </header>
      {hasPlatformAccess && (
        <section className="section-card section-card-wide" aria-label="Platform administration">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Platform Super Admin</p>
              <h2 className="text-xl font-semibold">Open the platform control center</h2>
              <p className="muted">
                This is your company workspace. The marketplace, tenant plans,
                websites and domain control center run in a separate, secure app.
              </p>
            </div>
            {platformOrigin ? (
              <a
                className="premium-link"
                href={`${platformOrigin}/dashboard`}
                rel="noopener noreferrer"
              >
                Open Super Admin ↗
              </a>
            ) : (
              <p className="notice notice-warning">
                Admin hosting not connected. Deploy the separate platform-admin
                service and configure PLATFORM_ADMIN_ORIGIN on the Business App.
              </p>
            )}
          </div>
        </section>
      )}
      {context && (
        <nav className="dashboard-nav" aria-label="Daily operations">
          {(canViewTeam ||
            canAccess(context, {
              organizationId: context.organizationId,
              permission: 'role.view',
            })) && (
            <Link className="underline" href="/dashboard/company/team">
              Employees &amp; roles
            </Link>
          )}
          <Link className="underline" href="/dashboard/reports">
            Reports
          </Link>
          <Link className="underline" href="/dashboard/reports/overview">
            Management overview
          </Link>
          {notificationSummary && (
            <Link className="underline" href="/dashboard/work">
              My work
            </Link>
          )}
          {notificationSummary && (
            <Link className="underline" href="/dashboard/notifications">
              Notifications ({notificationSummary.unread ?? 0} unread)
            </Link>
          )}
          {canAccess(context, {
            organizationId: context.organizationId,
            permission: 'automation.view',
          }) && (
            <Link className="underline" href="/dashboard/automations">
              Automations
            </Link>
          )}
        </nav>
      )}
      {context &&
        context.entitlements.includes('billing') &&
        context.grants.some(
          (g) =>
            [
              'contract.view',
              'invoice.view',
              'payment.view',
              'financial_report.view',
            ].includes(g.permission) && g.scope.kind === 'organization',
        ) && (
          <Link className="premium-link-secondary" href="/dashboard/finance">
            Commercial execution
          </Link>
        )}
      <p className="muted">Signed in as {user.email ?? user.id}</p>
      <form action={signOut} className="my-4">
        <Button>Sign out</Button>
      </form>
      {invalidSelection && (
        <p role="alert">
          The selected organization is unavailable. Choose an active membership
          below.
        </p>
      )}
      {organizations.length > 0 && (
        <form action={switchOrganization} className="dashboard-controlbar">
          <label>
            Active organization
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
          <Button>Switch organization</Button>
        </form>
      )}
      {organization && context ? (
        <>
          <section className="section-card">
            <h2 className="text-2xl font-semibold">{organization.name}</h2>
            <p>
              {organization.status} · {organization.default_currency} ·{' '}
              {organization.default_timezone}
            </p>
          </section>
          <section className="section-card">
            <h2 className="text-xl font-semibold">Your roles</h2>
            <ul>
              {context.roles.map((role, index) => (
                <li key={`${role.id}-${index}`}>
                  {role.name} —{' '}
                  {role.branchId ? `Branch ${role.branchId}` : 'Organization'}
                </li>
              ))}
            </ul>
          </section>
          <section className="section-card">
            <h2 className="text-xl font-semibold">Effective permissions</h2>
            {context.grants.length ? (
              <ul className="permission-grid">
                {context.grants.map((grant, index) => (
                  <li key={index} className="break-words">
                    {grant.permission} ({grant.scope.kind})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No permissions assigned.</p>
            )}
          </section>
          <section className="section-card">
            <h2 className="text-xl font-semibold">Enabled modules</h2>
            <p>{context.entitlements.join(', ') || 'No modules enabled.'}</p>
            <nav className="dashboard-nav" aria-label="Enabled modules">
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
                <Link className="underline" href="/dashboard/customers">
                  Customers
                </Link>
              )}
              <ul className="dashboard-nav">
                {nav.map((item) => (
                  <li key={item.key}>
                    <Link className="underline" href={item.href}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>
          <section className="section-card">
            <h2 className="text-xl font-semibold">Branches</h2>
            {branches.length ? (
              <ul>
                {branches.map((branch) => (
                  <li key={branch.id}>
                    {branch.name} ({branch.code}) — {branch.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No branches available to your account.</p>
            )}
          </section>
          {canViewTeam && (
            <section className="section-card">
              <h2 className="text-xl font-semibold">Team memberships</h2>
              <ul>
                {team.map((member) => (
                  <li className="break-all" key={member.id}>
                    {member.user_id} — {member.status}
                    {member.branch_id ? ` — branch ${member.branch_id}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="section-card">
          No active organization selected. Create one or ask an organization
          administrator for membership.
        </p>
      )}
      <section className="section-card">
        <h2 className="text-xl font-semibold">Add a business</h2>
        <p>
          New companies are reviewed by the platform before a workspace is
          activated. Choose Construction, Interior Design or both.
        </p>
        <Link
          className="premium-link-secondary"
          href="/dashboard/company/apply"
        >
          Apply to register a company
        </Link>
      </section>
    </main>
  );
}
