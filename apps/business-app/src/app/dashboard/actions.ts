'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';
export async function provisionOrganization(
  _state: { message: string },
  form: FormData,
) {
  let id: string;
  try {
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();
    id = await repository.createOrganization({
      name: form.get('name'),
      slug: form.get('slug'),
      currency: form.get('currency'),
      country: form.get('country'),
      timezone: form.get('timezone'),
      ...(form.get('industryId') ? { industryId: form.get('industryId') } : {}),
    });
  } catch (error) {
    return { message: safeFailure(error).message };
  }
  (await cookies()).set('business-os-organization', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/dashboard');
}
