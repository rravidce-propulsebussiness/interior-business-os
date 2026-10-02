'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import {
  loginSchema,
  signupSchema,
  safeFailure,
  DomainError,
} from '@business-os/shared';
import { serverServices } from './server';

export async function signIn(_state: { message: string }, form: FormData) {
  try {
    if (!isSupabaseConfigured())
      return {
        message: 'Authentication is not configured. Contact the administrator.',
      };
    const input = loginSchema.parse(Object.fromEntries(form));
    const client = await createServerDatabase();
    const { error } = await client.auth.signInWithPassword(input);
    if (error)
      return {
        message: 'Sign-in failed. Check your credentials or contact support.',
      };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
  redirect('/dashboard');
}
export async function signUp(_state: { message: string }, form: FormData) {
  try {
    if (!isSupabaseConfigured())
      return {
        message: 'Authentication is not configured. Contact the administrator.',
      };
    const input = signupSchema.parse(Object.fromEntries(form));
    const client = await createServerDatabase();
    const { error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName } },
    });
    if (error)
      return {
        message:
          'Registration could not be completed. Please try again or contact support.',
      };
    return {
      message:
        'Check your email to confirm your account, then sign in. If this account already exists, use sign in.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function signOut() {
  const client = await createServerDatabase();
  const { error } = await client.auth.signOut();
  if (error) throw new DomainError('INTERNAL_ERROR');
  (await cookies()).delete('business-os-organization');
  redirect('/login');
}
export async function switchOrganization(form: FormData) {
  const { authorization } = await serverServices();
  const id = await authorization.validateOrganizationSwitch(
    String(form.get('organizationId') ?? ''),
  );
  (await cookies()).set('business-os-organization', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/dashboard');
}
