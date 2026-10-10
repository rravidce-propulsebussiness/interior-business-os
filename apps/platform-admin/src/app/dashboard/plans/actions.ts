'use server';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export async function createSubscriptionPlan(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requirePlatformPermission('platform.entitlements.manage');
    const modules = form.getAll('modules').filter((value): value is string => typeof value === 'string');
    await repository.createSubscriptionPlan({
      key: String(form.get('key') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      modules,
    });
    revalidatePath('/dashboard/plans');
    return { message: 'New subscription plan saved. It is available for new approved organizations.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
