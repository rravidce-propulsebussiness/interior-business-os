import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  openRecoveryToken,
  sealRecoveryToken,
  validRecoveryToken,
} from './recovery-token';

export const recoveryCookie = 'business-os-recovery';
export function recoveryConfiguration() {
  const origin = new URL(process.env.APP_ORIGIN ?? '');
  const local =
    process.env.APP_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    (!local && origin.protocol !== 'https:') ||
    (local && !['http:', 'https:'].includes(origin.protocol)) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('APP_ORIGIN is required for recovery');
  const key = process.env.AUTH_RECOVERY_SIGNING_KEY ?? '';
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new Error('AUTH_RECOVERY_SIGNING_KEY is required');
  return { origin: origin.origin, key, secure: origin.protocol === 'https:' };
}
export async function pendingRecovery() {
  try {
    const configuration = recoveryConfiguration();
    return openRecoveryToken(
      (await cookies()).get(recoveryCookie)?.value,
      configuration.key,
      configuration.origin,
    );
  } catch {
    return null;
  }
}
/** GET never verifies/consumes the OTP, so email-link scanners cannot reset/sign in a user. */
export async function recoveryLanding(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token_hash') ?? '';
  const headers = {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  };
  try {
    const configuration = recoveryConfiguration();
    const response = NextResponse.redirect(
      new URL('/reset-password', configuration.origin),
      { status: 303, headers },
    );
    if (
      !validRecoveryToken(token) ||
      url.searchParams.get('type') !== 'recovery'
    ) {
      response.cookies.set(recoveryCookie, '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: configuration.secure,
      });
    } else {
      response.cookies.set(
        recoveryCookie,
        sealRecoveryToken(token, configuration.key, configuration.origin),
        {
          maxAge: 600,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: configuration.secure,
        },
      );
    }
    return response;
  } catch {
    return new Response('Password recovery is unavailable. Contact support.', {
      status: 503,
      headers,
    });
  }
}
export async function clearRecoveryCookies() {
  const store = await cookies();
  store.delete(recoveryCookie);
  store.delete('business-os-organization');
  // Recovery uses an anonymous in-memory client; also clear any previous browser session.
  let host: string | undefined;
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split(
      '.',
    )[0];
  } catch {
    return;
  }
  const prefix = `sb-${host}-auth-token`;
  for (const cookie of store.getAll())
    if (
      cookie.name === prefix ||
      cookie.name.startsWith(`${prefix}.`) ||
      cookie.name === `${prefix}-code-verifier`
    )
      store.delete(cookie.name);
}
