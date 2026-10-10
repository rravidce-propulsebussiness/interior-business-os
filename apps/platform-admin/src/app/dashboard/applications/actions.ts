'use server';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { idSchema, safeFailure } from '@business-os/shared';

export async function decideCompanyApplication(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const id = idSchema.parse(form.get('applicationId'));
    const action = form.get('decision');
    if (action !== 'approve' && action !== 'reject') {
      return { message: 'Choose an approval decision.' };
    }
    const note = String(form.get('note') ?? '').trim();
    await repository.decideCompanyApplication(id, action, note);
    revalidatePath('/dashboard/applications');
    revalidatePath('/dashboard/organizations');
    return {
      message:
        action === 'approve'
          ? 'Company approved and workspace provisioned.'
          : 'Application rejected and applicant status recorded.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function setCompanyOnboardingPolicy(
  _state: { message: string },
  form: FormData,
) {
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const requested = form.get('approvalRequired');
    if (requested !== 'true' && requested !== 'false') {
      return { message: 'Choose an explicit company approval setting.' };
    }
    await repository.setCompanyOnboardingPolicy(requested === 'true');
    revalidatePath('/dashboard/applications');
    return {
      message:
        requested === 'true'
          ? 'New companies now require platform review. Existing companies are unaffected.'
          : 'Legacy organization creation re-enabled for controlled rollback.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
