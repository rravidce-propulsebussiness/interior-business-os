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
    revalidatePath(`/admin/organizations/${id}`);
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
    const requestedPlanId = form.get('planId');
    if (typeof requestedPlanId === 'string' && requestedPlanId) {
      const selectedPlan = (await repository.plans()).find((p) => p.id === requestedPlanId);
      if (!selectedPlan) throw new Error('Unavailable plan');
      if (['website_basic','propulse_growth','propulse_scale','propulse_managed']
        .includes(selectedPlan.key)) {
        return { message: 'This plan needs payment verification or verified ProPulse membership. Use the dedicated activation workflow.' };
      }
    }
    await repository.setOrganization({
      organizationId: id,
      status: form.get('status'),
      planId: form.get('planId') || null,
    });
    revalidatePath('/admin');
    revalidatePath(`/admin/organizations/${id}`);
    return { message: 'Organization updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
