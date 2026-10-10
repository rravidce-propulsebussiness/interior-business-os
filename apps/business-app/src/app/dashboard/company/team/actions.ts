'use server';

import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { DomainError, safeFailure } from '@business-os/shared';

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

export async function inviteRegisteredMember(_state: FormState, form: FormData) {
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
    return { message: 'Membership invitation created for the registered account. The member must accept it.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function changeMembershipStatus(_state: FormState, form: FormData) {
  void _state;
  try {
    const organizationId = String(form.get('organizationId') ?? '');
    const status = String(form.get('status') ?? '');
    const repository = await authorizedWorkspace(
      organizationId,
      status === 'revoked' ? 'team.remove' : 'team.manage',
    );
    await repository.setMembershipStatus(organizationId, {
      membershipId: String(form.get('membershipId') ?? ''),
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
    await repository.setMemberRole(organizationId, {
      membershipId: String(form.get('membershipId') ?? ''),
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
    await repository.saveRole(organizationId, {
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
