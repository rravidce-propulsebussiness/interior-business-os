'use server';
import { redirect } from 'next/navigation';
import { createPublicDatabase } from '@business-os/database/server';
import { operationalLog } from '@business-os/shared/runtime';
import {
  completeRecovery,
  newPasswordSchema,
  recoveryRequestMessage,
  resetRequestSchema,
} from './recovery-service';
import {
  clearRecoveryCookies,
  pendingRecovery,
  recoveryConfiguration,
} from './recovery-server';

function logFailure(event: string) {
  operationalLog({
    level: 'error',
    service: 'authentication',
    event,
    requestId: crypto.randomUUID(),
    errorCode: 'RECOVERY_OPERATION_FAILED',
  });
}
export async function requestPasswordReset(
  _state: { message: string },
  form: FormData,
) {
  const input = resetRequestSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { message: 'Enter a valid email address.' };
  try {
    const { origin } = recoveryConfiguration();
    const { error } = await createPublicDatabase().auth.resetPasswordForEmail(
      input.data.email,
      { redirectTo: `${origin}/auth/recovery` },
    );
    if (error) logFailure('auth.recovery.request.failed');
  } catch {
    logFailure('auth.recovery.request.failed');
  }
  // Identical message for existing/missing users, provider failures and rate limits.
  return { message: recoveryRequestMessage };
}
export async function setRecoveryPassword(
  _state: { message: string },
  form: FormData,
) {
  const input = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: 'Use matching passwords with 12 to 128 characters.' };
  const token = await pendingRecovery();
  if (!token)
    return {
      message: 'This reset link is invalid or expired. Request a new link.',
    };
  let result: Awaited<ReturnType<typeof completeRecovery>> = 'failed';
  try {
    result = await completeRecovery(
      createPublicDatabase().auth,
      token,
      input.data.password,
    );
  } catch {
    result = 'failed';
  } finally {
    await clearRecoveryCookies();
  }
  if (result === 'updated') redirect('/login?recovery=complete');
  if (result === 'invalid')
    return {
      message:
        'This reset link is invalid, expired or already used. Request a new link.',
    };
  logFailure('auth.recovery.complete.failed');
  return {
    message:
      result === 'logout_failed'
        ? 'Your password changed, but session revocation could not be confirmed. Contact support before continuing.'
        : 'Recovery could not be completed. Request a new link or contact support.',
  };
}
