import Link from 'next/link';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { signOut, switchOrganization } from '@business-os/auth/actions';
import { canAccess, moduleNavigation } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { Button } from '@business-os/ui';
import { ActionForm } from '@business-os/ui/action-form';
import { provisionOrganization } from './actions';
import { createAutomationRepository } from '@business-os/database/automation';

export default async function Dashboard() {
  const { authorization, repository, client } = await pageServices();
  const user = await authorization.requireAuthenticatedUser();
  const [allOrganizations, memberships, industries, modules] =
    await Promise.all([
      repository.organizations(),
      repository.memberships(),
      repository.industries(),
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
      className="dashboard-shell"
    >
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Operations workspace</p>
          <h1>Business dashboard</h1>
          <p>Manage the organization, modules, permissions, and daily work from one secure view.</p>
        </div>
      </header>
      {context && (
        <nav
          className="dashboard-nav"
          aria-label="Daily operations"
        >
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
          <Link
            className="premium-link-secondary"
            href="/dashboard/finance"
          >
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
        <form
          action={switchOrganization}
          className="dashboard-controlbar"
        >
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
        <h2 className="text-xl font-semibold">Create an organization</h2>
        <ActionForm action={provisionOrganization} label="Create organization">
          <label>
            Business name
            <input
              required
              name="name"
              maxLength={200}
              className="mt-2"
            />
          </label>
          <label>
            URL identifier
            <input
              required
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={80}
              className="mt-2"
            />
          </label>
          <label>
            Currency code
            <input
              required
              name="currency"
              placeholder="USD"
              pattern="[A-Z]{3}"
              className="mt-2"
            />
          </label>
          <label>
            Country code
            <input
              required
              name="country"
              placeholder="US"
              pattern="[A-Z]{2}"
              className="mt-2"
            />
          </label>
          <label>
            Timezone
            <input
              required
              name="timezone"
              defaultValue="UTC"
              className="mt-2"
            />
          </label>
          <label>
            Industry
            <select name="industryId" className="mt-2">
              <option value="">Choose later</option>
              {industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      </section>
    </main>
  );
}
