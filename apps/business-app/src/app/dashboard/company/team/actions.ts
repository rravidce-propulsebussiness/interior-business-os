'use server';

import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { DomainError, safeFailure } from '@business-os/shared';

import { getRolePreset } from './presets';

type FormState = { message: string };

async function authorizedWorkspace(organizationId: string, permission: string) {
  const current = await activeOrganization();
  if (!current || current.organizationId !== organizationId)
    throw new DomainError('FORBIDDEN');
  const { authorization, repository } = await serverServices();
  await authorization.requirePermission(organizationId, permission);
  return repository;
}

function refreshTeam() {
  revalidatePath('/dashboard/company/team');
  revalidatePath('/dashboard');
}

/** Never let a team-management action disable the caller or modify an owner.
 * The database RPC has the same protection; this check also covers projects
 * that have not yet applied the latest migration.
 */
async function requireEditableEmployee(
  organizationId: string,
  membershipId: string,
) {
  const { client, authorization } = await serverServices();
  const actor = await authorization.requireAuthenticatedUser();
  const { data: member, error: membershipError } = await client
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('id', membershipId)
    .maybeSingle();
  if (membershipError || !member || member.user_id === actor.id)
    throw new DomainError('FORBIDDEN');

  const { data: ownerRoles, error: rolesError } = await client
    .from('roles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_owner', true);
  if (rolesError) throw new DomainError('FORBIDDEN');
  const ownerRoleIds = (ownerRoles ?? []).map((role) => role.id);
  if (ownerRoleIds.length > 0) {
    const { data: existingOwnerAssignment, error: assignmentError } =
      await client
        .from('membership_roles')
        .select('role_id')
        .eq('organization_id', organizationId)
        .eq('membership_id', membershipId)
        .in('role_id', ownerRoleIds)
        .limit(1);
    if (assignmentError || (existingOwnerAssignment?.length ?? 0) > 0)
      throw new DomainError('FORBIDDEN');
  }
}

export async function inviteRegisteredMember(
  _state: FormState,
  form: FormData,
) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'team.invite');
    const branchId = String(form.get('branchId') ?? '').trim();
    await repository.inviteMember(organizationId, {
      userId: String(form.get('userId') ?? '').trim(),
      ...(branchId ? { branchId } : {}),
    });
    refreshTeam();
    return {
      message:
        'Membership invitation created for the registered account. The member must accept it.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function changeMembershipStatus(
  _state: FormState,
  form: FormData,
) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const status = String(form.get('status') ?? '');
    const repository = await authorizedWorkspace(
      organizationId,
      status === 'revoked' ? 'team.remove' : 'team.manage',
    );
    const membershipId = String(form.get('membershipId') ?? '');
    await requireEditableEmployee(organizationId, membershipId);
    await repository.setMembershipStatus(organizationId, {
      membershipId,
      status,
    });
    refreshTeam();
    return { message: 'Employee access updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function changeMembershipRole(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'team.manage');
    await authorizedWorkspace(organizationId, 'role.manage');
    const branchId = String(form.get('branchId') ?? '').trim();
    const membershipId = String(form.get('membershipId') ?? '');
    await requireEditableEmployee(organizationId, membershipId);
    await repository.setMemberRole(organizationId, {
      membershipId,
      roleId: String(form.get('roleId') ?? ''),
      ...(branchId ? { branchId } : {}),
      remove: String(form.get('remove') ?? '') === 'true',
    });
    refreshTeam();
    return { message: 'Employee role assignment updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function createCustomRole(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'role.manage');
    const roleId = String(form.get('roleId') ?? '').trim();
    await repository.saveRole(organizationId, {
      ...(roleId ? { id: roleId } : {}),
      key: String(form.get('key') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      permissions: form
        .getAll('permissions')
        .filter((value): value is string => typeof value === 'string'),
    });
    refreshTeam();
    return { message: 'Custom role saved. Assign it to an employee below.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function inviteEmployeeByEmail(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'team.invite');
    await authorizedWorkspace(organizationId, 'role.manage');
    const branchId = String(form.get('branchId') ?? '').trim();
    await repository.createEmployeeEmailInvitation(organizationId, {
      email: String(form.get('email') ?? '').trim(),
      roleIds: form
        .getAll('roleIds')
        .filter((value): value is string => typeof value === 'string'),
      ...(branchId ? { branchId } : {}),
    });
    refreshTeam();
    return {
      message:
        'Invitation queued. Delivery status is shown below; email delivery requires the configured worker.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function resendEmployeeEmail(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'team.invite');
    await repository.resendEmployeeInvitation(
      organizationId,
      String(form.get('inviteId') ?? ''),
    );
    refreshTeam();
    return { message: 'Invitation email queued again.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function revokeEmployeeEmail(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'team.invite');
    await repository.revokeEmployeeInvitation(
      organizationId,
      String(form.get('inviteId') ?? ''),
    );
    refreshTeam();
    return { message: 'Invitation revoked.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function createRoleFromPreset(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const repository = await authorizedWorkspace(organizationId, 'role.manage');
    const preset = getRolePreset(String(form.get('presetKey') ?? ''));
    if (!preset) throw new DomainError('VALIDATION_FAILED');
    // Permission keys are server-defined and cannot be forged by the client.
    // save_role rechecks the actor's authority on every permission.
    await repository.saveRole(organizationId, {
      key: preset.key,
      name: preset.name,
      permissions: [...preset.permissions],
    });
    refreshTeam();
    return {
      message:
        'Role preset installed. It remains editable using the existing permission controls.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
