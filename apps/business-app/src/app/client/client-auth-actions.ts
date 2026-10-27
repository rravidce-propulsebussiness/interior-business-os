'use server';

import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { signupSchema, safeFailure } from '@business-os/shared';

/** Client signup never creates a company or grants permissions. An explicit
 * owner invitation and the same verified auth email are required at every
 * client portal RPC. This callback goes to /client, not the owner dashboard.
 */
export async function clientSignUp(
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  try {
    if (!isSupabaseConfigured())
      return {
        message:
          'Account registration is temporarily unavailable. Please contact your project owner.',
      };
    const input = signupSchema.parse(Object.fromEntries(form));
    const database = await createServerDatabase();
    const origin = publicAuthOrigin('http://localhost:3000');
    const confirm = new URL('/auth/callback', origin);
    confirm.searchParams.set('audience', 'client');
    const { error } = await database.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: confirm.toString(),
      },
    });
    if (error) {
      if (error.status === 429)
        return {
          message:
            'Too many registration attempts. Wait a few minutes and try again.',
        };
      return {
        message:
          'Registration could not be completed. Please check your details or use Google sign-in.',
      };
    }
    return {
      message:
        'Check your email to verify your account, then sign in. If you are already registered, choose Sign in.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
