'use server';

import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export async function createPlatformPlan(_state: { message: string }, form: FormData) {
  try {
    const s = await serverServices();
    await s.authorization.requirePlatformPermission('platform.entitlements.manage');
    const key = String(form.get('key') ?? '').trim().toLowerCase();
    const name = String(form.get('name') ?? '').trim();
    const modules = form.getAll('module').filter((value): value is string => typeof value === 'string');
    if (!/^[a-z][a-z0-9_-]{1,47}$/.test(key) || name.length < 2 || name.length > 100)
      return { message: 'Enter a plan key (2–48 lowercase letters, numbers, - or _) and a valid display name.' };
    if (!modules.length) return { message: 'Select at least one module.' };

    const allowedModules = new Set((await s.repository.modules()).map((mod) => mod.key));
    if (modules.some((module) => !allowedModules.has(module)))
      return { message: 'An unrecognized module was selected. Reload and try again.' };

    await s.repository.createSubscriptionPlan({ key, name, modules: [...new Set(modules)] });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/control/memberships');
    revalidatePath('/dashboard/organizations');
    return { message: `Membership plan "${name}" created.` };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
