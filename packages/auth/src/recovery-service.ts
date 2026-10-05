import { z } from 'zod';

export const resetRequestSchema = z.object({ email: z.email().max(254) });
export const newPasswordSchema = z
  .object({
    password: z.string().min(12).max(128),
    confirmation: z.string().min(12).max(128),
  })
  .refine((input) => input.password === input.confirmation);
export const recoveryRequestMessage =
  'If an account exists, a password reset email will be sent. Please wait before requesting another link.';
export interface RecoveryProvider {
  verifyOtp(input: { token_hash: string; type: 'recovery' }): Promise<{
    data: {
      user: { id: string } | null;
      session: { access_token: string; user: { id: string } } | null;
    };
    error: unknown;
  }>;
  updateUser(input: {
    password: string;
  }): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  signOut(input: { scope: 'global' }): Promise<{ error: unknown }>;
}
/** Verify the single-use provider token immediately before changing the recovered user's password. */
export async function completeRecovery(
  provider: RecoveryProvider,
  token: string,
  password: string,
) {
  let verified = false;
  let result: 'updated' | 'invalid' | 'failed' | 'logout_failed' = 'failed';
  try {
    const auth = await provider.verifyOtp({
      token_hash: token,
      type: 'recovery',
    });
    if (
      auth.error ||
      !auth.data.session?.access_token ||
      !auth.data.user ||
      auth.data.session.user.id !== auth.data.user.id
    )
      return 'invalid' as const;
    verified = true;
    const update = await provider.updateUser({ password });
    result =
      !update.error && update.data.user?.id === auth.data.user.id
        ? 'updated'
        : 'failed';
  } catch {
    result = 'failed';
  } finally {
    if (verified) {
      try {
        if (
          (await provider.signOut({ scope: 'global' })).error &&
          result === 'updated'
        )
          result = 'logout_failed';
      } catch {
        if (result === 'updated') result = 'logout_failed';
      }
    }
  }
  return result;
}
