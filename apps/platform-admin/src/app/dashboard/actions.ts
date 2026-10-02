'use server';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure, idSchema } from '@business-os/shared';
export async function changeEntitlement(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.entitlements.manage',
    );
    const id = idSchema.parse(form.get('organizationId'));
    await repository.setEntitlement(id, {
      moduleKey: form.get('moduleKey'),
      enabled: form.get('enabled') === 'true',
      source: 'manual',
    });
    revalidatePath(`/dashboard/organizations/${id}`);
    return { message: 'Entitlement updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function changeOrganization(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const id = idSchema.parse(form.get('organizationId'));
    await repository.setOrganization({
      organizationId: id,
      status: form.get('status'),
      planId: form.get('planId') || null,
    });
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/organizations/${id}`);
    return { message: 'Organization updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
