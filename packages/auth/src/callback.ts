import 'server-only';
import { NextResponse } from 'next/server';
import { createServerDatabase } from '@business-os/database/server';
import { publicAuthOrigin } from './origin';
export async function authCallback(request: Request) {
  const url = new URL(request.url);
  const origin = publicAuthOrigin(request.url);
  const code = url.searchParams.get('code');
  const hash = url.searchParams.get('token_hash');
  const client = await createServerDatabase();
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/dashboard', origin));
  }
  // Only email confirmation is supported here; do not accept arbitrary redirect targets or OTP types.
  if (hash && url.searchParams.get('type') === 'email') {
    const { error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: 'email',
    });
    if (!error) return NextResponse.redirect(new URL('/dashboard', origin));
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', origin));
}
