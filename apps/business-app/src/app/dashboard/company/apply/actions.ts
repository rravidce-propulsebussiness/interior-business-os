'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export type CompanyRegistrationState = {
  message: string;
  organizationId?: string;
  pendingReview?: boolean;
};

export async function submitCompanyApplication(
  _state: CompanyRegistrationState,
  form: FormData,
): Promise<CompanyRegistrationState> {
  void _state;
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();

    const industries = form
      .getAll('industries')
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
    if (industries.length === 0) {
      return { message: 'Choose at least one industry.' };
    }

    const result = await repository.selfRegisterCompany({
      name: String(form.get('name') ?? '').trim(),
      slug: String(form.get('slug') ?? '')
        .trim()
        .toLowerCase(),
      legalName: String(form.get('legalName') ?? '').trim(),
      country: String(form.get('country') ?? '')
        .trim()
        .toUpperCase(),
      currency: String(form.get('currency') ?? '')
        .trim()
        .toUpperCase(),
      timezone: String(form.get('timezone') ?? '').trim(),
      industries,
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/company/apply');
    if (result.status === 'approved' && result.organizationId) {
      // Use the new tenant on the next full-document navigation, even when
      // the account was previously a member of another organization.
      const jar = await cookies();
      const options = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      };
      jar.set('business-os-organization', result.organizationId, options);
      if (process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true') {
        jar.set(
          'business-os-workspace-route',
          String(form.get('slug') ?? '')
            .trim()
            .toLowerCase(),
          options,
        );
      }
      return {
        organizationId: result.organizationId,
        message: 'Your company is ready! Opening your dashboard…',
      };
    }
    return {
      message:
        'Your application has been submitted for review. We will activate the workspace when it is approved.',
      pendingReview: true,
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
