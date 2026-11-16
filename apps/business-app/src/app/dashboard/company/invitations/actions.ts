'use server';

import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export async function acceptEmployeeEmailInvitation(
  _state: { message: string },
  form: FormData,
) {
  void _state;
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();
    await repository.acceptEmployeeInvitation(
      String(form.get('inviteId') ?? ''),
    );
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/company/invitations');
    return {
      message:
        'Invitation accepted. Open your Business dashboard to select the company.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function acceptEmployeeInvitationByCode(
  _state: { message: string },
  form: FormData,
) {
  void _state;
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();
    const code = String(form.get('code') ?? '').trim();
    if (code.length < 32 || code.length > 50)
      return { message: 'Enter the complete invitation code.' };
    await repository.acceptEmployeeInvitationCode(code);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/company/invitations');
    return { message: 'Access activated. Open your dashboard to continue.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
