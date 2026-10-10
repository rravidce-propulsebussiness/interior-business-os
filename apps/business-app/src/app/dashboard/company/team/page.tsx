import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import {
  changeMembershipRole,
  changeMembershipStatus,
  createCustomRole,
  inviteEmployeeByEmail,
  resendEmployeeEmail,
  revokeEmployeeEmail,
} from './actions';

type InvitationRow = {
  id: string;
  email: string;
  status: string;
  mailStatus: string;
  expiresAt: string;
  roleIds: string[];
};

function isInvitationRow(item: unknown): item is InvitationRow {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    typeof item.id === 'string' &&
    'email' in item &&
    typeof item.email === 'string' &&
    'status' in item &&
    typeof item.status === 'string' &&
    'mailStatus' in item &&
    typeof item.mailStatus === 'string' &&
    'expiresAt' in item &&
    typeof item.expiresAt === 'string' &&
    'roleIds' in item &&
    Array.isArray(item.roleIds)
  );
}

export default async function CompanyTeamPage() {
  const { client, repository } = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();
  const organizationId = context.organizationId;
  const has = (permission: string) =>
    canAccess(context, { organizationId, permission });
  const canViewTeam = has('team.view');
  const canViewRoles = has('role.view') || has('role.manage');
  if (!canViewTeam && !canViewRoles) notFound();

  const [
    members,
    branches,
    roleResult,
    permissionResult,
    grantResult,
    assignmentResult,
  ] = await Promise.all([
    canViewTeam ? repository.team(organizationId) : Promise.resolve([]),
    canViewTeam && has('branch.view')
      ? repository.branches(organizationId)
      : Promise.resolve([]),
    canViewRoles
      ? client
          .from('roles')
          .select('id,key,name,is_owner')
          .eq('organization_id', organizationId)
          .order('name')
      : Promise.resolve({ data: [], error: null }),
    canViewRoles
      ? client.from('permissions').select('id,key,description').order('key')
      : Promise.resolve({ data: [], error: null }),
    canViewRoles
      ? client
          .from('role_permissions')
          .select('role_id,permission_id')
          .eq('organization_id', organizationId)
      : Promise.resolve({ data: [], error: null }),
    canViewTeam
      ? client
          .from('membership_roles')
          .select('membership_id,role_id,branch_id')
          .eq('organization_id', organizationId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    roleResult.error ||
    permissionResult.error ||
    grantResult.error ||
    assignmentResult.error
  )
    throw new DomainError('FORBIDDEN');
  const roles = roleResult.data ?? [];
  const permissions = permissionResult.data ?? [];
  const grants = grantResult.data ?? [];
  const assignments = assignmentResult.data ?? [];
  const canAssign = has('team.manage') && has('role.manage');
  const canCreateRoles = has('role.manage');
  const canInvite = has('team.invite') && has('role.manage');
  const invitationResult = canInvite
    ? await repository.employeeInvitations(organizationId)
    : [];
  const invitations = Array.isArray(invitationResult)
    ? invitationResult.filter(isInvitationRow)
    : [];
  const canChangeStatus = has('team.manage') || has('team.remove');

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <Link
          className="text-sm font-medium text-slate-600 hover:underline"
          href="/dashboard"
        >
          ← Business dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-300 uppercase">
            People and access
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Employees &amp; roles</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Manage active memberships, multi-role access and company-defined
            permissions. Every change uses the existing tenant-scoped database
            functions, including their owner protections and audit events.
          </p>
        </header>
        {canViewTeam && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Employee directory</h2>
              <p className="text-sm text-slate-500">
                {members.length} memberships
              </p>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Registered user identifiers are shown until a verified,
              email-based invitation and profile directory are available.
            </p>
            {members.length ? (
              <div className="mt-5 grid gap-4">
                {members.map((member) => (
                  <article
                    key={member.id}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold break-all">
                          {member.user_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {member.branch_id
                            ? `Branch: ${branches.find((branch) => branch.id === member.branch_id)?.name ?? member.branch_id}`
                            : 'Organization-wide membership'}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">
                        {member.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignments
                        .filter(
                          (assignment) =>
                            assignment.membership_id === member.id,
                        )
                        .map((assignment) => (
                          <span
                            key={`${assignment.role_id}-${assignment.branch_id ?? 'org'}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs"
                          >
                            {roles.find(
                              (role) => role.id === assignment.role_id,
                            )?.name ?? 'Assigned role'}
                            {assignment.branch_id
                              ? ' · branch-scoped'
                              : ' · organization'}
                          </span>
                        ))}
                    </div>
                    {canChangeStatus && (
                      <ActionForm
                        action={changeMembershipStatus}
                        label="Update access"
                      >
                        <input
                          type="hidden"
                          name="organizationId"
                          value={organizationId}
                        />
                        <input
                          type="hidden"
                          name="membershipId"
                          value={member.id}
                        />
                        <label className="grid gap-2 text-sm">
                          Membership status
                          <select
                            name="status"
                            defaultValue={member.status}
                            className="rounded-lg border border-slate-300 p-3"
                          >
                            <option
                              value="active"
                              disabled={!has('team.manage')}
                            >
                              Active
                            </option>
                            <option
                              value="suspended"
                              disabled={!has('team.manage')}
                            >
                              Suspended
                            </option>
                            <option
                              value="revoked"
                              disabled={!has('team.remove')}
                            >
                              Revoked
                            </option>
                          </select>
                        </label>
                      </ActionForm>
                    )}
                    {canAssign && roles.length > 0 && (
                      <ActionForm
                        action={changeMembershipRole}
                        label="Apply role change"
                      >
                        <input
                          type="hidden"
                          name="organizationId"
                          value={organizationId}
                        />
                        <input
                          type="hidden"
                          name="membershipId"
                          value={member.id}
                        />
                        <label className="grid gap-2 text-sm">
                          Role
                          <select
                            name="roleId"
                            required
                            className="rounded-lg border border-slate-300 p-3"
                          >
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm">
                          Grant scope
                          <select
                            name="branchId"
                            defaultValue=""
                            className="rounded-lg border border-slate-300 p-3"
                          >
                            <option value="">Organization-wide</option>
                            {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm">
                          Operation
                          <select
                            name="remove"
                            className="rounded-lg border border-slate-300 p-3"
                          >
                            <option value="false">Grant role</option>
                            <option value="true">
                              Remove role at selected scope
                            </option>
                          </select>
                        </label>
                      </ActionForm>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                No visible team members.
              </p>
            )}
          </section>
        )}
        {canInvite && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Invite employees by email</h2>
            <p className="text-sm text-slate-600">
              Invite a colleague without their Supabase user ID. Select the
              roles they will receive after signing in with the matching,
              verified email address. Only role permissions you may delegate are
              accepted.
            </p>
            <ActionForm
              action={inviteEmployeeByEmail}
              label="Send employee invitation"
            >
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <label className="grid gap-2 text-sm font-medium">
                Employee email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="colleague@example.com"
                  className="w-full rounded-lg border border-slate-300 p-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Assigned branch (optional)
                <select
                  name="branchId"
                  defaultValue=""
                  className="rounded-lg border border-slate-300 p-3"
                >
                  <option value="">Organization-wide</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="rounded-xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-semibold">
                  Assign one or more roles
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {roles
                    .filter((role) => !role.is_owner)
                    .map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="roleIds"
                          value={role.id}
                          className="h-4 w-4"
                        />
                        {role.name}
                      </label>
                    ))}
                </div>
              </fieldset>
            </ActionForm>
            <h3 className="text-lg font-semibold">Invitation history</h3>
            {invitations.length ? (
              <div className="space-y-3">
                {invitations.map((invite) => (
                  <article
                    key={invite.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <p className="break-all text-sm font-semibold">
                      {invite.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {invite.status} · email {invite.mailStatus} ·{' '}
                      {invite.roleIds.length} roles · expires{' '}
                      {new Date(invite.expiresAt).toLocaleDateString('en-IN')}
                    </p>
                    {['pending', 'expired'].includes(invite.status) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ActionForm
                          action={resendEmployeeEmail}
                          label="Resend invitation"
                        >
                          <input
                            type="hidden"
                            name="organizationId"
                            value={organizationId}
                          />
                          <input
                            type="hidden"
                            name="inviteId"
                            value={invite.id}
                          />
                        </ActionForm>
                        <ActionForm
                          action={revokeEmployeeEmail}
                          label="Revoke invitation"
                        >
                          <input
                            type="hidden"
                            name="organizationId"
                            value={organizationId}
                          />
                          <input
                            type="hidden"
                            name="inviteId"
                            value={invite.id}
                          />
                        </ActionForm>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No email invitations yet.
              </p>
            )}
          </section>
        )}
        {canViewRoles && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Role permissions</h2>
            <p className="mt-2 text-sm text-slate-600">
              These permissions come from your existing organization roles. Plan
              entitlements and project assignments are enforced separately.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {roles.map((role) => (
                <article
                  key={role.id}
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <h3 className="font-semibold">{role.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {role.key}
                    {role.is_owner ? ' · Owner-protected' : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {grants
                      .filter((grant) => grant.role_id === role.id)
                      .map((grant) => {
                        const permission = permissions.find(
                          (item) => item.id === grant.permission_id,
                        );
                        return (
                          <span
                            key={grant.permission_id}
                            className="rounded-md bg-slate-100 px-2 py-1 text-xs"
                          >
                            {permission?.key ?? 'Unknown grant'}
                          </span>
                        );
                      })}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {canCreateRoles && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Create a custom role</h2>
            <p className="mt-2 text-sm text-slate-600">
              Select least-privilege capabilities. The checked role-management
              operation prevents escalation and protects the Owner role.
            </p>
            <ActionForm action={createCustomRole} label="Save custom role">
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Role key
                  <input
                    name="key"
                    required
                    minLength={2}
                    maxLength={64}
                    pattern="[a-z][a-z0-9_]*"
                    placeholder="site_engineer"
                    className="rounded-lg border border-slate-300 p-3"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Display name
                  <input
                    name="name"
                    required
                    maxLength={100}
                    placeholder="Site Engineer"
                    className="rounded-lg border border-slate-300 p-3"
                  />
                </label>
              </div>
              <fieldset className="rounded-xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-semibold">
                  Allowed permissions
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {permissions.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <input
                        className="mt-0.5 h-4 w-4"
                        name="permissions"
                        type="checkbox"
                        value={permission.key}
                      />
                      <span>
                        <strong className="block">{permission.key}</strong>
                        {permission.description}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </section>
        )}
        <p className="text-sm text-slate-500">
          Project and site restriction controls, staff email invitations and
          activity timelines will be added only with matching RLS and server
          authorization. Role labels never grant access by themselves.
        </p>
      </div>
    </main>
  );
}
