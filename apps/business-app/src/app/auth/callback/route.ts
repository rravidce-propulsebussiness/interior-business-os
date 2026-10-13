import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerDatabase } from '@business-os/database/server';
import { syncPropulseCompany } from '../propulse-company-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const startedPropulse =
    cookieStore.get('business-os-propulse-oauth')?.value === 'pending';
  const redirect = (destination: string) => {
    const response = NextResponse.redirect(
      new URL(destination, url.origin),
      303,
    );
    response.cookies.set('business-os-propulse-oauth', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/callback',
      maxAge: 0,
    });
    return response;
  };

  const client = await createServerDatabase();
  const code = url.searchParams.get('code');
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (startedPropulse) {
        const result = await syncPropulseCompany(
          data.user,
          data.session?.provider_token,
        );
        if ('organizationId' in result) {
          // Changing the selected company requires a fresh navigation.
          // The Supabase provider access token is never persisted here.
          cookieStore.set('business-os-organization', result.organizationId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
          });
          return redirect('/dashboard?propulse_sync=success');
        }
        return redirect('/dashboard?propulse_sync=' + result.status);
      }
      return redirect('/dashboard');
    }
  }
  // Preserve email confirmation, without accepting arbitrary redirect URLs.
  if (
    url.searchParams.get('token_hash') &&
    url.searchParams.get('type') === 'email'
  ) {
    const { error } = await client.auth.verifyOtp({
      token_hash: url.searchParams.get('token_hash')!,
      type: 'email',
    });
    if (!error) return redirect('/dashboard');
  }
  return redirect('/login?confirmation=failed');
}
