'use server';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export async function submitCompanyApplication(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();
    const industries = form
      .getAll('industries')
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim());
    const planId = String(form.get('planId') ?? '').trim();
    await repository.submitCompanyApplication({
      name: String(form.get('name') ?? '').trim(),
      slug: String(form.get('slug') ?? '').trim(),
      legalName: String(form.get('legalName') ?? '').trim(),
      country: String(form.get('country') ?? '').trim().toUpperCase(),
      currency: String(form.get('currency') ?? '').trim().toUpperCase(),
      timezone: String(form.get('timezone') ?? '').trim(),
      industries,
      ...(planId ? { planId } : {}),
    });
    revalidatePath('/dashboard/company/apply');
    return {
      message:
        'Application submitted for review. Your company will appear in the dashboard after approval.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
