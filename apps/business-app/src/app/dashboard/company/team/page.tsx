import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { TeamAccessWorkspace } from './team-access-workspace';
import '../../owner-dashboard.css';
import '../../command-centre.css';

export const dynamic = 'force-dynamic';
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
  const { client, repository, authorization, user } = await pageServices();
  const currentUser = await authorization.requireAuthenticatedUser();
  const context = await activeOrganization();
  if (!context) notFound();
  const organizationId = context.organizationId;
  const has = (permission: string) =>
    canAccess(context, { organizationId, permission });
  const canViewTeam = has('team.view');
  const canViewRoles = has('role.view') || has('role.manage');
  if (!canViewTeam && !canViewRoles) notFound();

  // Existing company membership and permission sources are reused. This page
  // never creates a second employee record or edits private HR information.
  const [
    members,
    branches,
    roleResult,
    permissionResult,
    grantResult,
    assignmentResult,
    organization,
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
    client
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single(),
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
  const assignments = assignmentResult.data ?? [];
  const ownerRoleIds = new Set(
    roles.filter((r) => r.is_owner).map((r) => r.id),
  );
  const canInvite = has('team.invite') && has('role.manage');
  const invitationRows = canInvite
    ? await repository.employeeInvitations(organizationId)
    : [];
  const invitations = Array.isArray(invitationRows)
    ? invitationRows.filter(isInvitationRow)
    : [];

  // A readable profile name is displayed instead of raw internal UUIDs.
  // Profile RLS still decides whether each name is visible to this user.
  const profileResult = members.length
    ? await client
        .from('profiles')
        .select('id,full_name')
        .in(
          'id',
          members.map((m) => m.user_id),
        )
    : null;
  const nameById = new Map(
    (profileResult?.data ?? []).map((p) => [p.id, p.full_name]),
  );
  const mappedMembers = members.map((member) => ({
    id: member.id,
    userId: member.user_id,
    name:
      nameById.get(member.user_id)?.trim() ||
      'Member ' + member.user_id.slice(0, 8),
    branchId: member.branch_id,
    status: member.status,
    owner: assignments.some(
      (a) => a.membership_id === member.id && ownerRoleIds.has(a.role_id),
    ),
    protected:
      member.user_id === currentUser.id ||
      assignments.some(
        (a) => a.membership_id === member.id && ownerRoleIds.has(a.role_id),
      ),
  }));
  return (
    <OwnerShell
      companyName={organization.data?.name ?? 'Business OS'}
      accountLabel={(user.email ?? 'Account').split('@')[0] ?? 'Account'}
      accountEmail={user.email ?? ''}
      planLabel="Company workspace"
      navigation={ownerWorkspaceNavigation(context)}
      currentHref="/dashboard/company/team"
      search=""
      notificationsEnabled={has('notification.view')}
      dashboardBrand
    >
      <TeamAccessWorkspace
        organizationId={organizationId}
        members={mappedMembers}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        roles={roles}
        permissions={permissions}
        grants={(grantResult.data ?? []).map((g) => ({
          roleId: g.role_id,
          permissionId: g.permission_id,
        }))}
        assignments={assignments.map((a) => ({
          membershipId: a.membership_id,
          roleId: a.role_id,
          branchId: a.branch_id,
        }))}
        invitations={invitations}
        canViewTeam={canViewTeam}
        canViewRoles={canViewRoles}
        canChangeStatus={has('team.manage')}
        canRemove={has('team.remove')}
        canAssign={has('team.manage') && has('role.manage')}
        canInvite={canInvite}
        canCreateRoles={has('role.manage')}
        canOpenEmployees={has('team.manage')}
      />
    </OwnerShell>
  );
}
